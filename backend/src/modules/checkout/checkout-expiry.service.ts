import type { ClientSession, Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { allocationService } from '../inventory/allocation.service.js'
import { couponGenerationAccess } from '../promotions/coupon-allocation.service.js'
import { expiredOrderAllocationAccess } from '../orders/order.service.js'
import { checkoutPaymentAccess } from '../payments/payment.service.js'
import { checkoutAllocationService } from './checkout-allocation.service.js'
import { createAuditWriter } from '../audit/audit.service.js'
export function checkoutExpiryService(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const stock = allocationService(connection, undefined, clock),
    coupon = couponGenerationAccess(connection),
    audit = createAuditWriter(connection)
  return {
    due: stock.due,
    async expire(session: ClientSession, orderId: string, generation: number) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const rows = await stock.generation(session, orderId, generation),
        now = clock(),
        first = rows[0]
      if (!first || rows.every((row) => row.status === 'released')) return false
      if (
        !first.heldAt ||
        !first.expiresAt ||
        first.expiresAt > now ||
        rows.some(
          (row) =>
            row.status !== 'held' ||
            row.heldAt?.getTime() !== first.heldAt?.getTime() ||
            row.expiresAt?.getTime() !== first.expiresAt?.getTime(),
        )
      )
        throw new ApiError('STATE_CONFLICT')
      const redemption = await coupon(session, orderId, generation)
      if (
        redemption &&
        (redemption.status !== 'held' ||
          redemption.heldAt?.getTime() !== first.heldAt.getTime() ||
          redemption.expiresAt?.getTime() !== first.expiresAt.getTime())
      )
        throw new ApiError('STATE_CONFLICT')
      const orderAccess = expiredOrderAllocationAccess(
        connection,
        checkoutPaymentAccess(connection).authorizeHoldExpiry,
      )
      const allocations = checkoutAllocationService(
        connection,
        stock,
        {
          async authorize(transaction, id, requestedGeneration, action) {
            const data = await orderAccess.authorize(transaction, id, requestedGeneration, action)
            if (
              data.pricing.items.length !== rows.length ||
              data.pricing.items.some(
                (item) =>
                  !rows.some(
                    (row) => row.variantId === item.variantId && row.quantity === item.quantity,
                  ),
              ) ||
              Boolean(data.coupon) !== Boolean(redemption)
            )
              throw new ApiError('STATE_CONFLICT')
            return data
          },
        },
        clock,
      )
      await allocations.apply(session, { orderId, generation, action: 'release_held' })
      await audit(session, {
        actorType: 'system',
        action: 'checkout.hold.expire',
        targetType: 'order',
        targetId: orderId,
        operationKey: `hold-expiry:${orderId}:${generation}`,
        occurredAt: now,
      })
      return true
    },
  }
}

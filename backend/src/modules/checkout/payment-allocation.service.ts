import type { ClientSession, Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { allocationService } from '../inventory/allocation.service.js'
import { couponGenerationAccess } from '../promotions/coupon-allocation.service.js'
import { createAuditWriter } from '../audit/audit.service.js'
import {
  checkoutAllocationBinding,
  checkoutAllocationService,
  type CheckoutAllocationAccess,
} from './checkout-allocation.service.js'
// Payment capacity preparation. The caller must fence current order/payment eligibility in this
// transaction. No financial-success writer; paid late recovery reuses this behind its own fence.
export function paymentAllocationService(
  connection: Connection,
  access: CheckoutAllocationAccess,
  clock: () => Date = () => new Date(),
) {
  const stock = allocationService(connection, undefined, clock),
    coupon = couponGenerationAccess(connection),
    audit = createAuditWriter(connection)
  return {
    async ensure(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const generation = await stock.latestGeneration(session, orderId)
      if (!generation) throw new ApiError('STATE_CONFLICT')
      const binding = parseInput(
          checkoutAllocationBinding,
          await access.authorize(session, orderId, generation, 'hold'),
        ),
        rows = await stock.generation(session, orderId, generation),
        redemption = await coupon(session, orderId, generation),
        now = clock(),
        first = rows[0]
      if (
        binding.orderId !== orderId ||
        binding.generation !== generation ||
        !Number.isFinite(now.getTime()) ||
        !first?.heldAt ||
        (first.status === 'held'
          ? !first.expiresAt || first.expiresAt.getTime() !== first.heldAt.getTime() + 900000
          : first.expiresAt !== undefined) ||
        first.heldAt > now ||
        rows.length !== binding.pricing.items.length ||
        rows.some(
          (row) =>
            row.status !== first.status ||
            row.heldAt?.getTime() !== first.heldAt?.getTime() ||
            row.expiresAt?.getTime() !== first.expiresAt?.getTime() ||
            !binding.pricing.items.some(
              (line) => line.variantId === row.variantId && line.quantity === row.quantity,
            ),
        ) ||
        Boolean(binding.coupon) !== Boolean(redemption) ||
        (redemption &&
          (redemption.status !== (first.status === 'released' ? 'released' : 'held') ||
            redemption.heldAt?.getTime() !== first.heldAt.getTime() ||
            redemption.expiresAt?.getTime() !== first.expiresAt?.getTime()))
      )
        throw new ApiError('STATE_CONFLICT')
      if (first.status === 'held' && first.expiresAt && first.expiresAt > now)
        return { generation, heldAt: first.heldAt, expiresAt: first.expiresAt }
      if (!['held', 'released'].includes(first.status) || generation >= Number.MAX_SAFE_INTEGER)
        throw new ApiError('STATE_CONFLICT')
      const allocations = checkoutAllocationService(connection, stock, access, () => now)
      if (first.status === 'held')
        await allocations.apply(session, { orderId, generation, action: 'release_held' })
      for (const item of binding.pricing.items)
        if ((await stock.available(session, item.variantId)) < item.quantity)
          throw new ApiError('OUT_OF_STOCK')
      const next = generation + 1
      const refreshed = await allocations.apply(session, {
        orderId,
        generation: next,
        action: 'hold',
      })
      const result = refreshed.inventory[0]
      if (!result?.heldAt || !result.expiresAt) throw new ApiError('STATE_CONFLICT')
      await audit(session, {
        actorType: 'system',
        action: 'checkout.hold.reacquire',
        targetType: 'order',
        targetId: orderId,
        operationKey: `payment-reacquire:${orderId}:${next}`,
        occurredAt: now,
      })
      return { generation: next, heldAt: result.heldAt, expiresAt: result.expiresAt }
    },
  }
}

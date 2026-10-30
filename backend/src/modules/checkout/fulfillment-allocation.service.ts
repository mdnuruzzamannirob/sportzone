import type { ClientSession, Connection } from 'mongoose'
import { allocationService } from '../inventory/allocation.service.js'
import { couponGenerationAccess } from '../promotions/coupon-allocation.service.js'
import { checkoutAllocationBinding } from './checkout-allocation.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
// Trusted lifecycle coordinator fences order and payment in the same transaction first.
export function fulfillmentAllocationService(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const stock = allocationService(connection, undefined, clock),
    coupon = couponGenerationAccess(connection)
  return async (session: ClientSession, raw: unknown, dispatch: boolean) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const binding = checkoutAllocationBinding.parse(raw),
      generation = await stock.latestGeneration(session, binding.orderId)
    if (!generation) throw new ApiError('STATE_CONFLICT')
    const rows = await stock.generation(session, binding.orderId, generation),
      redemption = await coupon(session, binding.orderId, generation)
    if (
      rows.length !== binding.pricing.items.length ||
      rows.some(
        (r) =>
          r.status !== 'committed' ||
          !binding.pricing.items.some(
            (i) => i.variantId === r.variantId && i.quantity === r.quantity,
          ),
      ) ||
      (binding.coupon
        ? redemption?.status !== 'redeemed' || redemption.couponId !== binding.coupon.couponId
        : Boolean(redemption))
    )
      throw new ApiError('STATE_CONFLICT')
    if (dispatch)
      for (const line of binding.pricing.items)
        await stock.ship(session, {
          orderId: binding.orderId,
          variantId: line.variantId,
          quantity: line.quantity,
          generation,
          operationKey: `shipment:${binding.orderId}:${generation}:${line.variantId}`,
          reason: 'Authorized whole-order shipment',
        })
  }
}

import type { ClientSession, Connection } from 'mongoose'
import { allocationService } from '../inventory/allocation.service.js'
import { couponGenerationAccess } from '../promotions/coupon-allocation.service.js'
import {
  checkoutAllocationBinding,
  checkoutAllocationService,
} from './checkout-allocation.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
export function cancellationAllocationService(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const stock = allocationService(connection, undefined, clock),
    coupon = couponGenerationAccess(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const binding = checkoutAllocationBinding.parse(raw),
      generation = await stock.latestGeneration(session, binding.orderId)
    if (!generation) throw new ApiError('STATE_CONFLICT')
    const rows = await stock.generation(session, binding.orderId, generation),
      redemption = await coupon(session, binding.orderId, generation),
      first = rows[0]
    if (
      !first ||
      rows.length !== binding.pricing.items.length ||
      rows.some(
        (r) =>
          r.status !== first.status ||
          !binding.pricing.items.some(
            (i) => i.variantId === r.variantId && i.quantity === r.quantity,
          ),
      ) ||
      Boolean(binding.coupon) !== Boolean(redemption) ||
      (binding.coupon && redemption?.couponId !== binding.coupon.couponId)
    )
      throw new ApiError('STATE_CONFLICT')
    if (first.status === 'released') {
      if (redemption && redemption.status !== 'released') throw new ApiError('STATE_CONFLICT')
      return
    }
    if (
      !['held', 'committed'].includes(first.status) ||
      (redemption && redemption.status !== (first.status === 'held' ? 'held' : 'redeemed'))
    )
      throw new ApiError('STATE_CONFLICT')
    const action = first.status === 'held' ? 'release_held' : 'release_committed'
    await checkoutAllocationService(
      connection,
      stock,
      {
        authorize: async (_session, id, gen, requested) => {
          if (id !== binding.orderId || gen !== generation || requested !== action)
            throw new ApiError('STATE_CONFLICT')
          return { ...binding, generation }
        },
      },
      clock,
    ).apply(session, { orderId: binding.orderId, generation, action })
  }
}

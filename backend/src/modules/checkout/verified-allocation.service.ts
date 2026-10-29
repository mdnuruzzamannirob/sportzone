import type { ClientSession, Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { allocationService } from '../inventory/allocation.service.js'
import { couponGenerationAccess } from '../promotions/coupon-allocation.service.js'
import {
  checkoutAllocationBinding,
  checkoutAllocationService,
} from './checkout-allocation.service.js'

// Called only by the verified receipt coordinator after fencing full funding, risk and order state.
// Expired/missing capacity stays on hold; no release/reacquisition is implied (P07-009).
export function verifiedAllocationService(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const stock = allocationService(connection, undefined, clock),
    coupon = couponGenerationAccess(connection)
  return {
    async commitLive(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const parsed = checkoutAllocationBinding.parse(raw),
        now = clock(),
        orderId = parsed.orderId
      const generation = await stock.latestGeneration(session, orderId)
      if (!generation) return false
      const rows = await stock.generation(session, orderId, generation),
        redemption = await coupon(session, orderId, generation)
      const first = rows[0]
      if (
        !Number.isFinite(now.getTime()) ||
        !first?.heldAt ||
        !first.expiresAt ||
        first.expiresAt.getTime() !== first.heldAt.getTime() + 900000
      )
        return false
      if (
        rows.length !== parsed.pricing.items.length ||
        rows.some(
          (row) =>
            row.heldAt?.getTime() !== first.heldAt?.getTime() ||
            row.expiresAt?.getTime() !== first.expiresAt?.getTime() ||
            row.status !== 'held' ||
            !row.expiresAt ||
            row.expiresAt <= now ||
            !parsed.pricing.items.some(
              (line) => line.variantId === row.variantId && line.quantity === row.quantity,
            ),
        ) ||
        Boolean(parsed.coupon) !== Boolean(redemption) ||
        (redemption &&
          (redemption.status !== 'held' ||
            redemption.heldAt?.getTime() !== first.heldAt?.getTime() ||
            redemption.expiresAt?.getTime() !== first.expiresAt?.getTime() ||
            !redemption.expiresAt ||
            redemption.expiresAt <= now))
      )
        return false
      const allocation = checkoutAllocationService(
        connection,
        stock,
        {
          authorize: async (_session, requested, gen, action) => {
            if (requested !== orderId || gen !== generation || action !== 'commit')
              throw new ApiError('STATE_CONFLICT')
            return { ...parsed, generation }
          },
        },
        () => now,
      )
      await allocation.apply(session, { orderId, generation, action: 'commit' })
      return true
    },
  }
}

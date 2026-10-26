import type { ClientSession, Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { allocationService } from '../inventory/allocation.service.js'
import { couponAllocationService } from '../promotions/coupon-allocation.service.js'
import { pricingInput } from '../promotions/pricing.schema.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const allocationAction = z.enum(['cod', 'hold', 'commit', 'release_held', 'release_committed'])
const command = z.strictObject({
  orderId: id,
  generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  action: allocationAction,
})
const binding = z.strictObject({
  orderId: id,
  placedAt: z.date().optional(),
  generation: z.int().min(1),
  userId: id.optional(),
  pricing: pricingInput.safeExtend({ coupon: z.undefined().optional() }),
  coupon: z
    .strictObject({
      couponId: id,
      code: z.string(),
      type: z.enum(['fixed', 'percentage']),
      value: z.int().min(1),
      version: z.int().nonnegative(),
      discountPoisha: z.int().nonnegative(),
      eligibleLineIds: z.array(id).min(1),
    })
    .optional(),
})
export type CheckoutAllocationAccess = {
  // Owning order/payment/cancellation services must authorize and fence the exact transition in this
  // transaction. Graph validity or a caller-provided order ID alone is never sufficient authority.
  authorize(
    session: ClientSession,
    orderId: string,
    generation: number,
    action: z.output<typeof allocationAction>,
  ): Promise<unknown>
}
export function checkoutAllocationService(
  connection: Connection,
  stock: Pick<ReturnType<typeof allocationService>, 'reserve' | 'commitCod' | 'commit' | 'release'>,
  access: CheckoutAllocationAccess,
  clock: () => Date = () => new Date(),
) {
  return {
    async apply(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const input = parseInput(command, raw),
        data = parseInput(
          binding,
          await access.authorize(session, input.orderId, input.generation, input.action),
        )
      if (data.orderId !== input.orderId || data.generation !== input.generation)
        throw new ApiError('STATE_CONFLICT')
      const heldAt =
          input.action === 'hold' && input.generation === 1 && data.placedAt
            ? data.placedAt
            : clock(),
        key = `allocation:${input.orderId}:${input.generation}:${input.action}`
      if (!Number.isFinite(heldAt.getTime())) throw new ApiError('STATE_CONFLICT')
      const inventory = []
      for (const line of [...data.pricing.items].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      )) {
        const item = {
          orderId: input.orderId,
          variantId: line.variantId,
          quantity: line.quantity,
          generation: input.generation,
          operationKey: key,
          reason: `Checkout allocation ${input.action}`,
        }
        const result =
          input.action === 'cod'
            ? await stock.commitCod(session, item)
            : input.action === 'hold'
              ? await stock.reserve(session, item, heldAt)
              : input.action === 'commit'
                ? await stock.commit(session, item)
                : await stock.release(
                    session,
                    item,
                    input.action === 'release_held' ? 'held' : 'committed',
                  )
        inventory.push(result)
      }
      let coupon:
        | Awaited<ReturnType<ReturnType<typeof couponAllocationService>['reserve']>>
        | undefined
      if (data.coupon) {
        const { couponId, ...termsSnapshot } = data.coupon
        const coupons = couponAllocationService(
          connection,
          {
            authorize: async (_session, orderId, requested) => {
              const expected = {
                cod: 'redeem_cod',
                hold: 'reserve',
                commit: 'commit',
                release_held: 'release_held',
                release_committed: 'release_redeemed',
              } as const
              if (orderId !== input.orderId || requested !== expected[input.action])
                throw new ApiError('STATE_CONFLICT')
              return {
                orderId,
                couponId,
                ...(data.userId ? { userId: data.userId } : {}),
                acceptedPricing: data.pricing,
                currentPricing: data.pricing,
                termsSnapshot,
              }
            },
          },
          clock,
        )
        const item = {
          couponId,
          orderId: input.orderId,
          generation: input.generation,
          operationKey: key,
        }
        coupon =
          input.action === 'cod'
            ? await coupons.redeemCod(session, item)
            : input.action === 'hold'
              ? await coupons.reserve(session, item, heldAt)
              : input.action === 'commit'
                ? await coupons.commit(session, item)
                : await coupons.release(
                    session,
                    item,
                    input.action === 'release_held' ? 'held' : 'redeemed',
                  )
      }
      // Replays return original clocks; all records in a generation must agree even after restart.
      if (input.action === 'hold') {
        const dates = [...inventory, ...(coupon ? [coupon] : [])]
        const first = dates[0]
        if (
          !first?.heldAt ||
          !first.expiresAt ||
          dates.some(
            (row) =>
              row.status !== 'held' ||
              row.heldAt?.getTime() !== first.heldAt?.getTime() ||
              row.expiresAt?.getTime() !== first.expiresAt?.getTime(),
          )
        )
          throw new ApiError('STATE_CONFLICT')
      }
      return { inventory, ...(coupon ? { coupon } : {}) }
    },
  }
}

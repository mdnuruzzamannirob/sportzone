import type { ClientSession } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { AuditAccess } from '../audit/audit.public.js'
import type { InventoryAllocationFactory } from '../inventory/inventory.public.js'
import type {
  CouponAllocationFactory,
  CouponGenerationReader,
} from '../promotions/promotion.public.js'
import type { OrderAllocationBindingSchema } from './order.schema.js'

type OrderAllocationAccess = {
  // Owning order/payment/cancellation services must authorize and fence the exact transition in this
  // transaction. Graph validity or a caller-provided order ID alone is never sufficient authority.
  authorize(
    session: ClientSession,
    orderId: string,
    generation: number,
    action: z.output<typeof allocationAction>,
  ): Promise<unknown>
}

const id = z.string().regex(/^[a-f0-9]{24}$/)

const allocationAction = z.enum(['cod', 'hold', 'commit', 'release_held', 'release_committed'])

const command = z.strictObject({
  orderId: id,
  generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  action: allocationAction,
})

function createOrderAllocationService(
  stock: Pick<
    ReturnType<InventoryAllocationFactory>,
    'reserve' | 'commitCod' | 'commit' | 'release'
  >,
  access: OrderAllocationAccess,
  moduleAccess: {
    createCouponAllocationService: CouponAllocationFactory
    schemaOrderAllocationBinding: OrderAllocationBindingSchema
  },
  clock: () => Date = () => new Date(),
) {
  return {
    async apply(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const input = parseInput(command, raw),
        data = parseInput(
          moduleAccess.schemaOrderAllocationBinding,
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
      let coupon: Awaited<ReturnType<ReturnType<CouponAllocationFactory>['reserve']>> | undefined
      if (data.coupon) {
        const { couponId, ...termsSnapshot } = data.coupon
        const coupons = moduleAccess.createCouponAllocationService(
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

function createCancellationAllocationService(
  moduleAccess: {
    createAllocationService: InventoryAllocationFactory
    couponGenerationAccess: CouponGenerationReader
    createCouponAllocationService: CouponAllocationFactory
    schemaOrderAllocationBinding: OrderAllocationBindingSchema
  },
  clock: () => Date = () => new Date(),
) {
  const stock = moduleAccess.createAllocationService(clock),
    coupon = moduleAccess.couponGenerationAccess
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const binding = moduleAccess.schemaOrderAllocationBinding.parse(raw),
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
    await createOrderAllocationService(
      stock,
      {
        authorize: async (_session, id, gen, requested) => {
          if (id !== binding.orderId || gen !== generation || requested !== action)
            throw new ApiError('STATE_CONFLICT')
          return { ...binding, generation }
        },
      },
      moduleAccess,
      clock,
    ).apply(session, { orderId: binding.orderId, generation, action })
  }
}

// Trusted lifecycle coordinator fences order and payment in the same transaction first.
function createFulfillmentAllocationService(
  moduleAccess: {
    createAllocationService: InventoryAllocationFactory
    couponGenerationAccess: CouponGenerationReader
    schemaOrderAllocationBinding: OrderAllocationBindingSchema
  },
  clock: () => Date = () => new Date(),
) {
  const stock = moduleAccess.createAllocationService(clock),
    coupon = moduleAccess.couponGenerationAccess
  return async (session: ClientSession, raw: unknown, dispatch: boolean) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const binding = moduleAccess.schemaOrderAllocationBinding.parse(raw),
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

// Payment capacity preparation. The caller must fence current order/payment eligibility in this
// transaction. No financial-success writer; paid late recovery reuses this behind its own fence.
function createPaymentAllocationService(
  access: OrderAllocationAccess,
  auditAccess: AuditAccess,
  moduleAccess: {
    createAllocationService: InventoryAllocationFactory
    couponGenerationAccess: CouponGenerationReader
    createCouponAllocationService: CouponAllocationFactory
    schemaOrderAllocationBinding: OrderAllocationBindingSchema
  },
  clock: () => Date = () => new Date(),
) {
  const stock = moduleAccess.createAllocationService(clock),
    coupon = moduleAccess.couponGenerationAccess,
    audit = auditAccess.write
  return {
    async ensure(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const generation = await stock.latestGeneration(session, orderId)
      if (!generation) throw new ApiError('STATE_CONFLICT')
      const binding = parseInput(
          moduleAccess.schemaOrderAllocationBinding,
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
      const allocations = createOrderAllocationService(stock, access, moduleAccess, () => now)
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

// Called only by the verified receipt coordinator after fencing full funding, risk and order state.
// Live commitment is atomic with funding. Late recovery runs in a separate fenced transaction so
// capacity failure never rolls back a separately committed verified receipt.
function createVerifiedAllocationService(
  auditAccess: AuditAccess,
  moduleAccess: {
    createAllocationService: InventoryAllocationFactory
    couponGenerationAccess: CouponGenerationReader
    createCouponAllocationService: CouponAllocationFactory
    schemaOrderAllocationBinding: OrderAllocationBindingSchema
  },
  clock: () => Date = () => new Date(),
) {
  const stock = moduleAccess.createAllocationService(clock),
    coupon = moduleAccess.couponGenerationAccess
  const service = {
    async ensureCommitted(session: ClientSession, raw: unknown): Promise<boolean> {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const binding = moduleAccess.schemaOrderAllocationBinding.parse(raw),
        orderId = binding.orderId
      const generation = await stock.latestGeneration(session, orderId)
      if (!generation) return false
      const rows = await stock.generation(session, orderId, generation),
        redemption = await coupon(session, orderId, generation)
      if (
        rows.length === binding.pricing.items.length &&
        rows.every(
          (row) =>
            row.status === 'committed' &&
            binding.pricing.items.some(
              (line) => line.variantId === row.variantId && line.quantity === row.quantity,
            ),
        ) &&
        (binding.coupon ? redemption?.status === 'redeemed' : !redemption)
      )
        return true
      if (await service.commitLive(session, binding)) return true
      const preparation = createPaymentAllocationService(
        {
          authorize: async (_session, id, gen, action) => {
            if (id !== orderId || !['hold', 'release_held'].includes(action))
              throw new ApiError('STATE_CONFLICT')
            return { ...binding, generation: gen }
          },
        },
        auditAccess,
        moduleAccess,
        clock,
      )
      await preparation.ensure(session, orderId)
      return service.commitLive(session, binding)
    },
    async commitLive(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const parsed = moduleAccess.schemaOrderAllocationBinding.parse(raw),
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
      const allocation = createOrderAllocationService(
        stock,
        {
          authorize: async (_session, requested, gen, action) => {
            if (requested !== orderId || gen !== generation || action !== 'commit')
              throw new ApiError('STATE_CONFLICT')
            return { ...parsed, generation }
          },
        },
        moduleAccess,
        () => now,
      )
      await allocation.apply(session, { orderId, generation, action: 'commit' })
      return true
    },
  }
  return service
}

export type { OrderAllocationAccess }
export {
  createCancellationAllocationService,
  createFulfillmentAllocationService,
  createOrderAllocationService,
  createPaymentAllocationService,
  createVerifiedAllocationService,
}

import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { type ClientSession, type Connection, type HydratedDocument, Types } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import type {
  AdminAccountAccess,
  CheckoutAccess,
  CheckoutCredentials,
} from '../auth/auth.public.js'
import type { CatalogCheckoutAccess } from '../catalog/catalog.public.js'

import type { CheckoutDeliveryAccess } from '../delivery/delivery.public.js'
import { calculatePricing } from './pricing.js'
import type { pricingInput } from './pricing.schema.js'
import { type CouponRedemption, couponModels } from './promotion.model.js'
import { verifyCouponPersistence } from './promotion.persistence.js'
import {
  couponAdmin,
  couponDeactivate,
  couponEligibilityInput,
  couponHistory,
  couponHistoryQuery,
  couponInput,
  couponListQuery,
  couponParams,
  couponPatch,
  couponPreviewInput,
  couponPreviewResult,
  parseCouponRevision,
} from './promotion.schema.js'

function createCouponAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const models = couponModels(connection)
  type Coupon = ReturnType<typeof models.coupons.hydrate>
  function view(row: Coupon) {
    return parseInput(couponAdmin, {
      id: row._id.toHexString(),
      code: row.codeNormalized,
      type: row.type,
      value: row.value,
      minEligibleSubtotalPoisha: row.minEligibleSubtotalPoisha,
      startsAt: row.startsAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: row.status,
      heldCount: row.heldCount,
      redeemedCount: row.redeemedCount,
      termsVersion: row.termsVersion,
      revision: row.revision,
      ...(row.overallLimit != null ? { overallLimit: row.overallLimit } : {}),
      ...(row.perCustomerLimit != null ? { perCustomerLimit: row.perCustomerLimit } : {}),
      ...(row.eligibleProductIds ? { eligibleProductIds: row.eligibleProductIds.map(String) } : {}),
      ...(row.eligibleCategoryIds
        ? { eligibleCategoryIds: row.eligibleCategoryIds.map(String) }
        : {}),
    })
  }
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  async function verify() {
    try {
      await verifyCouponPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function write(
    token: string | undefined,
    raw: unknown,
    couponId?: string,
    match?: string,
    reason?: string,
  ) {
    const operationKey = randomUUID()
    const expected = parseCouponRevision(match)
    if (couponId) {
      parseInput(couponParams, { couponId })
      if (expected === undefined) throw new ApiError('PRECONDITION_REQUIRED')
      if (!Number.isSafeInteger(expected)) throw new ApiError('PRECONDITION_FAILED')
    }
    const patch = couponId ? parseInput(couponPatch, raw) : undefined
    const create = couponId ? undefined : parseInput(couponInput, raw)
    try {
      return await access.owned(token, async (actorId, session) => {
        await verify()
        let row = couponId ? await models.coupons.findById(couponId).session(session) : null
        if (couponId && !row) throw new ApiError('NOT_FOUND')
        if (row && row.revision !== expected) throw new ApiError('PRECONDITION_FAILED')
        const before = row ? view(row) : undefined
        const current = before ? { ...before } : undefined
        if (current) {
          const {
            id: _id,
            heldCount: _held,
            redeemedCount: _redeemed,
            revision: _revision,
            termsVersion: _version,
            ...config
          } = current
          const original = { ...config }
          for (const [key, value] of Object.entries(patch ?? {})) {
            if (value === null) Reflect.deleteProperty(config, key)
            else Reflect.set(config, key, value)
          }
          const input = parseInput(couponInput, config)
          if (
            isDeepStrictEqual(
              {
                ...input,
                startsAt: new Date(input.startsAt).toISOString(),
                expiresAt: new Date(input.expiresAt).toISOString(),
              },
              original,
            ) &&
            !reason
          ) {
            if (!row) throw new ApiError('STATE_CONFLICT')
            return view(row)
          }
          if (!row) throw new ApiError('STATE_CONFLICT')
          if (
            row.revision >= Number.MAX_SAFE_INTEGER ||
            row.termsVersion >= Number.MAX_SAFE_INTEGER
          )
            throw new ApiError('STATE_CONFLICT')
          if (
            input.overallLimit !== undefined &&
            BigInt(row.heldCount) + BigInt(row.redeemedCount) > BigInt(input.overallLimit)
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          if (input.perCustomerLimit !== undefined) {
            const over = await models.customers
              .findOne({
                couponId: row._id,
                $expr: {
                  $gt: [{ $add: ['$heldCount', '$redeemedCount'] }, input.perCustomerLimit],
                },
              })
              .session(session)
            if (over) throw new ApiError('BUSINESS_RULE_VIOLATION')
          }
          const { code, ...updatedConfig } = input
          row.set({
            ...updatedConfig,
            codeNormalized: code,
            startsAt: new Date(input.startsAt),
            expiresAt: new Date(input.expiresAt),
          })
          // Only declared configuration fields change; counters and redemptions are never client-owned.
          for (const key of [
            'overallLimit',
            'perCustomerLimit',
            'eligibleProductIds',
            'eligibleCategoryIds',
          ] as const)
            if (input[key] === undefined) row.set(key, undefined)
          row.revision += 1
          row.termsVersion += 1
        } else {
          if (!create) throw new ApiError('STATE_CONFLICT')
          const { code, ...config } = create
          row = new models.coupons({
            ...config,
            codeNormalized: code,
            startsAt: new Date(config.startsAt),
            expiresAt: new Date(config.expiresAt),
          })
        }
        if (!row) throw new ApiError('STATE_CONFLICT')
        await row.save({ session })
        const result = view(row)
        await audit(session, {
          actorType: 'admin',
          actorId,
          action: reason ? 'coupon.deactivate' : couponId ? 'coupon.update' : 'coupon.create',
          targetType: 'coupon',
          targetId: result.id,
          operationKey,
          occurredAt: clock(),
          ...(before ? { beforeDigest: digest(before) } : {}),
          afterDigest: digest(result),
          ...(reason ? { reason } : {}),
        })
        return result
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  return {
    create: (token: string | undefined, raw: unknown) => write(token, raw),
    update: (token: string | undefined, id: string, raw: unknown, match?: string) =>
      write(token, raw, id, match),
    deactivate(token: string | undefined, id: string, raw: unknown, match?: string) {
      const { reason } = parseInput(couponDeactivate, raw)
      return write(token, { status: 'inactive' }, id, match, reason)
    },
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(couponListQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const filter = input.status ? { status: input.status } : {}
          const total = await models.coupons.countDocuments(filter).session(session)
          const rows = await models.coupons
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return { data: rows.map(view), page: pageMeta(input, total) }
        },
        false,
      )
    },
    async history(token: string | undefined, couponId: string, raw: unknown) {
      parseInput(couponParams, { couponId })
      const input = parseInput(couponHistoryQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          if (!(await models.coupons.exists({ _id: couponId }).session(session)))
            throw new ApiError('NOT_FOUND')
          const filter = { couponId: new Types.ObjectId(couponId) }
          const total = await models.redemptions.countDocuments(filter).session(session)
          const rows = await models.redemptions
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          const data = rows.map((row) =>
            parseInput(couponHistory, {
              id: row._id.toHexString(),
              couponId,
              orderId: row.orderId.toHexString(),
              ...(row.userId ? { userId: row.userId.toHexString() } : {}),
              generation: row.generation,
              status: row.status,
              termsSnapshot: {
                code: row.termsSnapshot.code,
                type: row.termsSnapshot.type,
                value: row.termsSnapshot.value,
                version: row.termsSnapshot.version,
                discountPoisha: row.termsSnapshot.discountPoisha,
                eligibleLineIds: row.termsSnapshot.eligibleLineIds.map(String),
              },
              ...Object.fromEntries(
                (['heldAt', 'expiresAt', 'redeemedAt', 'releasedAt'] as const).flatMap((key) =>
                  row[key] ? [[key, row[key].toISOString()]] : [],
                ),
              ),
            }),
          )
          return { data, page: pageMeta(input, total) }
        },
        false,
      )
    },
  }
}

// Internal policy over authoritative, detached records and priced lines. This is not an
// HTTP input DTO, identity check, scope resolver, quota reservation or durable hold writer.
function evaluateCouponEligibility(raw: unknown, now: Date = new Date()) {
  const input = parseInput(couponEligibilityInput, raw)
  if (!Number.isFinite(now.getTime())) throw new ApiError('VALIDATION_FAILED')
  const unavailable = () => {
    throw new ApiError('COUPON_UNAVAILABLE')
  }
  const conflict = () => {
    throw new ApiError('STATE_CONFLICT')
  }
  const accepted = input.accepted
  let acceptedPricing: ReturnType<typeof calculatePricing> | undefined
  if (accepted) {
    if (accepted.terms.code !== input.code) conflict()
    acceptedPricing = calculatePricing({
      ...accepted.pricing,
      coupon: { type: accepted.terms.type, value: accepted.terms.value },
    })
    const eligibleIds = acceptedPricing.items
      .filter((line) => line.couponEligible)
      .map((line) => line.id)
      .sort()
    if (
      acceptedPricing.couponDiscountPoisha !== accepted.terms.discountPoisha ||
      !isDeepStrictEqual(eligibleIds, [...accepted.terms.eligibleLineIds].sort())
    )
      conflict()
  }
  if (input.hold) {
    const hold = input.hold
    if (
      !accepted ||
      hold.orderId !== accepted.orderId ||
      hold.couponId !== accepted.couponId ||
      hold.heldAt > now ||
      hold.expiresAt.getTime() - hold.heldAt.getTime() !== 15 * 60 * 1000
    )
      conflict()
    if (hold.userId !== (input.principal.kind === 'customer' ? input.principal.userId : undefined))
      conflict()
    if (hold.expiresAt > now) {
      if (!accepted || !acceptedPricing) return conflict()
      return {
        source: 'live_hold' as const,
        pricing: acceptedPricing,
        termsSnapshot: accepted.terms,
      }
    }
  }
  const coupon = input.coupon
  if (
    !coupon ||
    coupon.codeNormalized !== input.code ||
    coupon.status !== 'active' ||
    now < coupon.startsAt ||
    now >= coupon.expiresAt
  )
    return unavailable()
  if (
    accepted &&
    (coupon.id !== accepted.couponId ||
      coupon.type !== accepted.terms.type ||
      coupon.value !== accepted.terms.value)
  )
    return conflict()
  if (
    coupon.overallLimit !== undefined &&
    BigInt(coupon.heldCount) + BigInt(coupon.redeemedCount) >= BigInt(coupon.overallLimit)
  )
    return unavailable()
  if (coupon.perCustomerLimit !== undefined) {
    if (input.principal.kind !== 'customer') return unavailable()
    const usage = input.customerUsage
    // Missing information is not proof of zero usage. The persistence owner must load
    // the canonical counter (or establish its absence) and bind it to this principal.
    if (!usage || usage.couponId !== coupon.id || usage.userId !== input.principal.userId)
      return conflict()
    if (BigInt(usage.heldCount) + BigInt(usage.redeemedCount) >= BigInt(coupon.perCustomerLimit))
      return unavailable()
  }
  const subtotal = input.pricing.items.reduce(
    (sum, line) =>
      sum + (line.couponEligible ? BigInt(line.effectiveUnitPoisha) * BigInt(line.quantity) : 0n),
    0n,
  )
  if (subtotal === 0n || subtotal < BigInt(coupon.minEligibleSubtotalPoisha)) return unavailable()
  const pricing = calculatePricing({
    ...input.pricing,
    coupon: { type: coupon.type, value: coupon.value },
  })
  // Stable line IDs, quantities, prices, allocation and delivery must match accepted
  // commerce. Compare without input-array-order sensitivity; never silently reprice.
  const canonical = (value: typeof pricing) => ({
    ...value,
    items: [...value.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  })
  if (acceptedPricing && !isDeepStrictEqual(canonical(pricing), canonical(acceptedPricing)))
    return conflict()
  return {
    source: 'current' as const,
    pricing,
    termsSnapshot: accepted?.terms ?? {
      code: coupon.codeNormalized,
      type: coupon.type,
      value: coupon.value,
      version: coupon.termsVersion,
      discountPoisha: pricing.couponDiscountPoisha,
      eligibleLineIds: pricing.items.filter((line) => line.couponEligible).map((line) => line.id),
    },
  }
}

function couponQuoteAccess(connection: Connection) {
  return async (
    code: string,
    principal:
      | {
          kind: 'guest'
        }
      | {
          kind: 'customer'
          userId: string
        },
    lines: (z.output<typeof pricingInput>['items'][number] & {
      productId: string
      categoryIds: string[]
    })[],
    deliveryChargePoisha: number,
    session: ClientSession,
    now: Date,
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyCouponPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const models = couponModels(connection),
      row = await models.coupons.findOne({ codeNormalized: code }).session(session)
    if (!row) throw new ApiError('COUPON_UNAVAILABLE')
    const productIds = row.eligibleProductIds?.map(String) ?? [],
      categoryIds = row.eligibleCategoryIds?.map(String) ?? []
    const items = lines.map(({ productId, categoryIds: categories, ...line }) => ({
      ...line,
      couponEligible:
        (!productIds.length || productIds.includes(productId)) &&
        (!categoryIds.length || categories.some((id) => categoryIds.includes(id))),
    }))
    const usage =
      principal.kind === 'customer'
        ? await models.customers
            .findOne({ couponId: row._id, userId: principal.userId })
            .session(session)
        : null
    const result = evaluateCouponEligibility(
      {
        code,
        principal,
        pricing: { items, deliveryChargePoisha },
        coupon: {
          id: row._id.toHexString(),
          codeNormalized: row.codeNormalized,
          type: row.type,
          value: row.value,
          startsAt: row.startsAt,
          expiresAt: row.expiresAt,
          status: row.status,
          heldCount: row.heldCount,
          redeemedCount: row.redeemedCount,
          termsVersion: row.termsVersion,
          minEligibleSubtotalPoisha: row.minEligibleSubtotalPoisha,
          ...(row.overallLimit !== undefined ? { overallLimit: row.overallLimit } : {}),
          ...(row.perCustomerLimit !== undefined ? { perCustomerLimit: row.perCustomerLimit } : {}),
        },
        ...(principal.kind === 'customer'
          ? {
              customerUsage: {
                couponId: row._id.toHexString(),
                userId: principal.userId,
                heldCount: usage?.heldCount ?? 0,
                redeemedCount: usage?.redeemedCount ?? 0,
              },
            }
          : {}),
      },
      now,
    )
    return {
      ...result,
      couponId: row._id.toHexString(),
      eligibleSubtotalPoisha: result.pricing.couponEligibleSubtotalPoisha,
    }
  }
}

// Advisory only: authoritative prices/eligibility, no hold or redemption write.
function createCouponPreviewService(
  connection: Connection,
  access: CheckoutAccess,
  catalog: CatalogCheckoutAccess,
  delivery: CheckoutDeliveryAccess,
  clock: () => Date = () => new Date(),
) {
  const quote = couponQuoteAccess(connection)
  return {
    async preview(credentials: CheckoutCredentials, raw: unknown) {
      const input = parseInput(couponPreviewInput, raw)
      return access.owned(credentials, async (principal, session) => {
        const selections = await catalog(
          input.items.map((item) => item.variantId),
          session,
        )
        const lines = input.items.map((item) => {
          const selected = selections.get(item.variantId)
          if (!selected || selected.availableQty < item.quantity) throw new ApiError('OUT_OF_STOCK')
          return {
            id: item.variantId,
            variantId: item.variantId,
            quantity: item.quantity,
            productId: selected.product.id,
            categoryIds: selected.categoryIds,
            couponEligible: false,
            regularUnitPoisha: selected.product.regularPricePoisha,
            effectiveUnitPoisha: selected.estimatedUnitPoisha,
          }
        })
        const charge = input.deliveryArea
          ? (await delivery(input.deliveryArea.districtKey, input.deliveryArea.areaKey, session))
              .amountPoisha
          : 0
        try {
          const result = await quote(
            input.code,
            principal.profile
              ? { kind: 'customer', userId: principal.profile.id }
              : { kind: 'guest' },
            lines,
            charge,
            session,
            clock(),
          )
          return couponPreviewResult.parse({
            eligible: true,
            discountPoisha: result.pricing.couponDiscountPoisha,
          })
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'COUPON_UNAVAILABLE') throw error
          return couponPreviewResult.parse({
            eligible: false,
            discountPoisha: 0,
            reasonCode: 'COUPON_UNAVAILABLE',
          })
        }
      })
    },
  }
}

const id = z.string().regex(/^[a-f0-9]{24}$/)

const commandInput = z.strictObject({
  couponId: id,
  orderId: id,
  generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  operationKey: z
    .string()
    .min(1)
    .max(128)
    .refine(
      (value) =>
        value === value.trim() &&
        [...value].every(
          (character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
        ),
    ),
})

const acceptedShape = couponEligibilityInput.shape.accepted.unwrap().shape

const bindingInput = z.strictObject({
  orderId: id,
  couponId: id,
  userId: id.optional(),
  acceptedPricing: acceptedShape.pricing,
  currentPricing: acceptedShape.pricing,
  termsSnapshot: acceptedShape.terms,
})

type Action = 'reserve' | 'redeem_cod' | 'commit' | 'release_held' | 'release_redeemed'

// REQUIRED owning-order boundary: authorize must fence durable order/payment/lifecycle
// state in THIS session, verify action eligibility and return only authoritative snapshots.
// In particular release_redeemed is allowed only for eligible pre-dispatch cancellation.
type CouponOrderAccess = {
  authorize(session: ClientSession, orderId: string, action: Action): Promise<unknown>
}

const max = Number.MAX_SAFE_INTEGER

function createCouponAllocationService(
  connection: Connection,
  orders: CouponOrderAccess,
  clock: () => Date = () => new Date(),
) {
  const models = couponModels(connection)
  function terms(row: HydratedDocument<CouponRedemption>) {
    return {
      code: row.termsSnapshot.code,
      type: row.termsSnapshot.type,
      value: row.termsSnapshot.value,
      version: row.termsSnapshot.version,
      discountPoisha: row.termsSnapshot.discountPoisha,
      eligibleLineIds: row.termsSnapshot.eligibleLineIds.map((value) => value.toHexString()),
    }
  }
  function view(row: HydratedDocument<CouponRedemption>) {
    return {
      id: row._id.toHexString(),
      couponId: row.couponId.toHexString(),
      orderId: row.orderId.toHexString(),
      generation: row.generation,
      status: row.status,
      heldAt: row.heldAt,
      expiresAt: row.expiresAt,
      redeemedAt: row.redeemedAt,
      releasedAt: row.releasedAt,
    }
  }
  async function apply(session: ClientSession, raw: unknown, action: Action, heldAt?: Date) {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const command = parseInput(commandInput, raw),
      now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('VALIDATION_FAILED')
    const counterUpdate = (held: number, redeemed: number) => [
      {
        $set: {
          heldCount: { $add: ['$heldCount', held] },
          redeemedCount: { $add: ['$redeemedCount', redeemed] },
          revision: { $add: ['$revision', 1] },
          updatedAt: now,
        },
      },
    ]
    try {
      await verifyCouponPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const binding = parseInput(
      bindingInput,
      await orders.authorize(session, command.orderId, action),
    )
    if (binding.orderId !== command.orderId || binding.couponId !== command.couponId)
      throw new ApiError('STATE_CONFLICT')
    const couponId = new Types.ObjectId(command.couponId),
      orderId = new Types.ObjectId(command.orderId)
    let row = await models.redemptions
      .findOne({ couponId, orderId, generation: command.generation })
      .session(session)
    if (
      row &&
      (row.userId?.toHexString() !== binding.userId ||
        !isDeepStrictEqual(terms(row), binding.termsSnapshot))
    )
      throw new ApiError('STATE_CONFLICT')
    const starting = action === 'reserve' || action === 'redeem_cod'
    if (starting && row) {
      if ((action === 'reserve') !== Boolean(row.heldAt)) throw new ApiError('STATE_CONFLICT')
      return view(row) // Natural generation identity; never revive or extend it.
    }
    if (action === 'commit' && row?.status === 'redeemed') return view(row)
    if ((action === 'release_held' || action === 'release_redeemed') && row?.status === 'released')
      return view(row)
    const coupon = await models.coupons.findById(couponId).session(session)
    if (!coupon) throw new ApiError('STATE_CONFLICT')
    let customer = binding.userId
      ? await models.customers
          .findOne({ couponId, userId: new Types.ObjectId(binding.userId) })
          .session(session)
      : null
    let deltaHeld = 0,
      deltaRedeemed = 0
    let snapshot = binding.termsSnapshot
    if (starting) {
      const latest = await models.redemptions
        .findOne({ couponId, orderId })
        .sort({ generation: -1 })
        .session(session)
      if (
        latest
          ? latest.status !== 'released' || command.generation !== latest.generation + 1
          : command.generation !== 1
      )
        throw new ApiError('STATE_CONFLICT')
      if (
        action === 'reserve' &&
        (!(heldAt instanceof Date) ||
          !Number.isFinite(heldAt.getTime()) ||
          heldAt > now ||
          now.getTime() >= heldAt.getTime() + 900000 ||
          !Number.isFinite(new Date(heldAt.getTime() + 900000).getTime()))
      )
        throw new ApiError('VALIDATION_FAILED')
      const evaluated = evaluateCouponEligibility(
        {
          code: binding.termsSnapshot.code,
          coupon: {
            id: command.couponId,
            codeNormalized: coupon.codeNormalized,
            type: coupon.type,
            value: coupon.value,
            minEligibleSubtotalPoisha: coupon.minEligibleSubtotalPoisha,
            startsAt: coupon.startsAt,
            expiresAt: coupon.expiresAt,
            status: coupon.status,
            heldCount: coupon.heldCount,
            redeemedCount: coupon.redeemedCount,
            termsVersion: coupon.termsVersion,
            overallLimit: coupon.overallLimit,
            perCustomerLimit: coupon.perCustomerLimit,
          },
          principal: binding.userId
            ? { kind: 'customer', userId: binding.userId }
            : { kind: 'guest' },
          ...(binding.userId
            ? {
                customerUsage: {
                  couponId: command.couponId,
                  userId: binding.userId,
                  heldCount: customer?.heldCount ?? 0,
                  redeemedCount: customer?.redeemedCount ?? 0,
                },
              }
            : {}),
          pricing: binding.currentPricing,
          accepted: {
            orderId: command.orderId,
            couponId: command.couponId,
            pricing: binding.acceptedPricing,
            terms: binding.termsSnapshot,
          },
        },
        now,
      )
      snapshot = evaluated.termsSnapshot
      deltaHeld = action === 'reserve' ? 1 : 0
      deltaRedeemed = action === 'redeem_cod' ? 1 : 0
      const changed = await models.coupons.findOneAndUpdate(
        {
          _id: couponId,
          revision: coupon.revision,
          status: 'active',
          $expr: {
            $and: [
              { $lt: ['$revision', max] },
              { $lt: [{ $add: ['$heldCount', '$redeemedCount'] }, coupon.overallLimit ?? max] },
            ],
          },
        },
        counterUpdate(deltaHeld, deltaRedeemed),
        { session, returnDocument: 'after', updatePipeline: true, timestamps: false },
      )
      if (!changed) throw new ApiError('COUPON_UNAVAILABLE')
      if (binding.userId && !customer) {
        const [created] = await models.customers.create(
          [
            {
              couponId,
              userId: new Types.ObjectId(binding.userId),
              heldCount: 0,
              redeemedCount: 0,
              revision: 0,
            },
          ],
          { session },
        )
        if (!created) throw new ApiError('STATE_CONFLICT')
        customer = created
      }
    } else {
      const expected = action === 'commit' || action === 'release_held' ? 'held' : 'redeemed'
      const began = row?.redeemedAt ?? row?.heldAt
      if (
        !row ||
        row.status !== expected ||
        row.activeKey !== 'active' ||
        !began ||
        began > now ||
        (action === 'commit' && (!row.expiresAt || now >= row.expiresAt))
      )
        throw new ApiError('STATE_CONFLICT')
      deltaHeld = expected === 'held' ? -1 : 0
      deltaRedeemed = action === 'commit' ? 1 : expected === 'redeemed' ? -1 : 0
      const changed = await models.coupons.findOneAndUpdate(
        {
          _id: couponId,
          $expr: {
            $and: [
              { $lt: ['$revision', max] },
              { $gte: ['$heldCount', -deltaHeld] },
              { $gte: ['$redeemedCount', -Math.min(0, deltaRedeemed)] },
              { $lte: ['$redeemedCount', max - Math.max(0, deltaRedeemed)] },
            ],
          },
        },
        counterUpdate(deltaHeld, deltaRedeemed),
        { session, returnDocument: 'after', updatePipeline: true, timestamps: false },
      )
      if (!changed) throw new ApiError('STATE_CONFLICT')
    }
    if (binding.userId) {
      if (!customer) throw new ApiError('STATE_CONFLICT')
      const conditions = starting
        ? [{ $lt: [{ $add: ['$heldCount', '$redeemedCount'] }, coupon.perCustomerLimit ?? max] }]
        : [
            { $gte: ['$heldCount', -deltaHeld] },
            { $gte: ['$redeemedCount', -Math.min(0, deltaRedeemed)] },
            { $lte: ['$redeemedCount', max - Math.max(0, deltaRedeemed)] },
          ]
      const changed = await models.customers.findOneAndUpdate(
        {
          _id: customer._id,
          revision: customer.revision,
          $expr: { $and: [{ $lt: ['$revision', max] }, ...conditions] },
        },
        counterUpdate(deltaHeld, deltaRedeemed),
        { session, returnDocument: 'after', updatePipeline: true, timestamps: false },
      )
      if (!changed) throw new ApiError(starting ? 'COUPON_UNAVAILABLE' : 'STATE_CONFLICT')
    }
    if (starting) {
      const [created] = await models.redemptions.create(
        [
          {
            couponId,
            orderId,
            ...(binding.userId ? { userId: new Types.ObjectId(binding.userId) } : {}),
            generation: command.generation,
            status: action === 'reserve' ? 'held' : 'redeemed',
            activeKey: 'active',
            termsSnapshot: {
              ...snapshot,
              eligibleLineIds: snapshot.eligibleLineIds.map((value) => new Types.ObjectId(value)),
            },
            lastOperationKey: command.operationKey,
            ...(action === 'reserve'
              ? {
                  heldAt: new Date(heldAt?.getTime() ?? Number.NaN),
                  expiresAt: new Date((heldAt?.getTime() ?? Number.NaN) + 900000),
                }
              : { redeemedAt: now }),
          },
        ],
        { session },
      )
      if (!created) throw new ApiError('STATE_CONFLICT')
      row = created
    } else {
      const committing = action === 'commit'
      row = await models.redemptions.findOneAndUpdate(
        {
          _id: row?._id,
          status: committing || action === 'release_held' ? 'held' : 'redeemed',
          activeKey: 'active',
        },
        {
          $set: {
            status: committing ? 'redeemed' : 'released',
            lastOperationKey: command.operationKey,
            ...(committing ? { redeemedAt: now } : { releasedAt: now }),
          },
          $unset: { expiresAt: '', ...(committing ? {} : { activeKey: '' }) },
        },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
    }
    return view(row)
  }
  return {
    reserve: (session: ClientSession, input: unknown, heldAt: Date) =>
      apply(session, input, 'reserve', heldAt),
    redeemCod: (session: ClientSession, input: unknown) => apply(session, input, 'redeem_cod'),
    commit: (session: ClientSession, input: unknown) => apply(session, input, 'commit'),
    release(session: ClientSession, input: unknown, expectedStatus: 'held' | 'redeemed') {
      if (expectedStatus !== 'held' && expectedStatus !== 'redeemed')
        throw new ApiError('VALIDATION_FAILED')
      return apply(session, input, expectedStatus === 'held' ? 'release_held' : 'release_redeemed')
    },
  }
}

function couponGenerationAccess(connection: Connection) {
  const models = couponModels(connection)
  return async (session: ClientSession, orderId: string, generation: number) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyCouponPersistence(connection)
    const row = await models.redemptions.findOne({ orderId, generation }).session(session)
    return row
      ? {
          couponId: row.couponId.toHexString(),
          status: row.status,
          heldAt: row.heldAt,
          expiresAt: row.expiresAt,
        }
      : null
  }
}

export type { CouponOrderAccess }
export {
  couponGenerationAccess,
  couponQuoteAccess,
  createCouponAdminService,
  createCouponAllocationService,
  createCouponPreviewService,
  evaluateCouponEligibility,
}

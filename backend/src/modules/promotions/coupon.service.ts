import type { Connection, ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { pricingInput } from './pricing.schema.js'
import { couponModels } from './coupon.model.js'
import { verifyCouponPersistence } from './coupon.persistence.js'
import { isDeepStrictEqual } from 'node:util'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { calculatePricing } from './pricing.service.js'
import { couponEligibilityInput } from './coupon.schema.js'

// Internal policy over authoritative, detached records and priced lines. This is not an
// HTTP input DTO, identity check, scope resolver, quota reservation or durable hold writer.
export function evaluateCouponEligibility(raw: unknown, now: Date = new Date()) {
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

export function couponQuoteAccess(connection: Connection) {
  return async (
    code: string,
    principal: { kind: 'guest' } | { kind: 'customer'; userId: string },
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

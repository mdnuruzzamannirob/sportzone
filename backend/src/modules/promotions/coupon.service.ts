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

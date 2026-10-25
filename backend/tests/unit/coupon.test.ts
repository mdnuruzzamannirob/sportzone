import { expect, it } from 'vitest'
import { evaluateCouponEligibility } from '../../src/modules/promotions/coupon.service.js'

const id = (n: number) => n.toString(16).padStart(24, '0')

function first<T>(items: T[]): T {
  const value = items[0]
  if (!value) throw new Error('Missing fixture line')
  return value
}
const now = new Date('2026-10-24T06:00:00Z')
const item = {
  id: id(1),
  variantId: id(2),
  quantity: 1,
  couponEligible: true,
  regularUnitPoisha: 1000,
  effectiveUnitPoisha: 500,
}
function context() {
  return {
    code: ' SAVE ',
    coupon: {
      id: id(3),
      codeNormalized: 'SAVE',
      type: 'fixed' as const,
      value: 100,
      status: 'active' as 'active' | 'inactive',
      startsAt: new Date(now.getTime() - 1000),
      expiresAt: new Date(now.getTime() + 3600000),
      minEligibleSubtotalPoisha: 500,
      heldCount: 0,
      redeemedCount: 0,
      overallLimit: 5,
      termsVersion: 1,
    },
    principal: { kind: 'guest' as const },
    pricing: { items: [{ ...item }], deliveryChargePoisha: 100 },
  }
}
function customer() {
  return {
    ...context(),
    principal: { kind: 'customer' as const, userId: id(4) },
    customerUsage: { couponId: id(3), userId: id(4), heldCount: 0, redeemedCount: 0 },
  }
}
function held() {
  const base = customer(),
    first = evaluateCouponEligibility(base, now)
  return {
    ...base,
    accepted: {
      orderId: id(5),
      couponId: id(3),
      pricing: structuredClone(base.pricing),
      terms: first.termsSnapshot,
    },
    hold: {
      orderId: id(5),
      couponId: id(3),
      userId: id(4),
      status: 'held' as const,
      heldAt: new Date(now.getTime() - 1000),
      expiresAt: new Date(now.getTime() + 899000),
    },
  }
}
const rejects = (value: unknown, code = 'COUPON_UNAVAILABLE', time = now) =>
  expect(() => evaluateCouponEligibility(value, time)).toThrow(expect.objectContaining({ code }))
it('normalizes code, applies sale-before-coupon minimum and excludes delivery', () => {
  const result = evaluateCouponEligibility(context(), now)
  expect(result).toMatchObject({
    source: 'current',
    pricing: { couponDiscountPoisha: 100, finalTotalPoisha: 500 },
    termsSnapshot: {
      code: 'SAVE',
      type: 'fixed',
      value: 100,
      version: 1,
      discountPoisha: 100,
      eligibleLineIds: [id(1)],
    },
  })
})
it('accepts a guest only when no customer quota applies and does not mutate input', () => {
  const input = context(),
    before = structuredClone(input)
  evaluateCouponEligibility(input, now)
  expect(input).toEqual(before)
})
it('supports percentage half-up with integer basis points and capped fixed discounts', () => {
  const input = context()
  input.pricing.items[0] = { ...item, regularUnitPoisha: 101, effectiveUnitPoisha: 101 }
  input.coupon.minEligibleSubtotalPoisha = 1
  expect(
    evaluateCouponEligibility(
      { ...input, coupon: { ...input.coupon, type: 'percentage', value: 5000 } },
      now,
    ).pricing.couponDiscountPoisha,
  ).toBe(51)
  input.coupon.value = 1000
  expect(evaluateCouponEligibility(input, now).pricing.couponDiscountPoisha).toBe(101)
})
it('treats startsAt as inclusive and expiresAt as exclusive', () => {
  const input = context()
  input.coupon.startsAt = new Date(now)
  evaluateCouponEligibility(input, now)
  input.coupon.startsAt = new Date(now.getTime() + 1)
  rejects(input)
  input.coupon.startsAt = new Date(now.getTime() - 1000)
  input.coupon.expiresAt = new Date(now)
  rejects(input)
})
it.each(['missing', 'wrong-code', 'inactive', 'expired', 'future'])(
  'denies %s current coupon with stable safe errors',
  (kind) => {
    const input = context()
    if (kind === 'missing') return rejects({ ...input, coupon: null })
    if (kind === 'wrong-code') input.code = 'OTHER'
    if (kind === 'inactive') input.coupon.status = 'inactive'
    if (kind === 'expired') input.coupon.expiresAt = new Date(now)
    if (kind === 'future') input.coupon.startsAt = new Date(now.getTime() + 1)
    try {
      evaluateCouponEligibility(input, now)
      throw new Error('Expected denial')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'COUPON_UNAVAILABLE',
        status: 409,
        message: 'Coupon is not available.',
      })
      expect(JSON.stringify(error)).not.toMatch(/heldCount|redeemedCount|SAVE|OTHER/)
    }
  },
)
it('uses only post-sale eligible merchandise for the minimum, even with large delivery/other lines', () => {
  const input = context()
  input.coupon.minEligibleSubtotalPoisha = 501
  input.pricing.deliveryChargePoisha = 100000
  input.pricing.items.push({
    ...item,
    id: id(10),
    variantId: id(11),
    effectiveUnitPoisha: 1000,
    couponEligible: false,
  })
  rejects(input)
  input.coupon.minEligibleSubtotalPoisha = 500
  evaluateCouponEligibility(input, now)
})
it.each([true, false])('denies zero eligible subtotal when eligibility flag is %s', (flag) => {
  const input = context()
  input.coupon.minEligibleSubtotalPoisha = 0
  input.pricing.items[0] = { ...item, effectiveUnitPoisha: flag ? 0 : 500, couponEligible: flag }
  rejects(input)
})
it.each([
  { held: 5, redeemed: 0 },
  { held: 0, redeemed: 5 },
  { held: 2, redeemed: 3 },
])('includes held and redeemed global usage %j', (counts) => {
  const input = context()
  input.coupon.heldCount = counts.held
  input.coupon.redeemedCount = counts.redeemed
  rejects(input)
  input.coupon.overallLimit = 6
  evaluateCouponEligibility(input, now)
})
it('compares large counters exactly without unsafe addition', () => {
  const input = context()
  input.coupon.overallLimit = Number.MAX_SAFE_INTEGER
  input.coupon.heldCount = Number.MAX_SAFE_INTEGER - 1
  input.coupon.redeemedCount = 1
  rejects(input)
})
it('permits coupons with no configured global maximum', () => {
  const input = context(),
    { overallLimit: _, ...coupon } = input.coupon
  evaluateCouponEligibility(
    { ...input, coupon: { ...coupon, heldCount: 900, redeemedCount: 900 } },
    now,
  )
})
it('rejects guests with a per-customer limit even if an email might identify an account', () => {
  const input = context()
  rejects({ ...input, coupon: { ...input.coupon, perCustomerLimit: 1 } })
  rejects(
    { ...input, principal: { kind: 'guest', email: 'customer@example.test' } },
    'VALIDATION_FAILED',
  )
})
it.each([
  { held: 1, redeemed: 1 },
  { held: 0, redeemed: 2 },
])('enforces registered customer quota %j', (counts) => {
  const input = customer(),
    coupon = { ...input.coupon, perCustomerLimit: 2 }
  rejects({
    ...input,
    coupon,
    customerUsage: {
      ...input.customerUsage,
      heldCount: counts.held,
      redeemedCount: counts.redeemed,
    },
  })
  evaluateCouponEligibility({ ...input, coupon }, now)
})
it.each(['missing', 'foreign-user', 'foreign-coupon'])(
  'fails closed for %s quota context',
  (kind) => {
    const input = customer(),
      coupon = { ...input.coupon, perCustomerLimit: 2 }
    if (kind === 'missing')
      return rejects({ ...input, coupon, customerUsage: undefined }, 'STATE_CONFLICT')
    rejects(
      {
        ...input,
        coupon,
        customerUsage: {
          ...input.customerUsage,
          ...(kind === 'foreign-user' ? { userId: id(99) } : { couponId: id(99) }),
        },
      },
      'STATE_CONFLICT',
    )
  },
)
it('retains accepted pricing and coupon terms through a live hold despite master edits and full counters', () => {
  const input = held(),
    before = structuredClone(input.accepted)
  input.coupon.status = 'inactive'
  input.coupon.value = 1
  input.coupon.heldCount = 5
  first(input.pricing.items).effectiveUnitPoisha = 1
  const result = evaluateCouponEligibility(input, now)
  expect(result).toMatchObject({
    source: 'live_hold',
    pricing: { couponDiscountPoisha: 100, finalTotalPoisha: 500 },
    termsSnapshot: { value: 100, version: 1 },
  })
  expect(input.accepted).toEqual(before)
  expect(input.hold.expiresAt.getTime()).toBe(now.getTime() + 899000)
  expect(evaluateCouponEligibility({ ...input, coupon: null }, now).source).toBe('live_hold')
})
it('supports a genuine guest hold without creating a customer identity', () => {
  const input = held(),
    { userId: _, ...hold } = input.hold
  expect(
    evaluateCouponEligibility({ ...input, principal: { kind: 'guest' }, hold }, now).source,
  ).toBe('live_hold')
})
it.each([
  'no-accepted',
  'wrong-order',
  'wrong-coupon',
  'wrong-user',
  'future-held-at',
  'wrong-duration',
  'wrong-code',
  'wrong-discount',
  'wrong-lines',
])('denies malformed or unbound hold %s', (kind) => {
  const input = held()
  if (kind === 'no-accepted') return rejects({ ...input, accepted: undefined }, 'STATE_CONFLICT')
  if (kind === 'wrong-order') input.hold.orderId = id(99)
  if (kind === 'wrong-coupon') input.hold.couponId = id(99)
  if (kind === 'wrong-user') input.hold.userId = id(99)
  if (kind === 'future-held-at') {
    input.hold.heldAt = new Date(now.getTime() + 1)
    input.hold.expiresAt = new Date(now.getTime() + 900001)
  }
  if (kind === 'wrong-duration') input.hold.expiresAt = new Date(now.getTime() + 1)
  if (kind === 'wrong-code') input.code = 'OTHER'
  if (kind === 'wrong-discount') input.accepted.terms.discountPoisha = 1
  if (kind === 'wrong-lines') input.accepted.terms.eligibleLineIds = [id(99)]
  rejects(input, 'STATE_CONFLICT')
})
it('at exact hold expiry revalidates current rules rather than extending expiry', () => {
  const input = held(),
    expiry = new Date(input.hold.expiresAt)
  expect(evaluateCouponEligibility(input, expiry).source).toBe('current')
  input.coupon.status = 'inactive'
  rejects(input, 'COUPON_UNAVAILABLE', expiry)
})
it('requires explicit capacity release before expired held usage can be reacquired', () => {
  const input = held()
  input.coupon.overallLimit = 1
  input.coupon.heldCount = 1
  rejects(input, 'COUPON_UNAVAILABLE', input.hold.expiresAt)
  input.coupon.heldCount = 0
  evaluateCouponEligibility(input, input.hold.expiresAt)
})
it.each([
  'coupon-id',
  'coupon-value',
  'unit-price',
  'delivery',
  'quantity',
  'line-id',
  'eligibility',
])('blocks incompatible reacquisition %s instead of repricing', (kind) => {
  const input = held()
  if (kind === 'coupon-id') input.coupon.id = id(99)
  if (kind === 'coupon-value') input.coupon.value = 50
  if (kind === 'unit-price') first(input.pricing.items).effectiveUnitPoisha = 600
  if (kind === 'delivery') input.pricing.deliveryChargePoisha = 101
  if (kind === 'quantity') first(input.pricing.items).quantity = 2
  if (kind === 'line-id') first(input.pricing.items).id = id(99)
  if (kind === 'eligibility') {
    input.pricing.items.push({ ...item, id: id(9), variantId: id(10) })
    first(input.pricing.items).couponEligible = false
  }
  rejects(input, 'STATE_CONFLICT', input.hold.expiresAt)
})
it('keeps original terms snapshot when a compatible newer master version is revalidated', () => {
  const input = held()
  input.coupon.termsVersion = 2
  expect(evaluateCouponEligibility(input, input.hold.expiresAt).termsSnapshot.version).toBe(1)
})
it.each([
  { code: ['SAVE', 'OTHER'] },
  { code: '' },
  { code: 'x'.repeat(65) },
  { coupon: { ...context().coupon, type: 'percentage', value: 10001 } },
  { coupon: { ...context().coupon, type: 'fixed', value: 0 } },
  { coupon: { ...context().coupon, startsAt: new Date('invalid') } },
  { coupon: { ...context().coupon, startsAt: new Date(now.getTime() + 7200000) } },
  { coupon: { ...context().coupon, heldCount: -1 } },
  { coupon: { ...context().coupon, redeemedCount: 0.5 } },
  { coupon: { ...context().coupon, overallLimit: 0 } },
  { coupon: { ...context().coupon, perCustomerLimit: 0 } },
  { principal: { kind: 'admin', userId: id(4) } },
])('rejects invalid policy input %j', (patch) =>
  rejects({ ...context(), ...patch }, 'VALIDATION_FAILED'),
)
it('rejects an invalid clock', () => rejects(context(), 'VALIDATION_FAILED', new Date('invalid')))

it('supports the nonnegative initial terms version without inventing version increments', () => {
  const input = context()
  input.coupon.termsVersion = 0
  expect(evaluateCouponEligibility(input, now).termsSnapshot.version).toBe(0)
})
it('does not permit a second coupon nested inside priced-line input', () => {
  const input = context()
  rejects(
    { ...input, pricing: { ...input.pricing, coupon: { type: 'fixed', value: 1 } } },
    'VALIDATION_FAILED',
  )
})
it('permits compatible reacquisition when the same accepted lines are reordered', () => {
  const base = customer()
  base.pricing.items.push({ ...item, id: id(10), variantId: id(11) })
  const terms = evaluateCouponEligibility(base, now).termsSnapshot
  const input = held()
  input.accepted = { ...input.accepted, pricing: structuredClone(base.pricing), terms }
  input.pricing = { ...base.pricing, items: [...base.pricing.items].reverse() }
  expect(evaluateCouponEligibility(input, input.hold.expiresAt).source).toBe('current')
})

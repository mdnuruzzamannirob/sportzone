import { describe, expect, it } from 'vitest'
import { calculatePricing } from '../../src/modules/promotions/pricing.service.js'

const id = (n: number) => n.toString(16).padStart(24, '0')
const line = (n: number, price = 101, quantity = 1, eligible = true) => ({
  id: id(n),
  variantId: id(n + 100),
  quantity,
  couponEligible: eligible,
  regularUnitPoisha: price,
  effectiveUnitPoisha: price,
})
const quote = (
  items = [line(1)],
  coupon?: { type: 'fixed' | 'percentage'; value: number },
  deliveryChargePoisha = 0,
) => calculatePricing({ items, ...(coupon ? { coupon } : {}), deliveryChargePoisha })

describe('Database 2.3 exact monetary contracts', () => {
  it('FX-MONEY-01: rounds 50% of 101 half up to 51 poisha', () => {
    const result = quote([line(1)], { type: 'percentage', value: 5000 })
    expect(result.couponDiscountPoisha).toBe(51)
    expect(result.items[0]?.netMerchandisePoisha).toBe(50)
  })
  it('FX-MONEY-02: allocates fixed 100 over 201 and 100 as 67 plus 33', () => {
    const result = quote([line(1, 201), line(2, 100)], { type: 'fixed', value: 100 })
    expect(result.items.map((item) => item.couponAllocatedPoisha)).toEqual([67, 33])
    expect(result.finalTotalPoisha).toBe(201)
  })
  it('breaks exact remainder ties by stable item ObjectId, independent of input order', () => {
    const result = quote([line(3, 1), line(1, 1), line(2, 1)], { type: 'fixed', value: 2 })
    expect(result.items.map((item) => [item.id, item.couponAllocatedPoisha])).toEqual([
      [id(3), 0],
      [id(1), 1],
      [id(2), 1],
    ])
    expect(
      quote([line(1, 1), line(2, 1), line(3, 1)], { type: 'fixed', value: 2 }).items.map(
        (item) => item.couponAllocatedPoisha,
      ),
    ).toEqual([1, 1, 0])
  })
  it('applies sale prices before coupons and excludes delivery and ineligible merchandise', () => {
    const result = quote(
      [{ ...line(1, 1000, 2), effectiveUnitPoisha: 500 }, line(2, 900, 1, false)],
      { type: 'percentage', value: 5000 },
      123,
    )
    expect(result).toMatchObject({
      regularSubtotalPoisha: 2900,
      productDiscountPoisha: 1000,
      saleSubtotalPoisha: 1900,
      couponEligibleSubtotalPoisha: 1000,
      couponDiscountPoisha: 500,
      deliveryChargePoisha: 123,
      finalTotalPoisha: 1523,
    })
    expect(result.items.map((item) => item.couponAllocatedPoisha)).toEqual([500, 0])
  })
  it.each([
    { type: 'fixed' as const, value: 999 },
    { type: 'percentage' as const, value: 10000 },
  ])('caps discount at eligible merchandise for %s', (coupon) => {
    const result = quote([line(1, 100), line(2, 200, 1, false)], coupon, 50)
    expect(result.couponDiscountPoisha).toBe(100)
    expect(result.finalTotalPoisha).toBe(250)
  })
  it('supports no coupon, a zero sale price and explicit delivery without changing inputs', () => {
    const input = { items: [{ ...line(1, 100), effectiveUnitPoisha: 0 }], deliveryChargePoisha: 50 }
    const before = structuredClone(input)
    const result = calculatePricing(input)
    expect(result).toMatchObject({
      regularSubtotalPoisha: 100,
      saleSubtotalPoisha: 0,
      couponDiscountPoisha: 0,
      finalTotalPoisha: 50,
    })
    expect(input).toEqual(before)
    expect(calculatePricing(input)).toEqual(result)
  })
  it('keeps a percentage rounded below half a poisha at zero', () => {
    expect(quote([line(1, 1)], { type: 'percentage', value: 1 }).couponDiscountPoisha).toBe(0)
    expect(quote([line(1, 1)], { type: 'percentage', value: 4999 }).couponDiscountPoisha).toBe(0)
    expect(quote([line(1, 1)], { type: 'percentage', value: 5000 }).couponDiscountPoisha).toBe(1)
  })
  it('does not allocate any remainder to zero-value or noneligible lines', () => {
    const result = quote([line(1, 0), line(2, 1, 1, false), line(3, 1), line(4, 1)], {
      type: 'fixed',
      value: 1,
    })
    expect(result.items.map((item) => item.couponAllocatedPoisha)).toEqual([0, 0, 1, 0])
  })
  it('uses exact intermediate products well beyond safe Number multiplication', () => {
    const max = Number.MAX_SAFE_INTEGER
    const result = quote([line(1, max)], { type: 'percentage', value: 5000 })
    expect(result.couponDiscountPoisha).toBe(4503599627370496)
    expect(result.finalTotalPoisha).toBe(4503599627370495)
    const split = quote([line(1, 4000000000000000), line(2, 3000000000000000)], {
      type: 'fixed',
      value: 5000000000000000,
    })
    expect(split.items.map((item) => item.couponAllocatedPoisha)).toEqual([
      2857142857142857, 2142857142857143,
    ])
  })
  it('accepts exactly the safe output boundary', () => {
    expect(quote([line(1, Number.MAX_SAFE_INTEGER)]).finalTotalPoisha).toBe(Number.MAX_SAFE_INTEGER)
  })
  it.each([
    () => quote([line(1, Number.MAX_SAFE_INTEGER, 2)]),
    () => quote([line(1, Number.MAX_SAFE_INTEGER), line(2, 1)]),
    () => quote([line(1, Number.MAX_SAFE_INTEGER)], undefined, 1),
  ])('rejects an overflowing line/subtotal/final value', (run) => {
    expect(run).toThrow(expect.objectContaining({ code: 'BUSINESS_RULE_VIOLATION' }))
  })
  it.each([{ items: [line(1, 0)] }, { items: [line(1, 100, 1, false)] }])(
    'rejects coupon use with zero eligible subtotal',
    ({ items }) => {
      expect(() => quote(items, { type: 'fixed', value: 1 })).toThrow(
        expect.objectContaining({ code: 'BUSINESS_RULE_VIOLATION' }),
      )
    },
  )
  it('reconciles deterministic bounded workloads and permutation-invariant allocation', () => {
    let seed = 7823
    const next = () => {
      seed = (seed * 48271) % 2147483647
      return seed
    }
    for (let run = 0; run < 200; run++) {
      const items = Array.from({ length: 1 + (next() % 40) }, (_, index) => {
        const regular = 1 + (next() % 100000)
        return {
          ...line(index + 1, regular, 1 + (next() % 50), index === 0 || next() % 3 !== 0),
          effectiveUnitPoisha: 1 + (next() % regular),
        }
      })
      const coupon =
        run % 2
          ? { type: 'fixed' as const, value: 1 + (next() % 100000) }
          : { type: 'percentage' as const, value: 1 + (next() % 10000) }
      const result = quote(items, coupon, 123)
      const reversed = quote([...items].reverse(), coupon, 123)
      const allocation = (value: typeof result) =>
        value.items
          .map((item) => [item.id, item.couponAllocatedPoisha])
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
      expect(allocation(result)).toEqual(allocation(reversed))
      expect(result.items.reduce((sum, item) => sum + item.couponAllocatedPoisha, 0)).toBe(
        result.couponDiscountPoisha,
      )
      expect(result.items.reduce((sum, item) => sum + item.netMerchandisePoisha, 123)).toBe(
        result.finalTotalPoisha,
      )
      const E = BigInt(result.couponEligibleSubtotalPoisha),
        D = BigInt(result.couponDiscountPoisha)
      for (const item of result.items) {
        expect(item.couponAllocatedPoisha).toBeGreaterThanOrEqual(0)
        expect(item.couponAllocatedPoisha).toBeLessThanOrEqual(item.saleLinePoisha)
        if (!item.couponEligible) expect(item.couponAllocatedPoisha).toBe(0)
        else {
          const diff = BigInt(item.couponAllocatedPoisha) * E - D * BigInt(item.saleLinePoisha)
          expect(diff < E && diff > -E).toBe(true)
        }
      }
    }
  })
})

describe('strict trusted pricing input boundary', () => {
  it.each([
    { items: [] },
    { items: Array.from({ length: 41 }, (_, n) => line(n + 1)) },
    { items: [line(1), line(1)] },
    { items: [line(1), { ...line(2), variantId: line(1).variantId }] },
    { items: [{ ...line(1), id: 'bad' }] },
    { items: [{ ...line(1), quantity: 0 }] },
    { items: [{ ...line(1), quantity: 51 }] },
    { items: [{ ...line(1), quantity: 1.5 }] },
    { items: [{ ...line(1), regularUnitPoisha: -1 }] },
    { items: [{ ...line(1), effectiveUnitPoisha: 102 }] },
    { items: [{ ...line(1), effectiveUnitPoisha: '10' }] },
    { items: [{ ...line(1), regularUnitPoisha: Number.POSITIVE_INFINITY }] },
    { items: [{ ...line(1), regularUnitPoisha: Number.NaN }] },
    { items: [{ ...line(1), regularUnitPoisha: Number.MAX_SAFE_INTEGER + 1 }] },
    { coupon: { type: 'fixed', value: 0 } },
    { coupon: { type: 'percentage', value: 10001 } },
    { coupon: { type: 'percentage', value: 0.5 } },
    { coupon: { type: 'percentage', value: 0 } },
    { coupon: [{ type: 'fixed', value: 1 }] },
    { coupon: { type: 'fixed', value: 1, extra: true } },
    { deliveryChargePoisha: -1 },
    { deliveryChargePoisha: '100' },
    { suppliedFinalTotal: 0 },
  ])('rejects invalid payload %j', (patch) => {
    expect(() => calculatePricing({ items: [line(1)], deliveryChargePoisha: 0, ...patch })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    )
  })
})

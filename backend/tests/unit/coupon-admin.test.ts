import { expect, it } from 'vitest'
import {
  couponInput,
  couponPatch,
  couponListQuery,
  parseCouponRevision,
} from '../../src/modules/promotions/coupon-admin.schema.js'
const base = {
  code: ' save ',
  type: 'percentage',
  value: 10000,
  minEligibleSubtotalPoisha: 0,
  startsAt: '2026-10-25T00:00:00Z',
  expiresAt: '2026-10-26T00:00:00Z',
  status: 'active',
}
it('normalizes code while retaining exact monetary bounds', () => {
  expect(couponInput.parse(base).code).toBe('SAVE')
  expect(couponInput.safeParse({ ...base, value: 10001 }).success).toBe(false)
  expect(
    couponInput.safeParse({ ...base, type: 'fixed', value: Number.MAX_SAFE_INTEGER }).success,
  ).toBe(true)
  expect(
    couponInput.safeParse({ ...base, type: 'fixed', value: Number.MAX_SAFE_INTEGER + 1 }).success,
  ).toBe(false)
})
it('rejects zero/negative/fractional policy and unsafe cross-field dates', () => {
  for (const value of [0, -1, 1.5, '100'])
    expect(couponInput.safeParse({ ...base, value }).success).toBe(false)
  expect(couponInput.safeParse({ ...base, expiresAt: base.startsAt }).success).toBe(false)
  expect(couponInput.safeParse({ ...base, startsAt: 'invalid' }).success).toBe(false)
})
it('distinguishes omitted optional fields from explicit configuration removal', () => {
  expect(couponPatch.parse({ overallLimit: null })).toEqual({ overallLimit: null })
  expect(couponPatch.safeParse({}).success).toBe(false)
  expect(couponPatch.safeParse({ code: null }).success).toBe(false)
  expect(couponPatch.safeParse({ revision: 1 }).success).toBe(false)
})
it('rejects duplicate scopes and unsafe pagination offsets', () => {
  const id = 'a'.repeat(24)
  expect(couponInput.safeParse({ ...base, eligibleProductIds: [id, id] }).success).toBe(false)
  expect(
    couponListQuery.safeParse({ page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' }).success,
  ).toBe(false)
})
it('accepts only strong canonical bounded revision tokens', () => {
  expect(parseCouponRevision(undefined)).toBeUndefined()
  expect(parseCouponRevision('"0"')).toBe(0)
  expect(parseCouponRevision(`"${Number.MAX_SAFE_INTEGER}"`)).toBe(Number.MAX_SAFE_INTEGER)
  for (const token of ['W/"0"', '"01"', '*', '1', '"-1"', '"9007199254740992"', '"1", "2"'])
    expect(Number.isNaN(parseCouponRevision(token))).toBe(true)
})

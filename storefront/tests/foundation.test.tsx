import { describe, expect, it } from 'vitest'
import { verifyDimensions, verifyTypography } from '../../tests/typography'
import { formatBdt } from '../src/lib/format-bdt'

describe('typography and display foundation', () => {
  it('TYPE-01: fonts are local WOFF2 with swap and Latin/Bengali fallbacks', () =>
    verifyTypography('storefront'))
  it(
    'TYPE-02: typography, spacing, control and radius values match Design',
    verifyDimensions,
  )
  it.each([
    [0, '৳0'],
    [1, '৳0.01'],
    [10, '৳0.10'],
    [99, '৳0.99'],
    [100, '৳1'],
    [105, '৳1.05'],
    [150, '৳1.50'],
    [100000, '৳1,000'],
    [123456789, '৳1,234,567.89'],
    [Number.MAX_SAFE_INTEGER, '৳90,071,992,547,409.91'],
  ])('BDT-01: %s integer poisha formats exactly as %s', (amount, expected) => {
    expect(formatBdt(amount)).toBe(expected)
  })
  it.each([-1, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'BDT-02: rejects invalid numeric input %s',
    (value) => {
      expect(() => formatBdt(value)).toThrow(RangeError)
    },
  )
  it('BDT-03: rejects untyped JavaScript inputs without coercion', () => {
    for (const value of ['100', null, undefined, true, 100n]) {
      expect(() => Reflect.apply(formatBdt, undefined, [value])).toThrow(
        RangeError,
      )
    }
  })
})

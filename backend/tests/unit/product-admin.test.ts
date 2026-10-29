import { expect, it } from 'vitest'
import {
  productCreate,
  productPatch,
  productListQuery,
} from '../../src/modules/catalog/products/product-admin.schema.js'
import { variantInput, variantPatch } from '../../src/modules/catalog/variants/variant.schema.js'
const variant = { sku: ' default-sku ', attributes: {}, regularPricePoisha: 100 }
const input = {
  name: ' Ball ',
  slug: ' BALL ',
  description: 'Plain',
  categoryIds: ['a'.repeat(24)],
  variants: [variant],
}
it('requires atomic initial variants and normalizes identity', () => {
  const parsed = productCreate.parse(input)
  expect(parsed.slug).toBe('ball')
  expect(parsed.variants[0]?.sku).toBe('DEFAULT-SKU')
  for (const variants of [undefined, [], Array(101).fill(variant)])
    expect(productCreate.safeParse({ ...input, variants }).success).toBe(false)
})
it('rejects inconsistent default/option aggregates and normalized duplicate identities', () => {
  for (const variants of [
    [variant, { ...variant, sku: 'OTHER', attributes: { size: 'm' } }],
    [
      { ...variant, attributes: { size: ' M ' } },
      { ...variant, sku: 'OTHER', attributes: { size: 'm' } },
    ],
  ])
    expect(productCreate.safeParse({ ...input, variants }).success).toBe(false)
  expect(
    variantInput.safeParse({ ...variant, attributes: JSON.parse('{"__proto__":"unsafe"}') })
      .success,
  ).toBe(false)
})
it('keeps stock and identity private and supports nullable price/threshold clears only', () => {
  expect(variantPatch.parse({ salePricePoisha: null, lowStockThreshold: null })).toEqual({
    salePricePoisha: null,
    lowStockThreshold: null,
  })
  for (const raw of [
    { sku: 'CHANGE' },
    { attributes: {} },
    { stock: { physical: 1 } },
    {},
    { status: null },
    { regularPricePoisha: null },
  ])
    expect(variantPatch.safeParse(raw).success).toBe(false)
  for (const raw of [
    { variants: [variant] },
    { images: null },
    { revision: 1 },
    { ratingSummary: {} },
    {},
  ])
    expect(productPatch.safeParse(raw).success).toBe(false)
})
it('rejects forged/duplicate gallery inputs and bounds list pagination', () => {
  const image = {
    publicId: `sportzone/${'a'.repeat(24)}`,
    url: 'https://res.cloudinary.com/synthetic/image.png',
  }
  expect(productPatch.safeParse({ images: [image, image] }).success).toBe(false)
  expect(
    productPatch.safeParse({ images: [{ ...image, url: 'http://outside/image.png' }] }).success,
  ).toBe(false)
  expect(productPatch.parse({ images: [] })).toEqual({ images: [] })
  expect(productListQuery.safeParse({ pageSize: '101' }).success).toBe(false)
})
it('enforces integer money and merged-price prerequisites without rounding', () => {
  for (const regularPricePoisha of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1'])
    expect(variantInput.safeParse({ ...variant, regularPricePoisha }).success).toBe(false)
  expect(variantInput.safeParse({ ...variant, salePricePoisha: 101 }).success).toBe(false)
  expect(variantInput.safeParse({ ...variant, salePricePoisha: 0 }).success).toBe(true)
})

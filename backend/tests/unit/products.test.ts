import { describe, expect, it } from 'vitest'
import {
  attributes,
  attributeSignature,
  productInput,
  variantBatch,
  variantInput,
} from '../../src/modules/catalog/products/product.schema.js'

const variant = { sku: 'ball-1', attributes: {}, regularPricePoisha: 12000 }
describe('product and variant contract validation', () => {
  it('normalizes SKU/options and uses collision-safe sorted signatures', () => {
    expect(variantInput.parse(variant).sku).toBe('BALL-1')
    const a = attributes.parse({ ' Size ': ' XL ', COLOR: ' Red ' })
    const b = attributes.parse({ color: 'red', size: 'xl' })
    expect(attributeSignature(a)).toBe(attributeSignature(b))
    expect(attributeSignature({})).toBe('default')
    expect(attributeSignature({ a: 'b:c' })).not.toBe(attributeSignature({ 'a:b': 'c' }))
  })
  it('rejects unsafe money, null sale and sales above regular; allows zero and absent sale', () => {
    for (const regularPricePoisha of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
      expect(variantInput.safeParse({ ...variant, regularPricePoisha }).success).toBe(false)
    }
    for (const salePricePoisha of [null, -1, 12001])
      expect(variantInput.safeParse({ ...variant, salePricePoisha }).success).toBe(false)
    expect(variantInput.parse({ ...variant, salePricePoisha: 0 }).salePricePoisha).toBe(0)
    expect(variantInput.parse(variant)).not.toHaveProperty('salePricePoisha')
  })
  it('rejects duplicate/mixed/default combinations, unsafe map keys and protected stock', () => {
    expect(variantBatch.safeParse([]).success).toBe(false)
    expect(variantBatch.safeParse([variant, { ...variant, sku: 'other' }]).success).toBe(false)
    expect(
      variantBatch.safeParse([variant, { ...variant, sku: 'other', attributes: { size: 'xl' } }])
        .success,
    ).toBe(false)
    expect(
      variantBatch.safeParse([
        { ...variant, attributes: { size: 'XL' } },
        { ...variant, sku: 'other', attributes: { SIZE: ' xl ' } },
      ]).success,
    ).toBe(false)
    for (const key of ['$size', 'a.b', 'constructor', 'prototype'])
      expect(attributes.safeParse({ [key]: 'value' }).success).toBe(false)
    expect(attributes.safeParse({ Size: 'xl', ' size ': 'l' }).success).toBe(false)
    expect(variantInput.safeParse({ ...variant, stock: { physical: 100 } }).success).toBe(false)
  })
  it('rejects oversized normalized options and bounds aggregate batches', () => {
    expect(attributes.safeParse({ size: '\u0000' }).success).toBe(false)
    expect(attributes.safeParse(JSON.parse('{"__proto__":"bad"}')).success).toBe(false)
    expect(attributes.safeParse({ size: 'x'.repeat(121) }).success).toBe(false)
    expect(
      attributes.safeParse(
        Object.fromEntries(Array.from({ length: 31 }, (_, index) => [`key${index}`, 'value'])),
      ).success,
    ).toBe(false)
    expect(
      variantBatch.safeParse(
        Array.from({ length: 101 }, (_, index) => ({
          ...variant,
          sku: `SKU-${index}`,
          attributes: { size: `${index}` },
        })),
      ).success,
    ).toBe(false)
  })
  it('bounds and normalizes product metadata and rejects raw media/markup/internal counters', () => {
    const data = {
      name: ' Ball ',
      slug: ' Ball ',
      description: 'Plain description',
      categoryIds: ['012345678901234567890123'],
    }
    expect(productInput.parse({ ...data, keywords: [' BALL ', 'ball'] })).toMatchObject({
      name: 'Ball',
      slug: 'ball',
      keywords: ['ball'],
      status: 'draft',
      images: [],
    })
    for (const invalid of [
      { name: 'x'.repeat(121) },
      { slug: 'x'.repeat(161) },
      { categoryIds: [] },
      { categoryIds: [data.categoryIds[0], data.categoryIds[0]] },
      { description: '<img src=x onerror=bad()>' },
      { images: [{ publicId: 'foreign' }] },
      { ratingSummary: { average: 5 } },
      { revision: 1 },
      { stock: 1 },
    ]) {
      expect(productInput.safeParse({ ...data, ...invalid }).success).toBe(false)
    }
  })
})

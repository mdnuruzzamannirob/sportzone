import { expect, it } from 'vitest'
import {
  productQuery,
  categoryQuery,
  productCard,
} from '../../src/modules/catalog/catalog.schema.js'
it('defaults bounded pages and explicitly normalizes literal Unicode search words', () => {
  expect(productQuery.parse({})).toEqual({ page: 1, pageSize: 20, sort: 'newest' })
  expect(
    productQuery.parse({ q: ' "Cricket" -লাল ', inStock: 'false', minPricePoisha: '0' }),
  ).toMatchObject({ q: '"Cricket" "লাল"', inStock: false, minPricePoisha: 0 })
})
it.each([
  { q: ' ' },
  { q: 'x'.repeat(121) },
  { q: Array(11).fill('ball').join(' ') },
  { q: 'bad\nterm' },
  { q: ['one', 'two'] },
  { q: '.*' },
  { page: '0' },
  { page: '-1' },
  { pageSize: '101' },
  { minPricePoisha: '-1' },
  { minPricePoisha: '1.5' },
  { minPricePoisha: '9007199254740992' },
  { minPricePoisha: '5', maxPricePoisha: '4' },
  { inStock: 'yes' },
  { sort: '$where' },
  { category: { $ne: 'x' } },
  { unknown: 'x' },
])('rejects malformed query %j', (input) => {
  expect(productQuery.safeParse(input).success).toBe(false)
})
it('keeps category queries strict and prevents stock/revision fields in public DTOs', () => {
  expect(categoryQuery.safeParse({ status: 'inactive' }).success).toBe(false)
  const card = {
    id: 'id',
    name: 'Ball',
    slug: 'ball',
    regularPricePoisha: 100,
    effectivePricePoisha: 90,
    availability: 'available',
  }
  expect(productCard.safeParse(card).success).toBe(true)
  expect(productCard.safeParse({ ...card, stock: { physical: 5 } }).success).toBe(false)
})

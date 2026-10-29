import { storefrontHome } from '../../src/modules/catalog/catalog.schema.js'
import { expect, it } from 'vitest'
import {
  productQuery,
  categoryQuery,
  productCard,
  publicVariant,
  productDetail,
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

it('validates detail quantity/price projections and disallows private variant fields', () => {
  const variant = {
    id: '535a00000000000000000001',
    sku: 'BALL',
    attributes: {},
    regularPricePoisha: 100,
    effectivePricePoisha: 90,
    availableQty: 0,
  }
  expect(publicVariant.safeParse(variant).success).toBe(true)
  for (const patch of [
    { availableQty: -1 },
    { availableQty: 1.5 },
    { effectivePricePoisha: 101 },
    { stock: { physical: 5 } },
    { revision: 1 },
  ])
    expect(publicVariant.safeParse({ ...variant, ...patch }).success).toBe(false)
})
it('requires bounded nonempty actual variants and related card allowlists', () => {
  const data = {
    id: 'id',
    name: 'Ball',
    slug: 'ball',
    regularPricePoisha: 100,
    effectivePricePoisha: 100,
    availability: 'unavailable',
    description: 'Plain text',
    categories: [{ id: 'category', name: 'Sports', slug: 'sports' }],
    images: [],
    variants: [
      {
        id: '535a00000000000000000001',
        sku: 'BALL',
        attributes: {},
        regularPricePoisha: 100,
        effectivePricePoisha: 100,
        availableQty: 0,
      },
    ],
    relatedProducts: [],
  }
  expect(productDetail.safeParse(data).success).toBe(true)
  expect(productDetail.safeParse({ ...data, variants: [] }).success).toBe(false)
  const card = {
    id: data.id,
    name: data.name,
    slug: data.slug,
    regularPricePoisha: data.regularPricePoisha,
    effectivePricePoisha: data.effectivePricePoisha,
    availability: data.availability,
  }
  expect(productDetail.safeParse({ ...data, relatedProducts: Array(6).fill(card) }).success).toBe(
    true,
  )
  expect(productDetail.safeParse({ ...data, relatedProducts: Array(7).fill(card) }).success).toBe(
    false,
  )
  expect(
    productDetail.safeParse({ ...data, variants: Array(101).fill(data.variants[0]) }).success,
  ).toBe(false)
  expect(
    productDetail.safeParse({
      ...data,
      images: Array(13).fill({ url: 'https://media.example.test/ball.png', alt: 'Ball' }),
    }).success,
  ).toBe(false)
})

it('bounds homepage sections and rejects private metadata or invented banner destinations', () => {
  const empty = { featured: [], newArrivals: [], discounted: [], categories: [], policyLinks: [] }
  expect(storefrontHome.parse(empty)).toEqual(empty)
  expect(
    storefrontHome.safeParse({ ...empty, paymentChannels: { codEnabled: true } }).success,
  ).toBe(false)
  expect(
    storefrontHome.safeParse({
      ...empty,
      policyLinks: [{ type: 'terms', version: 'v1', href: 'https://foreign.example.test/policy' }],
    }).success,
  ).toBe(false)
  const card = {
    id: 'a'.repeat(24),
    slug: 'synthetic',
    name: 'Synthetic',
    regularPricePoisha: 1,
    effectivePricePoisha: 1,
    availability: 'unavailable',
  }
  expect(storefrontHome.safeParse({ ...empty, featured: Array(9).fill(card) }).success).toBe(false)
  expect(
    storefrontHome.safeParse({
      ...empty,
      categories: Array(13).fill({ id: 'a'.repeat(24), slug: 'sports', name: 'Sports' }),
    }).success,
  ).toBe(false)
})

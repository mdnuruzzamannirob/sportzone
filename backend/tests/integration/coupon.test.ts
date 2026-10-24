import { evaluateCouponEligibility } from '../../src/modules/promotions/coupon.service.js'
import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { attributeSignature } from '../../src/modules/catalog/variants/variant.schema.js'
import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { createPricingService } from '../../src/modules/promotions/pricing.service.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let service: ReturnType<typeof createPricingService>
let category: Types.ObjectId
beforeAll(async () => {
  db = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeProductPersistence(db.connection)
  service = createPricingService(catalogService(db.connection, async () => new Map()))
})
beforeEach(async () => {
  const row = await categoryModel(db.connection).create({
    name: 'Synthetic',
    slug: `category-${randomUUID()}`,
    status: 'active',
  })
  category = row._id
})
afterAll(async () => {
  await db?.close()
})
async function variant(regular = 1000, sale?: number) {
  const models = productModels(db.connection),
    slug = `product-${randomUUID()}`
  const product = await models.products.create({
    name: 'Synthetic',
    slug,
    description: 'Synthetic',
    categoryIds: [category],
    status: 'active',
  })
  const row = await models.variants.create({
    productId: product._id,
    skuNormalized: slug.toUpperCase(),
    attributes: {},
    attributeSignature: attributeSignature({}),
    regularPricePoisha: regular,
    ...(sale !== undefined ? { salePricePoisha: sale } : {}),
    stock: { physical: 0, reserved: 0, committed: 0 },
    status: 'active',
  })
  return {
    row,
    product,
    item: {
      id: new Types.ObjectId().toHexString(),
      variantId: row._id.toHexString(),
      quantity: 2,
      couponEligible: true,
    },
  }
}
const now = new Date('2026-10-24T06:00:00Z')
async function policy(item: Awaited<ReturnType<typeof variant>>, eligible = true) {
  const quote = await service.quote({
    items: [{ ...item.item, couponEligible: eligible }],
    deliveryChargePoisha: 100,
  })
  return {
    code: 'SAVE',
    principal: { kind: 'guest' as const },
    coupon: {
      id: new Types.ObjectId().toHexString(),
      codeNormalized: 'SAVE',
      type: 'fixed' as const,
      value: 100,
      status: 'active' as const,
      startsAt: new Date(now.getTime() - 1000),
      expiresAt: new Date(now.getTime() + 3600000),
      minEligibleSubtotalPoisha: 100,
      heldCount: 0,
      redeemedCount: 0,
      termsVersion: 1,
    },
    pricing: {
      items: quote.items.map(
        ({ id, variantId, quantity, couponEligible, regularUnitPoisha, effectiveUnitPoisha }) => ({
          id,
          variantId,
          quantity,
          couponEligible,
          regularUnitPoisha,
          effectiveUnitPoisha,
        }),
      ),
      deliveryChargePoisha: quote.deliveryChargePoisha,
    },
  }
}
it('evaluates against real authoritative post-sale prices, not regular prices or delivery', async () => {
  const item = await variant(1000, 200),
    input = await policy(item)
  input.coupon.minEligibleSubtotalPoisha = 500
  expect(() => evaluateCouponEligibility(input, now)).toThrow(
    expect.objectContaining({ code: 'COUPON_UNAVAILABLE' }),
  )
  input.coupon.minEligibleSubtotalPoisha = 400
  expect(evaluateCouponEligibility(input, now).pricing).toMatchObject({
    couponEligibleSubtotalPoisha: 400,
    couponDiscountPoisha: 100,
    finalTotalPoisha: 400,
  })
})
it('does not count out-of-scope merchandise toward coupon minimum', async () => {
  const input = await policy(await variant(1000), false)
  expect(() => evaluateCouponEligibility(input, now)).toThrow(
    expect.objectContaining({ code: 'COUPON_UNAVAILABLE' }),
  )
})
it('preserves accepted terms through live hold after a real catalog price change', async () => {
  const item = await variant(1000, 500),
    input = await policy(item),
    accepted = evaluateCouponEligibility(input, now)
  const orderId = new Types.ObjectId().toHexString()
  await productModels(db.connection).variants.updateOne(
    { _id: item.row._id },
    { $set: { salePricePoisha: 250 } },
  )
  const current = await policy(item)
  const context = {
    ...current,
    coupon: { ...input.coupon, status: 'inactive' },
    accepted: {
      orderId,
      couponId: input.coupon.id,
      pricing: input.pricing,
      terms: accepted.termsSnapshot,
    },
    hold: {
      orderId,
      couponId: input.coupon.id,
      heldAt: new Date(now),
      expiresAt: new Date(now.getTime() + 900000),
      status: 'held',
    },
  }
  expect(evaluateCouponEligibility(context, now)).toMatchObject({
    source: 'live_hold',
    pricing: { finalTotalPoisha: 1000 },
    termsSnapshot: { value: 100 },
  })
  const active = { ...context, coupon: input.coupon }
  expect(() => evaluateCouponEligibility(active, context.hold.expiresAt)).toThrow(
    expect.objectContaining({ code: 'STATE_CONFLICT' }),
  )
})
it('revalidates current minima and global capacity after expiry', async () => {
  const input = await policy(await variant(1000, 500)),
    original = evaluateCouponEligibility(input, now),
    orderId = new Types.ObjectId().toHexString()
  const context = {
    ...input,
    accepted: {
      orderId,
      couponId: input.coupon.id,
      pricing: input.pricing,
      terms: original.termsSnapshot,
    },
    hold: {
      orderId,
      couponId: input.coupon.id,
      status: 'held',
      heldAt: new Date(now),
      expiresAt: new Date(now.getTime() + 900000),
    },
  }
  expect(evaluateCouponEligibility(context, context.hold.expiresAt).source).toBe('current')
  expect(() =>
    evaluateCouponEligibility(
      { ...context, coupon: { ...input.coupon, minEligibleSubtotalPoisha: 1001 } },
      context.hold.expiresAt,
    ),
  ).toThrow(expect.objectContaining({ code: 'COUPON_UNAVAILABLE' }))
  expect(() =>
    evaluateCouponEligibility(
      { ...context, coupon: { ...input.coupon, overallLimit: 1, heldCount: 1 } },
      context.hold.expiresAt,
    ),
  ).toThrow(expect.objectContaining({ code: 'COUPON_UNAVAILABLE' }))
})
it('does not mutate quota contexts or create any durable allocation/order records', async () => {
  const item = await variant(101),
    input = await policy(item),
    before = structuredClone(input)
  evaluateCouponEligibility(input, now)
  evaluateCouponEligibility(input, now)
  expect(input).toEqual(before)
  for (const name of [
    'coupons',
    'couponCustomerCounters',
    'couponRedemptions',
    'inventoryReservations',
    'inventoryMovements',
    'orders',
    'checkoutQuotes',
    'carts',
  ])
    expect(await db.connection.db?.collection(name).countDocuments()).toBe(0)
  expect((await productModels(db.connection).variants.findById(item.row._id))?.stock).toMatchObject(
    { physical: 0, reserved: 0, committed: 0 },
  )
})
it('requires a customer-bound counter snapshot for a limited coupon', async () => {
  const input = await policy(await variant(101)),
    userId = new Types.ObjectId().toHexString(),
    coupon = { ...input.coupon, perCustomerLimit: 1 }
  expect(() => evaluateCouponEligibility({ ...input, coupon }, now)).toThrow(
    expect.objectContaining({ code: 'COUPON_UNAVAILABLE' }),
  )
  expect(
    evaluateCouponEligibility(
      {
        ...input,
        coupon,
        principal: { kind: 'customer', userId },
        customerUsage: { couponId: coupon.id, userId, heldCount: 0, redeemedCount: 0 },
      },
      now,
    ).source,
  ).toBe('current')
  expect(() =>
    evaluateCouponEligibility(
      {
        ...input,
        coupon,
        principal: { kind: 'customer', userId },
        customerUsage: { couponId: coupon.id, userId, heldCount: 1, redeemedCount: 0 },
      },
      now,
    ),
  ).toThrow(expect.objectContaining({ code: 'COUPON_UNAVAILABLE' }))
})

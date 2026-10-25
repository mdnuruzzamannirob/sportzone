import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
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
it('consumes selected SKU regular/sale prices through the real catalog boundary', async () => {
  const item = await variant(1000, 500)
  const result = await service.quote({
    items: [item.item],
    deliveryChargePoisha: 100,
    coupon: { type: 'percentage', value: 5000 },
  })
  expect(result).toMatchObject({
    regularSubtotalPoisha: 2000,
    productDiscountPoisha: 1000,
    couponEligibleSubtotalPoisha: 1000,
    couponDiscountPoisha: 500,
    finalTotalPoisha: 600,
  })
  expect(result.items[0]).toMatchObject({
    id: item.item.id,
    variantId: item.item.variantId,
    regularUnitPoisha: 1000,
    effectiveUnitPoisha: 500,
  })
})
it('re-fetches current prices and leaves earlier returned arithmetic snapshots unchanged', async () => {
  const item = await variant(1000, 500),
    input = { items: [item.item], deliveryChargePoisha: 0 }
  const previous = await service.quote(input)
  await productModels(db.connection).variants.updateOne(
    { _id: item.row._id },
    { $set: { salePricePoisha: 250 } },
  )
  expect((await service.quote(input)).finalTotalPoisha).toBe(500)
  expect(previous.finalTotalPoisha).toBe(1000)
})
it.each(['missing', 'inactive-variant', 'inactive-product', 'hidden-category'])(
  'rejects %s selections rather than pricing a partial list',
  async (kind) => {
    const item = await variant()
    if (kind === 'inactive-variant')
      await productModels(db.connection).variants.updateOne(
        { _id: item.row._id },
        { $set: { status: 'inactive' } },
      )
    if (kind === 'inactive-product')
      await productModels(db.connection).products.updateOne(
        { _id: item.product._id },
        { $set: { status: 'inactive' } },
      )
    if (kind === 'hidden-category')
      await categoryModel(db.connection).updateOne(
        { _id: category },
        { $set: { status: 'inactive' } },
      )
    await expect(
      service.quote({
        items: [
          {
            ...item.item,
            ...(kind === 'missing' ? { variantId: new Types.ObjectId().toHexString() } : {}),
          },
        ],
        deliveryChargePoisha: 0,
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  },
)
it('rejects supplied money or subtotal overrides at the request boundary', async () => {
  const item = await variant()
  await expect(
    service.quote({ items: [{ ...item.item, effectiveUnitPoisha: 0 }], deliveryChargePoisha: 0 }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await expect(
    service.quote({ items: [item.item], finalTotalPoisha: 0, deliveryChargePoisha: 0 }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
})
it('prices out-of-stock selections without stock mutation, holds or cart persistence', async () => {
  const item = await variant(101)
  const result = await service.quote({ items: [item.item], deliveryChargePoisha: 0 })
  expect(result.finalTotalPoisha).toBe(202)
  expect((await productModels(db.connection).variants.findById(item.row._id))?.stock).toMatchObject(
    { physical: 0, reserved: 0, committed: 0 },
  )
  for (const name of [
    'inventoryMovements',
    'inventoryReservations',
    'couponRedemptions',
    'carts',
    'checkoutQuotes',
    'orders',
  ])
    expect(await db.connection.db?.collection(name).countDocuments()).toBe(0)
})
it('supports the caller transaction snapshot without starting a nested transaction', async () => {
  const item = await variant(101),
    input = { items: [item.item], deliveryChargePoisha: 0 }
  await inTransaction(db.connection, async (session) => {
    expect((await service.quote(input, session)).finalTotalPoisha).toBe(202)
    await productModels(db.connection).variants.updateOne(
      { _id: item.row._id },
      { $set: { regularPricePoisha: 200 } },
      { session },
    )
    expect((await service.quote(input, session)).finalTotalPoisha).toBe(400)
    await session.abortTransaction()
  })
  expect((await service.quote(input)).finalTotalPoisha).toBe(202)
})
it('respects caller eligibility flags and stable line IDs in real multi-SKU allocation', async () => {
  const a = await variant(201),
    b = await variant(100),
    c = await variant(1000)
  const result = await service.quote({
    items: [
      { ...a.item, quantity: 1 },
      { ...b.item, quantity: 1 },
      { ...c.item, quantity: 1, couponEligible: false },
    ],
    deliveryChargePoisha: 50,
    coupon: { type: 'fixed', value: 100 },
  })
  expect(result.items.map((row) => row.couponAllocatedPoisha)).toEqual([67, 33, 0])
  expect(result.finalTotalPoisha).toBe(1251)
})

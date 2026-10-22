import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { categoryService } from '../../src/modules/catalog/categories/category.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { productService } from '../../src/modules/catalog/products/product.service.js'
import { isolatedDatabase } from '../helpers/database.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let categories: ReturnType<typeof categoryService>
let products: ReturnType<typeof productService>
let categoryId: string
const variant = (sku: string, attributes: Record<string, string> = {}) => ({
  sku,
  attributes,
  regularPricePoisha: 10000,
})
const product = (slug: string, status = 'active') => ({
  name: 'Football',
  slug,
  description: 'Plain description',
  categoryIds: [categoryId],
  status,
})
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(fixture.connection))
  await initializeProductPersistence(fixture.connection)
  categories = categoryService(fixture.connection)
  products = productService(fixture.connection, categories)
})
beforeEach(async () => {
  const models = productModels(fixture.connection)
  await models.variants.deleteMany({})
  await models.products.deleteMany({})
  await categoryModel(fixture.connection).deleteMany({})
  categoryId = (await categories.create({ name: 'Sports', slug: 'sports' })).id
})
afterAll(async () => {
  await fixture?.close()
})
it('registers canonical indexed collections and idempotent explicit bootstrap without dropping extra indexes', async () => {
  const models = productModels(fixture.connection)
  expect(models.products.schema.options.autoIndex).toBe(false)
  expect(models.variants.schema.options.autoCreate).toBe(false)
  await models.products.collection.createIndex({ name: 1 }, { name: 'fixture_extra' })
  await initializeProductPersistence(fixture.connection)
  expect((await verifyDeclaredIndexes(models.products)).extraIndexes).toContain('fixture_extra')
  expect(
    (await models.variants.collection.indexes())
      .filter((index) => index.unique)
      .map((index) => index.name),
  ).toEqual(expect.arrayContaining(['variant_sku_unique', 'variant_product_signature_unique']))
  expect(productModels(fixture.connection).variants).toBe(models.variants)
})
it('creates one default SKU atomically with zero counters, normalized metadata and absent optional values', async () => {
  const result = await products.create(
    { ...product(' BALL '), keywords: [' BALL ', 'ball'], featured: true },
    [variant(' ball-1 ')],
  )
  expect(result.product.slug).toBe('ball')
  expect(result.product.keywords).toEqual(['ball'])
  expect(result.product.ratingSummary).toMatchObject({ average: 0, approvedCount: 0 })
  expect(result.variants).toHaveLength(1)
  const saved = await productModels(fixture.connection)
    .variants.findById(result.variants[0]?._id)
    .lean()
    .orFail()
  expect(saved).toMatchObject({
    skuNormalized: 'BALL-1',
    attributeSignature: 'default',
    stock: { physical: 0, reserved: 0, committed: 0 },
    revision: 0,
  })
  expect(saved).not.toHaveProperty('salePricePoisha')
  expect(saved).not.toHaveProperty('lowStockThreshold')
})
it('supports option-specific prices with canonical combinations and a zero sale', async () => {
  const result = await products.create(product('options'), [
    { ...variant('red-s', { Color: 'Red', Size: 'S' }), salePricePoisha: 0 },
    {
      ...variant('red-l', { Size: 'L', Color: 'RED' }),
      regularPricePoisha: 15000,
      salePricePoisha: 12000,
    },
  ])
  expect(result.variants.map((value) => value.skuNormalized)).toEqual(['RED-S', 'RED-L'])
  expect(result.variants[0]?.attributes.get('color')).toBe('red')
  expect(result.variants[0]?.salePricePoisha).toBe(0)
  expect(result.variants[1]?.regularPricePoisha).toBe(15000)
})
it('rejects missing/inactive ancestry and activation without an active SKU; draft retains guarded references', async () => {
  await expect(products.create(product('empty'), [])).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  })
  await expect(
    products.create(product('inactive-sku'), [{ ...variant('inactive'), status: 'inactive' }]),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    products.create({ ...product('missing'), categoryIds: [new Types.ObjectId().toHexString()] }, [
      variant('missing'),
    ]),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const child = await categories.create({ name: 'Child', slug: 'child', parentId: categoryId })
  const root = await categoryModel(fixture.connection).findById(categoryId).orFail()
  await categories.patch(categoryId, root.revision, { status: 'inactive' })
  await expect(
    products.create({ ...product('hidden'), categoryIds: [child.id] }, [variant('hidden')]),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const draft = await products.create(product('draft', 'draft'), [variant('draft')])
  expect(draft.product.status).toBe('draft')
  const current = await categoryModel(fixture.connection).findById(categoryId).orFail()
  await expect(
    categories.remove(categoryId, current.revision, products.hasCategoryReferences),
  ).rejects.toThrow()
})
it('rejects duplicate product slugs including concurrent normalized creates without orphan variants', async () => {
  const results = await Promise.allSettled([
    products.create(product('same'), [variant('sku-a')]),
    products.create(product(' SAME '), [variant('sku-b')]),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(await productModels(fixture.connection).products.countDocuments()).toBe(1)
  expect(await productModels(fixture.connection).variants.countDocuments()).toBe(1)
})
it('enforces global normalized SKU uniqueness even for inactive variants and rolls back entire batches', async () => {
  await products.create(product('existing', 'draft'), [
    { ...variant('unique-sku'), status: 'inactive' },
  ])
  await expect(
    products.create(product('rollback'), [
      variant('new-sku', { size: 's' }),
      variant(' UNIQUE-SKU ', { size: 'l' }),
    ]),
  ).rejects.toMatchObject({ code: 11000 })
  const models = productModels(fixture.connection)
  expect(await models.products.countDocuments()).toBe(1)
  expect(await models.variants.countDocuments()).toBe(1)
  expect(await models.variants.exists({ skuNormalized: 'NEW-SKU' })).toBeNull()
})
it('allows exactly one concurrent creator for the same normalized SKU across products', async () => {
  const other = await categories.create({ name: 'Other', slug: 'other' })
  const results = await Promise.allSettled([
    products.create(product('first'), [variant('shared-sku')]),
    products.create({ ...product('second'), categoryIds: [other.id] }, [variant(' SHARED-SKU ')]),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(await productModels(fixture.connection).products.countDocuments()).toBe(1)
  expect(await productModels(fixture.connection).variants.countDocuments()).toBe(1)
})
it('enforces default and option signature uniqueness at the database index', async () => {
  const result = await products.create(product('default'), [variant('default')])
  const models = productModels(fixture.connection)
  const original = await models.variants.findById(result.variants[0]?._id).lean().orFail()
  const { _id, ...data } = original
  await expect(
    new models.variants({ ...data, skuNormalized: 'OTHER' }).save(),
  ).rejects.toMatchObject({ code: 11000 })
  expect(_id).toBeDefined()
  const options = await products.create(product('option'), [variant('option', { size: 'xl' })])
  const originalOption = await models.variants.findById(options.variants[0]?._id).lean().orFail()
  const { _id: ignored, ...optionData } = originalOption
  await expect(
    new models.variants({ ...optionData, skuNormalized: 'OTHER-OPTION' }).save(),
  ).rejects.toMatchObject({ code: 11000 })
  expect(ignored).toBeDefined()
})
it('validates money, signature and stock invariants through owning Mongoose schemas', async () => {
  const models = productModels(fixture.connection)
  const valid = {
    productId: new Types.ObjectId(),
    skuNormalized: 'VALID',
    attributes: {},
    attributeSignature: 'default',
    regularPricePoisha: 100,
  }
  for (const fields of [
    { regularPricePoisha: '100' },
    { regularPricePoisha: 0.5 },
    { regularPricePoisha: -1 },
    { salePricePoisha: 101 },
    { salePricePoisha: null },
    { lowStockThreshold: null },
    { attributeSignature: 'invalid' },
    { attributes: { Size: 'XL' } },
    { stock: { physical: 3, reserved: 2, committed: 2 } },
    { stock: { physical: -1, reserved: 0, committed: 0 } },
  ])
    await expect(new models.variants({ ...valid, ...fields }).validate()).rejects.toThrow()
  await expect(
    new models.products({
      ...product('invalid'),
      categoryIds: [],
      description: '<script>bad()</script>',
    }).validate(),
  ).rejects.toThrow()
})
it('models bounded ordered HTTPS image references without enabling unverified attachments', async () => {
  const models = productModels(fixture.connection)
  const image = {
    publicId: 'fixture-only',
    url: 'https://example.invalid/image',
    alt: 'Ball',
    position: 0,
  }
  await expect(
    new models.products({ ...product('images'), images: [image] }).validate(),
  ).resolves.toBeUndefined()
  for (const images of [
    Array.from({ length: 13 }, () => image),
    [{ ...image, position: -1 }],
    [{ ...image, url: 'javascript:bad()' }],
    [{ ...image, url: 'https://user:password@example.invalid/image' }],
    [{ ...image, alt: '' }],
  ]) {
    await expect(
      new models.products({ ...product('bad-images'), images }).validate(),
    ).rejects.toThrow()
  }
  expect(await models.products.countDocuments()).toBe(0)
})
it('rejects raw BSON writes violating integer, price, optional-null, stock and protected-field shapes', async () => {
  const result = await products.create(product('bson'), [variant('bson')])
  const collection = productModels(fixture.connection).variants.collection
  const savedVariant = result.variants[0]
  if (!savedVariant) throw new Error('Missing fixture variant')
  for (const fields of [
    { regularPricePoisha: 0.5 },
    { regularPricePoisha: -1 },
    { salePricePoisha: 10001 },
    { salePricePoisha: null },
    { lowStockThreshold: null },
    { 'stock.physical': -1 },
    { 'stock.reserved': 1 },
    { available: 999 },
  ])
    await expect(
      collection.updateOne({ _id: savedVariant._id }, { $set: fields }),
    ).rejects.toMatchObject({ code: 121 })
  await expect(
    productModels(fixture.connection).products.collection.updateOne(
      { _id: result.product._id },
      { $set: { categoryIds: [] } },
    ),
  ).rejects.toMatchObject({ code: 121 })
})
it('serializes product association and category deletion without stranding a product', async () => {
  const root = await categoryModel(fixture.connection).findById(categoryId).orFail()
  const results = await Promise.allSettled([
    products.create(product('race'), [variant('race')]),
    categories.remove(categoryId, root.revision, products.hasCategoryReferences),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  if (await productModels(fixture.connection).products.exists({ slug: 'race' })) {
    expect(await categoryModel(fixture.connection).findById(categoryId)).not.toBeNull()
  }
})
it('rejects unsafe aggregate metadata and duplicate/mixed variants before persistence', async () => {
  for (const variants of [
    [variant('same'), variant('SAME')],
    [variant('one'), variant('two', { size: 's' })],
    [{ ...variant('stock'), stock: { physical: 50 } }],
  ]) {
    await expect(products.create(product('bad'), variants)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
  }
  await expect(
    products.create(
      {
        ...product('media'),
        images: [{ publicId: 'foreign', url: 'https://example.invalid/a', alt: 'a' }],
      },
      [variant('media')],
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  expect(await productModels(fixture.connection).products.countDocuments()).toBe(0)
})
it('fails closed on existing validator drift instead of silently migrating', async () => {
  const isolated = fixture.connection.useDb(`${fixture.connection.name}_drift`)
  try {
    await isolated.createCollection('products')
    await expect(initializeProductPersistence(isolated)).rejects.toThrow('reviewed migration')
  } finally {
    await isolated.dropCollection('products')
  }
})

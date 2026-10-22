import { mkdirSync, writeFileSync } from 'node:fs'
import { Types, type PipelineStage } from 'mongoose'
import { z } from 'zod'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
import { createApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { composeApplication } from '../../src/setup.js'
import { createApiRouter } from '../../src/routes.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { categoryService } from '../../src/modules/catalog/categories/category.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { productService } from '../../src/modules/catalog/products/product.service.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { catalogRoutes } from '../../src/modules/catalog/catalog.routes.js'
import { publicMediaService } from '../../src/modules/media/public-media.service.js'
import { mediaModel } from '../../src/modules/media/media.model.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let app: ReturnType<typeof createApp>
let root: Types.ObjectId, child: Types.ObjectId
const origin = 'https://shop.example.test'
const make = async (
  slug: string,
  price: number,
  extra: Record<string, unknown> = {},
  variants?: unknown,
) => {
  const categories = categoryService(db.connection)
  return productService(db.connection, categories).create(
    {
      name: slug,
      slug,
      description: 'Synthetic catalog',
      categoryIds: [child.toHexString()],
      status: 'active',
      ...extra,
    },
    variants ?? [{ sku: slug, attributes: {}, regularPricePoisha: price }],
  )
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeProductPersistence(db.connection)
  await createDeclaredIndexes(mediaModel(db.connection))
  // Public delivery is synthetic in this isolated test; no external provider activation is claimed.
  const images = publicMediaService(db.connection, {
    publicUrl: (id, format) => `https://media.example.test/${id}.${format}`,
  })
  app = createApp({
    apiRouter: createApiRouter(undefined, [
      catalogRoutes(catalogService(db.connection, images), [origin]),
    ]),
  })
})
beforeEach(async () => {
  await productModels(db.connection).variants.deleteMany({})
  await productModels(db.connection).products.deleteMany({})
  await categoryModel(db.connection).deleteMany({})
  await mediaModel(db.connection).deleteMany({})
  const categories = categoryService(db.connection)
  root = (await categories.create({ name: 'Sports', slug: 'sports' }))._id
  child = (
    await categories.create({ name: 'Cricket', slug: 'cricket', parentId: root.toHexString() })
  )._id
})
afterAll(async () => {
  await db?.close()
})
it('serves active-only cards and paginated categories with safe allowlists and public read CORS', async () => {
  await make('ball', 100)
  await make('hidden', 1, { status: 'draft' })
  const result = await request(app).get('/api/v1/products').set('Origin', origin).expect(200)
  expect(result.body.data).toEqual([
    expect.objectContaining({
      slug: 'ball',
      effectivePricePoisha: 100,
      availability: 'unavailable',
    }),
  ])
  expect(Object.keys(result.body.data[0]).sort()).toEqual(
    ['availability', 'effectivePricePoisha', 'id', 'name', 'regularPricePoisha', 'slug'].sort(),
  )
  expect(result.body.meta).toMatchObject({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })
  expect(result.headers['cache-control']).toBe('no-store')
  expect(result.headers['set-cookie']).toBeUndefined()
  expect(result.headers['access-control-allow-origin']).toBe(origin)
  const categories = await request(app)
    .get('/api/v1/categories?parent=sports&pageSize=1')
    .expect(200)
  expect(categories.body.data.map((x: { slug: string }) => x.slug)).toEqual(['cricket'])
  const detail = await request(app).get('/api/v1/categories/cricket').expect(200)
  expect(Object.keys(detail.body.data).sort()).toEqual(['id', 'name', 'parentId', 'slug'])
})
it('excludes inactive ancestors, orphan references, cycles and products with any hidden category', async () => {
  await make('ball', 100)
  await categoryModel(db.connection).updateOne({ _id: root }, { $set: { status: 'inactive' } })
  expect((await request(app).get('/api/v1/products').expect(200)).body.data).toEqual([])
  await request(app).get('/api/v1/categories/cricket').expect(404)
  await categoryModel(db.connection).updateOne(
    { _id: root },
    { $set: { status: 'active', parentId: child } },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data).toEqual([])
  expect((await request(app).get('/api/v1/categories').expect(200)).body.data).toEqual([])
  await categoryModel(db.connection).updateOne(
    { _id: child },
    { $set: { parentId: new Types.ObjectId() } },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data).toEqual([])
})
it('uses cheapest active SKU prices, distinct allocation counters, and product-level stock filters', async () => {
  const product = await make('bat', 0, {}, [
    { sku: 'BAT-S', attributes: { size: 's' }, regularPricePoisha: 500, salePricePoisha: 300 },
    { sku: 'BAT-L', attributes: { size: 'l' }, regularPricePoisha: 200 },
    { sku: 'BAT-X', attributes: { size: 'x' }, regularPricePoisha: 1, status: 'inactive' },
  ])
  await productModels(db.connection).variants.updateOne(
    { _id: product.variants[0]?._id },
    { $set: { stock: { physical: 10, reserved: 4, committed: 5 } } },
  )
  const result = await request(app)
    .get('/api/v1/products?inStock=true&minPricePoisha=200&maxPricePoisha=200')
    .expect(200)
  expect(result.body.data[0]).toMatchObject({
    regularPricePoisha: 200,
    effectivePricePoisha: 200,
    availability: 'available',
  })
  expect((await request(app).get('/api/v1/products?inStock=false').expect(200)).body.data).toEqual(
    [],
  )
  await productModels(db.connection).variants.updateOne(
    { _id: product.variants[0]?._id },
    { $set: { 'stock.committed': 6 } },
  )
  expect(
    (await request(app).get('/api/v1/products?inStock=false').expect(200)).body.data,
  ).toHaveLength(1)
})
it('searches name/keywords as literal words, including Bengali, with category and price filtering', async () => {
  await make('ball', 100, { name: 'Cricket Ball', keywords: ['লাল'] })
  await make('shoe', 300, { name: 'Running Shoe' })
  for (const query of [
    'q=Cricket',
    `q=${encodeURIComponent('লাল')}`,
    'q=ball&category=cricket&maxPricePoisha=100',
    'q=Cricket%20Ball',
  ]) {
    const result = await request(app).get(`/api/v1/products?${query}`).expect(200)
    expect(result.body.data.map((x: { slug: string }) => x.slug)).toEqual(['ball'])
  }
  expect(
    (await request(app).get('/api/v1/products?q=Cricket%20Shoe').expect(200)).body.data,
  ).toEqual([])
  expect(
    (await request(app).get('/api/v1/products?category=unknown').expect(200)).body.data,
  ).toEqual([])
  expect(
    (await request(app).get('/api/v1/products?q=missing').expect(200)).body.meta.totalItems,
  ).toBe(0)
})
it('sorts/paginates deterministically without duplicate pages and rejects unsafe queries', async () => {
  for (const slug of ['one', 'two', 'three']) await make(slug, 100)
  for (const sort of ['newest', 'price_asc', 'price_desc']) {
    const first = await request(app).get(`/api/v1/products?sort=${sort}&pageSize=2`).expect(200)
    const second = await request(app)
      .get(`/api/v1/products?sort=${sort}&pageSize=2&page=2`)
      .expect(200)
    expect(
      new Set([...first.body.data, ...second.body.data].map((x: { id: string }) => x.id)).size,
    ).toBe(3)
    expect(second.body.meta.totalItems).toBe(3)
  }
  for (const query of [
    'sort=secret',
    'pageSize=101',
    'page=0',
    'minPricePoisha=2&maxPricePoisha=1',
    'inStock=1',
    'q=a&q=b',
    'q=%24%28.%2A%29',
    'status=draft',
    'category[$ne]=x',
    'minPricePoisha=9007199254740992',
  ])
    await request(app).get(`/api/v1/products?${query}`).expect(400)
  await request(app).get('/api/v1/products').send({ $where: 'bad' }).expect(400)
  await request(app).post('/api/v1/products').send({}).expect(404)
})
it('omits unapproved media and publishes only clean public references through the media-owned reader', async () => {
  const publicId = `sportzone/${new Types.ObjectId().toHexString()}`
  const product = await make('ball', 100)
  // Privileged fixture simulates an inconsistent stored URL; aggregate HTTP inputs still reject images.
  await productModels(db.connection).products.updateOne(
    { _id: product.product._id },
    {
      $set: {
        images: [
          {
            publicId,
            url: 'https://untrusted.example.test/never-return',
            alt: 'Synthetic ball',
            position: 0,
          },
        ],
      },
    },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data[0]).not.toHaveProperty(
    'thumbnail',
  )
  await mediaModel(db.connection).create({
    publicId,
    assetKind: 'public_media',
    owner: { kind: 'admin', principalId: new Types.ObjectId() },
    mimeType: 'image/png',
    format: 'png',
    size: 1,
    digest: 'a'.repeat(64),
    scanStatus: 'clean',
    access: 'public',
    status: 'attached',
    references: [{ targetType: 'product', targetId: product.product._id, slot: 'image:0' }],
  })
  const approved = await request(app).get('/api/v1/products').expect(200)
  expect(approved.body.data[0].thumbnail).toEqual({
    url: `https://media.example.test/${publicId}.png`,
    alt: 'Synthetic ball',
  })
  expect(JSON.stringify(approved.body)).not.toContain('untrusted.example.test')
  await mediaModel(db.connection).updateOne(
    { publicId },
    { $set: { scanStatus: 'rejected', status: 'quarantined' } },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data[0]).not.toHaveProperty(
    'thumbnail',
  )
})
it('fails closed on missing search indexes and does not rebuild them from HTTP', async () => {
  await make('ball', 100)
  await productModels(db.connection).products.collection.dropIndex('product_public_search')
  try {
    await request(app).get('/api/v1/products?q=ball').expect(503)
    expect(
      (await productModels(db.connection).products.collection.indexes()).some(
        (x) => x.name === 'product_public_search',
      ),
    ).toBe(false)
  } finally {
    await initializeProductPersistence(db.connection)
  }
})
it('enforces origin/preflight and is wired in actual root composition without identity activation', async () => {
  await make('ball', 100)
  await request(app)
    .get('/api/v1/products')
    .set('Origin', 'https://foreign.example.test')
    .expect(403)
  await request(app)
    .options('/api/v1/products')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'GET')
    .expect(204)
  await request(app)
    .options('/api/v1/products')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .expect(403)
  const composed = await composeApplication(
    db.connection,
    loadEnvironment(testEnvironment()),
    { isReady: async () => true },
    { request: () => {}, lifecycle: () => {} },
  )
  expect((await request(composed).get('/api/v1/products').expect(200)).body.data).toHaveLength(1)
})
it('profiles a 1000-product mixed catalog using actual search/newest plans and bounded aggregation', async () => {
  const models = productModels(db.connection)
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    _id: new Types.ObjectId(),
    name: i % 100 === 0 ? 'Precision ক্রিকেট' : `Training item ${i}`,
    slug: `profile-${i}`,
    description: 'Synthetic profile',
    categoryIds: [child],
    keywords: [],
    images: [],
    status: i % 10 === 1 ? 'inactive' : 'active',
    featured: false,
  }))
  await models.products.insertMany(rows)
  await models.variants.insertMany(
    rows.map((row, i) => ({
      productId: row._id,
      skuNormalized: `PROFILE-${i}`,
      attributes: {},
      attributeSignature: 'default',
      regularPricePoisha: 100 + i,
      status: 'active',
    })),
  )
  const plan = z.object({
    queryPlanner: z.object({ winningPlan: z.unknown() }),
    executionStats: z.object({ totalDocsExamined: z.number(), totalKeysExamined: z.number() }),
  })
  const search = plan.parse(
    await models.products
      .find({ status: 'active', $text: { $search: '"Precision"', $language: 'none' } })
      .explain('executionStats'),
  )
  const newest = plan.parse(
    await models.products
      .find({ status: 'active' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats'),
  )
  expect(JSON.stringify(search.queryPlanner.winningPlan)).toContain('product_public_search')
  expect(search.executionStats.totalDocsExamined).toBeLessThan(50)
  expect(JSON.stringify(newest.queryPlanner.winningPlan)).toContain('product_public_newest')
  expect(newest.executionStats.totalDocsExamined).toBeLessThanOrEqual(20)
  const spy = vi.spyOn(models.products, 'aggregate')
  let pipeline: PipelineStage[] | undefined
  try {
    const found = await request(app)
      .get('/api/v1/products?q=Precision&pageSize=5&sort=price_asc')
      .expect(200)
    expect(found.body.meta.totalItems).toBe(10)
    expect(found.body.data).toHaveLength(5)
    pipeline = spy.mock.calls[0]?.[0]
  } finally {
    spy.mockRestore()
  }
  if (!pipeline) throw new Error('Missing actual catalog pipeline')
  const explained = await models.products
    .aggregate(pipeline)
    .option({ maxTimeMS: 3000, allowDiskUse: false })
    .explain('executionStats')
  expect(JSON.stringify(explained)).toContain('product_public_search')
  const categoryPlan = plan.parse(
    await categoryModel(db.connection)
      .find({ status: 'active' })
      .sort({ sortOrder: 1, _id: 1 })
      .limit(20)
      .explain('executionStats'),
  )
  expect(JSON.stringify(categoryPlan.queryPlanner.winningPlan)).toContain('category_public_sort')
  const categorySpy = vi.spyOn(categoryModel(db.connection), 'aggregate')
  let categoryPipeline: PipelineStage[] | undefined
  try {
    await request(app).get('/api/v1/categories').expect(200)
    categoryPipeline = categorySpy.mock.calls[0]?.[0]
  } finally {
    categorySpy.mockRestore()
  }
  if (!categoryPipeline) throw new Error('Missing actual category pipeline')
  const actualCategoryAggregation = await categoryModel(db.connection)
    .aggregate(categoryPipeline)
    .option({ maxTimeMS: 3000, allowDiskUse: false })
    .explain('executionStats')
  expect(JSON.stringify(actualCategoryAggregation)).toContain('category_public_sort')
  const artifactDirectory = new URL('../../../test-results/', import.meta.url)
  mkdirSync(artifactDirectory, { recursive: true })
  writeFileSync(
    new URL('catalog-query-profile.json', artifactDirectory),
    JSON.stringify(
      {
        fixture: {
          products: 1000,
          activeProducts: 900,
          matched: 10,
          pageSize: 5,
          mongoVersion: '8.0.16',
        },
        search: {
          docsExamined: search.executionStats.totalDocsExamined,
          keysExamined: search.executionStats.totalKeysExamined,
          winningPlan: search.queryPlanner.winningPlan,
        },
        category: {
          docsExamined: categoryPlan.executionStats.totalDocsExamined,
          winningPlan: categoryPlan.queryPlanner.winningPlan,
        },
        newest: {
          docsExamined: newest.executionStats.totalDocsExamined,
          winningPlan: newest.queryPlanner.winningPlan,
        },
        actualSearchAggregation: explained,
        actualCategoryAggregation,
      },
      null,
      2,
    ),
  )
}, 20000)

it('filters descendants through a visible ancestor category and never leaks a second hidden classification', async () => {
  const product = await make('ball', 100)
  expect(
    (await request(app).get('/api/v1/products?category=sports').expect(200)).body.data,
  ).toHaveLength(1)
  const hidden = await categoryService(db.connection).create({
    name: 'Hidden',
    slug: 'hidden',
    status: 'inactive',
  })
  await productModels(db.connection).products.updateOne(
    { _id: product.product._id },
    { $push: { categoryIds: hidden._id } },
  )
  expect(
    (await request(app).get('/api/v1/products?category=sports').expect(200)).body.data,
  ).toEqual([])
})
it('excludes inactive-only or invalid variant offers and projects only approved rating summaries', async () => {
  const product = await make('ball', 100)
  await productModels(db.connection).products.updateOne(
    { _id: product.product._id },
    { $set: { ratingSummary: { approvedCount: 2, average: 4.5 } } },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data[0].rating).toEqual({
    average: 4.5,
    count: 2,
  })
  await productModels(db.connection).variants.updateOne(
    { productId: product.product._id },
    { $set: { status: 'inactive' } },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data).toEqual([])
  await productModels(db.connection).variants.collection.updateOne(
    { productId: product.product._id },
    { $set: { status: 'active', 'stock.physical': 1.5 } },
    { bypassDocumentValidation: true },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data).toEqual([])
})
it('omits public media when target ownership, private access or provider eligibility is absent', async () => {
  const publicId = `sportzone/${new Types.ObjectId().toHexString()}`
  const product = await make('ball', 100)
  await productModels(db.connection).products.updateOne(
    { _id: product.product._id },
    {
      $set: {
        images: [{ publicId, url: 'https://ignored.example.test/image', alt: 'Ball', position: 0 }],
      },
    },
  )
  await mediaModel(db.connection).create({
    publicId,
    assetKind: 'public_media',
    owner: { kind: 'admin', principalId: new Types.ObjectId() },
    mimeType: 'image/png',
    format: 'png',
    size: 1,
    digest: 'a'.repeat(64),
    scanStatus: 'clean',
    access: 'public',
    status: 'attached',
    references: [{ targetType: 'product', targetId: new Types.ObjectId(), slot: 'image:0' }],
  })
  expect((await request(app).get('/api/v1/products').expect(200)).body.data[0]).not.toHaveProperty(
    'thumbnail',
  )
  const images = publicMediaService(db.connection)
  expect(
    (
      await images([
        { publicId, targetId: product.product._id, targetType: 'product', alt: 'Ball' },
      ])
    ).size,
  ).toBe(0)
  await mediaModel(db.connection).collection.updateOne(
    { publicId },
    {
      $set: {
        access: 'private',
        references: [{ targetType: 'product', targetId: product.product._id, slot: 'image:0' }],
      },
    },
  )
  expect((await request(app).get('/api/v1/products').expect(200)).body.data[0]).not.toHaveProperty(
    'thumbnail',
  )
})
it('bounds category traversal and page sizes without exposing a truncated ancestry as public', async () => {
  const ids = Array.from({ length: 66 }, () => new Types.ObjectId())
  await categoryModel(db.connection).insertMany(
    ids.map((id, i) => ({
      _id: id,
      name: `Depth ${i}`,
      slug: `depth-${i}`,
      status: 'active',
      ...(i ? { parentId: ids[i - 1] } : {}),
    })),
  )
  await request(app).get('/api/v1/categories/depth-65').expect(404)
  await request(app).get('/api/v1/categories?limit=1000').expect(400)
  const empty = await request(app).get('/api/v1/categories?page=100&pageSize=1').expect(200)
  expect(empty.body.data).toEqual([])
  expect(empty.body.meta.totalItems).toBe(67)
})
it('rejects unauthorized preflight headers and missing Origin while supporting safe HEAD reads', async () => {
  await request(app)
    .options('/api/v1/products')
    .set('Access-Control-Request-Method', 'GET')
    .expect(403)
  await request(app)
    .options('/api/v1/products')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'Authorization')
    .expect(403)
  const response = await request(app).head('/api/v1/products').set('Origin', origin).expect(200)
  expect(response.headers['access-control-allow-credentials']).toBe('true')
  expect(response.text).toBeUndefined()
})

it('denies unpublished or unsafe generated media URLs and keeps category access indexed', async () => {
  const publicId = `sportzone/${new Types.ObjectId().toHexString()}`
  await mediaModel(db.connection).create({
    publicId,
    assetKind: 'public_media',
    owner: { kind: 'admin', principalId: new Types.ObjectId() },
    mimeType: 'image/png',
    format: 'png',
    size: 1,
    digest: 'a'.repeat(64),
    scanStatus: 'clean',
    access: 'public',
    status: 'attached',
    references: [{ targetType: 'category', targetId: child, slot: 'image' }],
  })
  const candidates = [
    { publicId, targetType: 'category' as const, targetId: child, alt: 'Cricket' },
  ]
  for (const url of [
    'invalid',
    'http://media.example.test/image',
    'https://user:secret@media.example.test/image',
    'https://media.example.test/image?token=secret',
  ])
    expect(
      (await publicMediaService(db.connection, { publicUrl: () => url })(candidates)).size,
    ).toBe(0)
  await categoryModel(db.connection).collection.dropIndex('category_parent_status_sort')
  try {
    await request(app).get('/api/v1/categories').expect(503)
  } finally {
    await createDeclaredIndexes(categoryModel(db.connection))
  }
})

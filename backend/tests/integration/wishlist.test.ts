import { randomBytes, randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { wishlistModel } from '../../src/modules/cart/wishlist.model.js'
import { initializeWishlistPersistence } from '../../src/modules/cart/wishlist.persistence.js'
import { wishlistService } from '../../src/modules/cart/wishlist.service.js'
import { wishlistRoutes } from '../../src/modules/cart/wishlist.routes.js'
import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { attributeSignature } from '../../src/modules/catalog/variants/variant.schema.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { isolatedDatabase } from '../helpers/database.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let catalog: ReturnType<typeof catalogService>
let service: ReturnType<typeof wishlistService>
let app: ReturnType<typeof createApp>
let categoryId: Types.ObjectId
const origin = 'http://localhost:3000'
async function account(role: 'customer' | 'admin' = 'customer') {
  const user = await models.users.create({
    name: 'Synthetic',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
  })
  const issued = await sessions.issue(role, user._id)
  return { user, issued, token: issued.token, cookie: `sz_${role}_sid=${issued.token}` }
}
type Principal = Awaited<ReturnType<typeof account>>
async function product(price = 101, stock = 10) {
  const m = productModels(db.connection),
    slug = `product-${randomUUID()}`
  const product = await m.products.create({
    name: 'Synthetic product',
    slug,
    description: 'Synthetic description',
    categoryIds: [categoryId],
    status: 'active',
  })
  const value = await m.variants.create({
    productId: product._id,
    skuNormalized: slug.toUpperCase(),
    attributes: {},
    attributeSignature: attributeSignature({}),
    regularPricePoisha: price,
    status: 'active',
    stock: { physical: stock, reserved: 0, committed: 0 },
  })
  return { product, value, id: product._id.toHexString() }
}
const path = (id: string) => `/api/v1/wishlist/products/${id}`
function put(who: Principal, id: string) {
  return request(app)
    .put(path(id))
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
}
function get(who: Principal) {
  return request(app).get('/api/v1/wishlist').set('Cookie', who.cookie)
}
function remove(who: Principal, id: string) {
  return request(app)
    .delete(path(id))
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
}
beforeAll(async () => {
  db = await isolatedDatabase()
  models = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, models)
  await initializeProductPersistence(db.connection)
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeWishlistPersistence(db.connection)
  sessions = createSessionService(db.connection, models, {
    secret: randomBytes(32).toString('hex'),
    customerTtlSeconds: 600,
    adminTtlSeconds: 300,
    sameSite: 'lax',
    appEnvironment: 'test',
    apiOrigin: 'http://localhost:4000',
  })
  const security = createBrowserSecurity(db.connection, models, sessions, {
    secret: randomBytes(32).toString('hex'),
    contextTtlSeconds: 120,
    storefrontOrigin: origin,
    adminOrigin: 'http://localhost:5173',
  })
  catalog = catalogService(db.connection, async () => new Map())
  service = wishlistService(
    db.connection,
    createCustomerAccountAccess(db.connection, models, sessions),
    catalog,
  )
  app = createApp({ apiRouter: wishlistRoutes(service, security, sessions) })
})
beforeEach(async () => {
  vi.restoreAllMocks()
  const category = await categoryModel(db.connection).create({
    name: 'Synthetic',
    slug: `category-${randomUUID()}`,
    status: 'active',
  })
  categoryId = category._id
})
afterAll(async () => {
  await db?.close()
})
it('returns private empty state without creating a list', async () => {
  const own = await account(),
    count = await wishlistModel(db.connection).countDocuments()
  const response = await get(own).expect(200)
  expect(response.body.data).toEqual({ products: [] })
  expect(response.headers['cache-control']).toBe('no-store')
  expect(await wishlistModel(db.connection).countDocuments()).toBe(count)
})
it('saves idempotently across sessions and never shares another customer list', async () => {
  const own = await account(),
    other = await account(),
    item = await product()
  expect((await put(own, item.id).expect(200)).body.data).toEqual({ saved: true })
  await put(own, item.id).expect(200)
  const fresh = await sessions.issue('customer', own.user._id)
  const res = await request(app)
    .get('/api/v1/wishlist')
    .set('Cookie', `sz_customer_sid=${fresh.token}`)
    .expect(200)
  expect(res.body.data.products).toHaveLength(1)
  expect(res.body.data.products[0]).toMatchObject({
    id: item.id,
    name: 'Synthetic product',
    effectivePricePoisha: 101,
  })
  expect((await get(other)).body.data).toEqual({ products: [] })
  expect(JSON.stringify(res.body)).not.toMatch(/userId|password|reserved|committed|publicId/)
})
it('retains saved order and refreshes public sale prices', async () => {
  const own = await account(),
    a = await product(),
    b = await product()
  await put(own, a.id).expect(200)
  await put(own, b.id).expect(200)
  await productModels(db.connection).variants.updateOne(
    { _id: a.value._id },
    { $set: { salePricePoisha: 99 } },
  )
  const res = await get(own).expect(200)
  expect(res.body.data.products.map((p: { id: string }) => p.id)).toEqual([a.id, b.id])
  expect(res.body.data.products[0].effectivePricePoisha).toBe(99)
})
it('removes repeatedly including absent list/unknown product without creating a record', async () => {
  const own = await account(),
    id = new Types.ObjectId().toHexString()
  expect((await remove(own, id).expect(200)).body.data).toEqual({ saved: false })
  expect(await wishlistModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
  const item = await product()
  await put(own, item.id).expect(200)
  await remove(own, item.id).expect(200)
  await remove(own, item.id).expect(200)
  expect((await get(own)).body.data.products).toEqual([])
})
it.each([
  'inactive-product',
  'draft-product',
  'inactive-variant',
  'inactive-category',
  'deleted-product',
  'deleted-variant',
])('retains only safe identity for saved %s', async (kind) => {
  const own = await account(),
    item = await product()
  await put(own, item.id).expect(200)
  const m = productModels(db.connection)
  if (kind === 'inactive-product' || kind === 'draft-product')
    await m.products.updateOne(
      { _id: item.product._id },
      {
        $set: {
          status: kind === 'draft-product' ? 'draft' : 'inactive',
          name: 'Hidden secret draft title',
        },
      },
    )
  if (kind === 'inactive-variant')
    await m.variants.updateOne({ _id: item.value._id }, { $set: { status: 'inactive' } })
  if (kind === 'inactive-category')
    await categoryModel(db.connection).updateOne(
      { _id: categoryId },
      { $set: { status: 'inactive' } },
    )
  if (kind === 'deleted-product') await m.products.deleteOne({ _id: item.product._id })
  if (kind === 'deleted-variant') await m.variants.deleteOne({ _id: item.value._id })
  const response = await get(own).expect(200)
  expect(response.body.data.products).toEqual([{ id: item.id, availability: 'unavailable' }])
  expect(JSON.stringify(response.body)).not.toContain('Hidden secret')
  await put(own, item.id).expect(200)
  await remove(own, item.id).expect(200)
})
it.each(['unknown', 'inactive', 'hidden-category'])(
  'rejects newly saved %s products',
  async (kind) => {
    const own = await account(),
      item = await product()
    if (kind === 'inactive')
      await productModels(db.connection).products.updateOne(
        { _id: item.product._id },
        { $set: { status: 'inactive' } },
      )
    if (kind === 'hidden-category')
      await categoryModel(db.connection).updateOne(
        { _id: categoryId },
        { $set: { status: 'inactive' } },
      )
    await put(own, kind === 'unknown' ? new Types.ObjectId().toHexString() : item.id).expect(422)
    expect(await wishlistModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
  },
)
it('allows out-of-stock saves without touching stock, movements or carts', async () => {
  const own = await account(),
    item = await product(101, 0)
  await put(own, item.id).expect(200)
  expect((await get(own)).body.data.products[0].availability).toBe('unavailable')
  await remove(own, item.id).expect(200)
  expect(
    (await productModels(db.connection).variants.findById(item.value._id))?.stock,
  ).toMatchObject({ physical: 0, reserved: 0, committed: 0 })
  expect(await db.connection.db?.collection('inventoryMovements').countDocuments()).toBe(0)
  expect(await db.connection.db?.collection('carts').countDocuments()).toBe(0)
})
it('denies guests, admins and invalid browser proof', async () => {
  const own = await account(),
    admin = await account('admin'),
    item = await product()
  await request(app).get('/api/v1/wishlist').expect(401)
  await get(admin).expect(401)
  await request(app).put(path(item.id)).set('Origin', origin).expect(403)
  await request(app).put(path(item.id)).set('Cookie', own.cookie).expect(403)
  await request(app)
    .put(path(item.id))
    .set('Cookie', own.cookie)
    .set('Origin', 'https://foreign.example.test')
    .set('X-CSRF-Token', own.issued.csrfToken)
    .expect(403)
  await request(app)
    .put(path(item.id))
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', 'invalid')
    .expect(403)
})
it('rejects suspended/revoked identities and rechecks service authorization', async () => {
  const own = await account(),
    item = await product()
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await put(own, item.id).expect(403)
  await expect(service.set(own.token, item.id, true)).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'active' } })
  await sessions.logout('customer', own.token)
  await get(own).expect(401)
})
it.each([{ userId: 'foreign' }, { productId: 'foreign' }, { saved: true }, { quantity: 1 }])(
  'rejects unexpected mutation fields %s',
  async (body) => {
    const own = await account(),
      item = await product()
    await request(app)
      .put(path(item.id))
      .set('Cookie', own.cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', own.issued.csrfToken)
      .send(body)
      .expect(400)
  },
)
it('rejects invalid IDs, extra queries and read bodies', async () => {
  const own = await account()
  await put(own, 'invalid').expect(400)
  await request(app).get('/api/v1/wishlist?userId=foreign').set('Cookie', own.cookie).expect(400)
  await request(app).get('/api/v1/wishlist').set('Cookie', own.cookie).send({}).expect(400)
})
it('serializes concurrent first-list creation for distinct products', async () => {
  const own = await account(),
    a = await product(),
    b = await product()
  const results = await Promise.all([put(own, a.id), put(own, b.id)])
  expect(results.map((r) => r.status)).toEqual([200, 200])
  expect(await wishlistModel(db.connection).countDocuments({ userId: own.user._id })).toBe(1)
  expect((await get(own)).body.data.products).toHaveLength(2)
})
it('deduplicates concurrent repeated saves and serializes save/remove', async () => {
  const own = await account(),
    item = await product()
  expect((await Promise.all([put(own, item.id), put(own, item.id)])).map((r) => r.status)).toEqual([
    200, 200,
  ])
  expect((await get(own)).body.data.products).toHaveLength(1)
  expect(
    (await Promise.all([put(own, item.id), remove(own, item.id)])).map((r) => r.status),
  ).toEqual([200, 200])
  expect((await get(own)).body.data.products.length).toBeLessThanOrEqual(1)
})
it('enforces 200 entries, preserves retries at capacity and permits removal', async () => {
  const own = await account(),
    item = await product(),
    extra = await product()
  await wishlistModel(db.connection).create({
    userId: own.user._id,
    productIds: [item.product._id, ...Array.from({ length: 199 }, () => new Types.ObjectId())],
  })
  await put(own, item.id).expect(200)
  await put(own, extra.id).expect(422)
  expect((await get(own)).body.data.products).toHaveLength(200)
  await remove(own, item.id).expect(200)
  await put(own, extra.id).expect(200)
})
it('enforces unique user/index and raw collection bounds/duplicate checks', async () => {
  const own = await account(),
    item = await product()
  await put(own, item.id).expect(200)
  await expect(wishlistModel(db.connection).create({ userId: own.user._id })).rejects.toMatchObject(
    { code: 11000 },
  )
  const collection = db.connection.db?.collection('wishlists')
  if (!collection) throw new Error('Missing fixture DB')
  const row = { userId: new Types.ObjectId(), createdAt: new Date(), updatedAt: new Date() }
  await expect(
    collection.insertOne({ ...row, productIds: [item.product._id, item.product._id] }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.insertOne({
      ...row,
      productIds: Array.from({ length: 201 }, () => new Types.ObjectId()),
    }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(collection.insertOne({ ...row, productIds: ['invalid'] })).rejects.toMatchObject({
    code: 121,
  })
})
it('fails closed if index or validator is missing and refuses destructive bootstrap', async () => {
  const own = await account()
  await wishlistModel(db.connection).collection.dropIndex('wishlist_user_unique')
  try {
    await get(own).expect(503)
  } finally {
    await wishlistModel(db.connection).createIndexes()
  }
  await db.connection.db?.command({ collMod: 'wishlists', validator: {} })
  try {
    await get(own).expect(503)
    await expect(initializeWishlistPersistence(db.connection)).rejects.toThrow(/reviewed/)
  } finally {
    const { wishlistValidator } = await import('../../src/modules/cart/wishlist.persistence.js')
    await db.connection.db?.command({
      collMod: 'wishlists',
      validator: wishlistValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
})
it('leaves no list when catalog eligibility lookup fails', async () => {
  const own = await account(),
    item = await product()
  vi.spyOn(catalog, 'wishlistProducts').mockRejectedValueOnce(
    new Error('Synthetic unavailable catalog'),
  )
  await put(own, item.id).expect(500)
  expect(await wishlistModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
})

it('serializes competing additions for the final available slot', async () => {
  const own = await account(),
    a = await product(),
    b = await product()
  await wishlistModel(db.connection).create({
    userId: own.user._id,
    productIds: Array.from({ length: 199 }, () => new Types.ObjectId()),
  })
  const results = await Promise.all([put(own, a.id), put(own, b.id)])
  expect(results.map((result) => result.status).sort()).toEqual([200, 422])
  expect(
    (await wishlistModel(db.connection).findOne({ userId: own.user._id }))?.productIds,
  ).toHaveLength(200)
})
it('rolls back the inserted list if a persistence operation fails after writing', async () => {
  const own = await account(),
    item = await product()
  const collection = wishlistModel(db.connection).collection
  const insert = collection.insertOne.bind(collection)
  vi.spyOn(collection, 'insertOne').mockImplementationOnce(async (...args) => {
    await insert(...args)
    throw new Error('Synthetic post-write failure')
  })
  await put(own, item.id).expect(500)
  expect(await wishlistModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
})

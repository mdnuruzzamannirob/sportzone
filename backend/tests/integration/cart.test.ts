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
import { cartModel } from '../../src/modules/cart/cart.model.js'
import { initializeCartPersistence } from '../../src/modules/cart/cart.persistence.js'
import { cartService } from '../../src/modules/cart/cart.service.js'
import { cartRoutes } from '../../src/modules/cart/cart.routes.js'
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
let service: ReturnType<typeof cartService>
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
async function variant(price = 101, stock = 10) {
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
  return { product, value, id: value._id.toHexString() }
}
const path = (id: string) => `/api/v1/cart/items/${id}`
function put(who: Principal, id: string, quantity: unknown = 1) {
  return request(app)
    .put(path(id))
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
    .send({ quantity })
}
function get(who: Principal) {
  return request(app).get('/api/v1/cart').set('Cookie', who.cookie)
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
  await initializeCartPersistence(db.connection)
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
  service = cartService(
    db.connection,
    createCustomerAccountAccess(db.connection, models, sessions),
    catalog,
  )
  app = createApp({ apiRouter: cartRoutes(service, security, sessions) })
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
it('returns a private empty cart without writing a cart record', async () => {
  const own = await account(),
    count = await cartModel(db.connection).countDocuments()
  const res = await get(own).expect(200)
  expect(res.body.data).toEqual({ items: [], estimatedSubtotalPoisha: 0, revision: 0 })
  expect(res.headers['cache-control']).toBe('no-store')
  expect(await cartModel(db.connection).countDocuments()).toBe(count)
})
it('persists absolute quantities across sessions and isolates other customers', async () => {
  const own = await account(),
    other = await account(),
    item = await variant()
  await put(own, item.id, 3).expect(200)
  await put(own, item.id, 3).expect(200)
  const fresh = await sessions.issue('customer', own.user._id)
  const res = await request(app)
    .get('/api/v1/cart')
    .set('Cookie', `sz_customer_sid=${fresh.token}`)
    .expect(200)
  expect(res.body.data.items).toHaveLength(1)
  expect(res.body.data.items[0]).toMatchObject({
    variantId: item.id,
    quantity: 3,
    estimatedUnitPoisha: 101,
    availability: 'available',
    product: { id: item.product._id.toHexString() },
  })
  expect(res.body.data.estimatedSubtotalPoisha).toBe(303)
  expect((await get(other)).body.data.items).toEqual([])
  expect(JSON.stringify(res.body)).not.toMatch(/password|operationKey|userId|reserved|committed/)
})
it('deletes repeatedly and removes now-hidden selections', async () => {
  const own = await account(),
    item = await variant()
  await put(own, item.id).expect(200)
  await productModels(db.connection).products.updateOne(
    { _id: item.product._id },
    { $set: { status: 'inactive' } },
  )
  expect((await get(own)).body.data.items[0]).toMatchObject({
    product: null,
    estimatedUnitPoisha: null,
    availability: 'unavailable',
  })
  expect((await remove(own, item.id).expect(200)).body.data.items).toEqual([])
  expect((await remove(own, item.id).expect(200)).body.data.items).toEqual([])
})
it('refreshes exact integer variant prices and stock without reserving or writing inventory', async () => {
  const own = await account(),
    item = await variant()
  await put(own, item.id, 4).expect(200)
  await productModels(db.connection).variants.updateOne(
    { _id: item.value._id },
    { $set: { salePricePoisha: 99, 'stock.reserved': 8 } },
  )
  const res = await get(own).expect(200)
  expect(res.body.data).toMatchObject({
    estimatedSubtotalPoisha: 396,
    items: [{ estimatedUnitPoisha: 99, availability: 'unavailable' }],
  })
  expect(
    (await productModels(db.connection).variants.findById(item.value._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 8, committed: 0 })
  expect(await db.connection.db?.collection('inventoryMovements').countDocuments()).toBe(0)
})
it('retains eligible out-of-stock lines honestly', async () => {
  const own = await account(),
    item = await variant(101, 0)
  expect((await put(own, item.id, 2).expect(200)).body.data).toMatchObject({
    items: [{ availability: 'unavailable' }],
    estimatedSubtotalPoisha: 202,
  })
})
it.each([0, -1, 51, 1.5, '2', null])(
  'rejects invalid quantity %s without persistence',
  async (quantity) => {
    const own = await account(),
      item = await variant()
    await put(own, item.id, quantity).expect(400)
    expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
  },
)
it('rejects unknown fields, queries and invalid variant IDs', async () => {
  const own = await account(),
    item = await variant()
  await request(app)
    .put(path(item.id))
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', own.issued.csrfToken)
    .send({ quantity: 1, userId: new Types.ObjectId().toHexString() })
    .expect(400)
  await put(own, 'invalid').expect(400)
  await request(app).get('/api/v1/cart?userId=foreign').set('Cookie', own.cookie).expect(400)
})
it('denies anonymous/admin/suspended/revoked identities and invalid browser proof', async () => {
  const own = await account(),
    admin = await account('admin'),
    item = await variant()
  await request(app).get('/api/v1/cart').expect(401)
  await get(admin).expect(401)
  await request(app).put(path(item.id)).set('Cookie', own.cookie).send({ quantity: 1 }).expect(403)
  await request(app)
    .put(path(item.id))
    .set('Cookie', own.cookie)
    .set('Origin', 'https://foreign.example.test')
    .set('X-CSRF-Token', own.issued.csrfToken)
    .send({ quantity: 1 })
    .expect(403)
  await request(app)
    .put(path(item.id))
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', 'invalid')
    .send({ quantity: 1 })
    .expect(403)
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await put(own, item.id).expect(403)
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'active' } })
  await sessions.logout('customer', own.token)
  await get(own).expect(401)
})
it.each(['product', 'variant', 'category', 'missing'])(
  'rejects %s unavailable additions',
  async (kind) => {
    const own = await account(),
      item = await variant()
    if (kind === 'product')
      await productModels(db.connection).products.updateOne(
        { _id: item.product._id },
        { $set: { status: 'inactive' } },
      )
    if (kind === 'variant')
      await productModels(db.connection).variants.updateOne(
        { _id: item.value._id },
        { $set: { status: 'inactive' } },
      )
    if (kind === 'category')
      await categoryModel(db.connection).updateOne(
        { _id: categoryId },
        { $set: { status: 'inactive' } },
      )
    await put(own, kind === 'missing' ? new Types.ObjectId().toHexString() : item.id).expect(422)
  },
)
it('serializes concurrent first-cart creation and preserves distinct writes', async () => {
  const own = await account(),
    a = await variant(),
    b = await variant()
  const results = await Promise.all([put(own, a.id, 2), put(own, b.id, 3)])
  expect(results.map((r) => r.status)).toEqual([200, 200])
  expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(1)
  expect((await get(own)).body.data.items).toHaveLength(2)
})
it('deduplicates concurrent same-variant writes and serializes put/delete', async () => {
  const own = await account(),
    item = await variant()
  const result = await Promise.all([put(own, item.id, 2), put(own, item.id, 3)])
  expect(result.map((r) => r.status)).toEqual([200, 200])
  expect((await get(own)).body.data.items).toHaveLength(1)
  const changed = await Promise.all([put(own, item.id, 4), remove(own, item.id)])
  expect(changed.map((r) => r.status)).toEqual([200, 200])
  const final = (await get(own)).body.data.items
  expect(final.length).toBeLessThanOrEqual(1)
  if (final.length) expect(final[0].quantity).toBe(4)
})
it('rolls back a write and revision when projection fails', async () => {
  const own = await account(),
    item = await variant()
  await put(own, item.id).expect(200)
  const before = await cartModel(db.connection).findOne({ userId: own.user._id }).lean()
  const original = catalog.cartSelections.bind(catalog)
  let calls = 0
  vi.spyOn(catalog, 'cartSelections').mockImplementation(async (...args) => {
    if (++calls === 2) throw new Error('Synthetic failure')
    return original(...args)
  })
  await put(own, item.id, 2).expect(500)
  const after = await cartModel(db.connection).findOne({ userId: own.user._id }).lean()
  expect(after?.revision).toBe(before?.revision)
  expect(after?.items[0]?.quantity).toBe(1)
})
it('rejects subtotal overflow without saving the attempted line', async () => {
  const own = await account(),
    item = await variant(Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1)
  await put(own, item.id, 2).expect(422)
  expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
})
it('enforces database uniqueness, quantity and duplicate-variant validation', async () => {
  const own = await account(),
    item = await variant()
  await put(own, item.id).expect(200)
  await expect(cartModel(db.connection).create({ userId: own.user._id })).rejects.toMatchObject({
    code: 11000,
  })
  const row = {
    userId: new Types.ObjectId(),
    items: [{ variantId: item.value._id, quantity: 1, addedAt: new Date() }],
    revision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await expect(
    db.connection.db
      ?.collection('carts')
      .insertOne({ ...row, items: [row.items[0], row.items[0]] }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    db.connection.db
      ?.collection('carts')
      .insertOne({ ...row, items: [{ ...row.items[0], quantity: 0 }] }),
  ).rejects.toMatchObject({ code: 121 })
})
it('enforces 100 distinct lines while allowing edits/removal at capacity', async () => {
  const own = await account(),
    item = await variant(),
    extra = await variant()
  await cartModel(db.connection).create({
    userId: own.user._id,
    items: [
      { variantId: item.value._id, quantity: 1, addedAt: new Date() },
      ...Array.from({ length: 99 }, () => ({
        variantId: new Types.ObjectId(),
        quantity: 1,
        addedAt: new Date(),
      })),
    ],
  })
  await put(own, extra.id).expect(422)
  await put(own, item.id, 2).expect(200)
  await remove(own, item.id).expect(200)
  await put(own, extra.id).expect(200)
})
it('fails closed when required cart index is missing', async () => {
  const own = await account()
  await cartModel(db.connection).collection.dropIndex('cart_user_unique')
  try {
    await get(own).expect(503)
  } finally {
    await cartModel(db.connection).createIndexes()
  }
})

it('rechecks authorization inside the service even without HTTP guards', async () => {
  const own = await account(),
    item = await variant()
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(service.put(own.token, item.id, { quantity: 1 })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
  expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
})
it('supports quantity boundaries and excludes deleted variants on subsequent reads', async () => {
  const own = await account(),
    item = await variant(101, 50)
  await put(own, item.id, 50).expect(200)
  await productModels(db.connection).variants.deleteOne({ _id: item.value._id })
  const response = await get(own).expect(200)
  expect(response.body.data).toMatchObject({
    items: [
      {
        variantId: item.id,
        quantity: 50,
        product: null,
        estimatedUnitPoisha: null,
        availability: 'unavailable',
      },
    ],
    estimatedSubtotalPoisha: 0,
  })
  await remove(own, item.id).expect(200)
})
it('refuses bootstrap over incompatible validators and keeps the existing data', async () => {
  const own = await account(),
    item = await variant()
  await put(own, item.id).expect(200)
  await db.connection.db?.command({ collMod: 'carts', validator: {} })
  try {
    await expect(initializeCartPersistence(db.connection)).rejects.toThrow(/reviewed/)
    await get(own).expect(503)
    expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(1)
  } finally {
    const { cartValidator } = await import('../../src/modules/cart/cart.persistence.js')
    await db.connection.db?.command({
      collMod: 'carts',
      validator: cartValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
})
it('handles allowed preflight without granting anonymous access or state changes', async () => {
  const item = await variant(),
    count = await cartModel(db.connection).countDocuments()
  await request(app)
    .options(path(item.id))
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'PUT')
    .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
    .expect(204)
  await request(app).put(path(item.id)).set('Origin', origin).send({ quantity: 1 }).expect(403)
  expect(await cartModel(db.connection).countDocuments()).toBe(count)
})

function merge(who: Principal, items: unknown) {
  return request(app)
    .post('/api/v1/cart/merge')
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
    .send({ items })
}
it('merges by maximum quantity, deduplicates and replays without addition', async () => {
  const own = await account(),
    item = await variant(),
    other = await account()
  await put(own, item.id, 3).expect(200)
  const lines = [
    { variantId: item.id, quantity: 2 },
    { variantId: item.id, quantity: 5 },
  ]
  for (let i = 0; i < 2; i++) {
    const res = await merge(own, lines).expect(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].quantity).toBe(5)
    expect(res.body.data.estimatedSubtotalPoisha).toBe(505)
    expect(res.body.data.errors).toEqual([])
  }
  expect((await get(other)).body.data.items).toEqual([])
})
it('excludes ineligible selections with bounded safe per-item errors and keeps stock unchanged', async () => {
  const own = await account(),
    live = await variant(111, 0),
    hidden = await variant()
  await productModels(db.connection).products.updateOne(
    { _id: hidden.product._id },
    { $set: { status: 'inactive' } },
  )
  const missing = new Types.ObjectId().toHexString()
  const res = await merge(
    own,
    [live.id, hidden.id, missing].map((variantId) => ({ variantId, quantity: 2 })),
  ).expect(200)
  expect(res.body.data.errors).toEqual(
    [hidden.id, missing].map((variantId) => ({ variantId, code: 'BUSINESS_RULE_VIOLATION' })),
  )
  expect(res.body.data.items).toHaveLength(1)
  expect(res.body.data.items[0]).toMatchObject({ variantId: live.id, availability: 'unavailable' })
  expect(
    (await productModels(db.connection).variants.findById(live.value._id))?.stock,
  ).toMatchObject({ physical: 0, reserved: 0, committed: 0 })
})
it.each([
  null,
  [{ variantId: 'invalid', quantity: 1 }],
  [{ variantId: 'a'.repeat(24), quantity: 51 }],
  Array.from({ length: 101 }, () => ({ variantId: 'a'.repeat(24), quantity: 1 })),
])('rejects malformed or oversized merge inputs', async (items) => {
  const own = await account()
  await merge(own, items).expect(400)
  expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
})
it('serializes concurrent merges and explicit quantity writes', async () => {
  const own = await account(),
    a = await variant(),
    b = await variant()
  const results = await Promise.all([
    merge(own, [{ variantId: a.id, quantity: 3 }]),
    merge(own, [
      { variantId: a.id, quantity: 5 },
      { variantId: b.id, quantity: 2 },
    ]),
    put(own, b.id, 4),
  ])
  expect(results.map((r) => r.status)).toEqual([200, 200, 200])
  const lines = (await get(own)).body.data.items
  expect(lines).toHaveLength(2)
  expect(lines.find((line: { variantId: string }) => line.variantId === a.id).quantity).toBe(5)
  expect(lines.find((line: { variantId: string }) => line.variantId === b.id).quantity).toBe(4)
})
it('rolls back every merged item when cart capacity or subtotal fails', async () => {
  const own = await account(),
    item = await variant(),
    extra = await variant()
  await cartModel(db.connection).create({
    userId: own.user._id,
    items: Array.from({ length: 99 }, () => ({
      variantId: new Types.ObjectId(),
      quantity: 1,
      addedAt: new Date(),
    })),
  })
  await merge(
    own,
    [item.id, extra.id].map((variantId) => ({ variantId, quantity: 1 })),
  ).expect(422)
  expect((await get(own)).body.data.items).toHaveLength(99)
  const other = await account(),
    huge = await variant(Number.MAX_SAFE_INTEGER)
  await merge(other, [
    { variantId: item.id, quantity: 1 },
    { variantId: huge.id, quantity: 2 },
  ]).expect(422)
  expect(await cartModel(db.connection).countDocuments({ userId: other.user._id })).toBe(0)
})
it('requires customer identity, origin and CSRF for merge including empty input', async () => {
  const own = await account(),
    admin = await account('admin')
  await request(app).post('/api/v1/cart/merge').send({ items: [] }).expect(403)
  await request(app)
    .post('/api/v1/cart/merge')
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .send({ items: [] })
    .expect(403)
  await merge(admin, []).expect(403)
  await merge(own, []).expect(200)
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(service.merge(own.token, { items: [] })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
})
it('refreshes saved prices and hidden projections during empty revalidation', async () => {
  const own = await account(),
    live = await variant(),
    hidden = await variant()
  await put(own, live.id, 2).expect(200)
  await put(own, hidden.id, 3).expect(200)
  await productModels(db.connection).variants.updateOne(
    { _id: live.value._id },
    { $set: { salePricePoisha: 90 } },
  )
  await productModels(db.connection).products.updateOne(
    { _id: hidden.product._id },
    { $set: { status: 'inactive' } },
  )
  const res = await merge(own, []).expect(200)
  expect(res.body.data.estimatedSubtotalPoisha).toBe(180)
  expect(res.body.data.items[1]).toMatchObject({
    variantId: hidden.id,
    quantity: 3,
    product: null,
    estimatedUnitPoisha: null,
    availability: 'unavailable',
  })
})
it('rolls back merge and account fence when projection fails after saving', async () => {
  const own = await account(),
    item = await variant()
  const before = await models.users.findById(own.user._id).lean()
  const original = catalog.cartSelections.bind(catalog)
  let calls = 0
  vi.spyOn(catalog, 'cartSelections').mockImplementation(async (...args) => {
    if (++calls === 2) throw new Error('Synthetic projection failure')
    return original(...args)
  })
  await merge(own, [{ variantId: item.id, quantity: 2 }]).expect(500)
  expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
})
it('rejects protected merge fields and unknown query without writing', async () => {
  const own = await account(),
    item = await variant()
  await merge(own, [{ variantId: item.id, quantity: 1, pricePoisha: 1 }]).expect(400)
  await request(app)
    .post('/api/v1/cart/merge?userId=foreign')
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', own.issued.csrfToken)
    .send({ items: [] })
    .expect(400)
  await request(app)
    .options('/api/v1/cart/merge')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
    .expect(204)
  expect(await cartModel(db.connection).countDocuments({ userId: own.user._id })).toBe(0)
})

import { inventoryService } from '../../src/modules/inventory/inventory.service.js'
import { initializeInventoryPersistence } from '../../src/modules/inventory/inventory.persistence.js'
import { variantStockAccess } from '../../src/modules/catalog/variants/variant.service.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { fakeMediaProvider, imageFile, mediaPolicy } from '../helpers/media.js'
import { createApp } from '../../src/app.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { createMediaAdminAccess } from '../../src/modules/auth/media-access.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { productAdminService } from '../../src/modules/catalog/products/product-admin.service.js'
import { productAdminRoutes } from '../../src/modules/catalog/products/product-admin.routes.js'
import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { catalogRoutes } from '../../src/modules/catalog/catalog.routes.js'
import { createMediaService } from '../../src/modules/media/media.service.js'
import { initializeMediaPersistence } from '../../src/modules/media/media.persistence.js'
import { mediaModel } from '../../src/modules/media/media.model.js'
import { publicMediaService } from '../../src/modules/media/public-media.service.js'
import { identityEnvironment, testEnvironment } from '../helpers/environment.js'
import { loadEnvironment } from '../../src/config/env.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { spawnSync } from 'node:child_process'
let db: Awaited<ReturnType<typeof isolatedDatabase>>,
  models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>,
  security: ReturnType<typeof createBrowserSecurity>
let service: ReturnType<typeof productAdminService>,
  media: ReturnType<typeof createMediaService>,
  provider: ReturnType<typeof fakeMediaProvider>
let app: ReturnType<typeof createApp>, categoryId: string
const origin = 'http://localhost:5173',
  base = '/api/v1/admin/products'
async function account(role: 'admin' | 'customer' = 'admin') {
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
const variant = (extra: object = {}) => ({
  sku: `SKU-${randomUUID()}`,
  attributes: {},
  regularPricePoisha: 100,
  ...extra,
})
const body = (extra: object = {}) => ({
  name: 'Synthetic ball',
  slug: `ball-${randomUUID()}`,
  description: 'Plain description',
  categoryIds: [categoryId],
  status: 'active',
  variants: [variant()],
  ...extra,
})
function post(who: Principal, path: string, data: object, match?: string) {
  const r = request(app)
    .post(path)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) r.set('If-Match', match)
  return r.send(data)
}
function patch(who: Principal, path: string, data: object, match?: string) {
  const r = request(app)
    .patch(path)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) r.set('If-Match', match)
  return r.send(data)
}
const get = (who: Principal, path: string) => request(app).get(path).set('Cookie', who.cookie)
async function create(who: Principal, extra: object = {}) {
  return (await post(who, base, body(extra)).expect(201)).body.data
}
const detail = async (who: Principal, id: string) =>
  (await get(who, `${base}/${id}`).expect(200)).body.data
const vp = (id: string) => `/api/v1/admin/variants/${id}`
async function upload(who: Principal) {
  const r = await media.uploadPublic(who.token, imageFile())
  if (!r.publicId || !r.url) throw new Error('Synthetic upload not ready')
  return { publicId: r.publicId, url: r.url, alt: 'Synthetic image' }
}
beforeAll(async () => {
  db = await isolatedDatabase()
  models = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, models)
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeProductPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
  await initializeInventoryPersistence(db.connection)
  await initializeMediaPersistence(db.connection)
  sessions = createSessionService(db.connection, models, {
    secret: randomBytes(32).toString('hex'),
    customerTtlSeconds: 600,
    adminTtlSeconds: 300,
    sameSite: 'lax',
    appEnvironment: 'test',
    apiOrigin: 'http://localhost:4000',
  })
  security = createBrowserSecurity(db.connection, models, sessions, {
    secret: randomBytes(32).toString('hex'),
    contextTtlSeconds: 120,
    storefrontOrigin: 'http://localhost:3000',
    adminOrigin: origin,
  })
})
beforeEach(async () => {
  await productModels(db.connection).variants.deleteMany({})
  await productModels(db.connection).products.deleteMany({})
  await categoryModel(db.connection).deleteMany({})
  await mediaModel(db.connection).deleteMany({})
  await db.connection.db?.collection('auditLogs').deleteMany({})
  categoryId = (
    await categoryModel(db.connection).create({
      name: 'Sports',
      slug: `sports-${randomUUID()}`,
      status: 'active',
    })
  )._id.toHexString()
  provider = fakeMediaProvider()
  media = createMediaService(db.connection, {
    provider: provider.adapter,
    scanner: async () => 'clean',
    policy: mediaPolicy,
    canDelete: async () => true,
    access: {
      admin: createMediaAdminAccess(models, sessions),
      evidence: async () => {
        throw new Error('Private fixture denied')
      },
    },
  })
  service = productAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    createAuditWriter(db.connection),
    media,
  )
  app = createApp({
    apiRouter: Router().use(
      productAdminRoutes(service, security, sessions),
      catalogRoutes(
        catalogService(db.connection, publicMediaService(db.connection, provider.adapter)),
        [origin],
      ),
    ),
  })
})
afterAll(async () => {
  await db?.close()
})
it('creates product and normalized default SKU atomically with safe DTO, Location and ETag', async () => {
  const own = await account(),
    input = body({ slug: ' BALL ', variants: [variant({ sku: ' default-sku ' })] })
  const res = await post(own, base, input).expect(201)
  expect(res.headers.etag).toBe('"0"')
  expect(res.headers.location).toBe(`${base}/${res.body.data.id}`)
  expect(res.headers['cache-control']).toBe('no-store')
  expect(res.body.data).toMatchObject({ slug: 'ball', featured: false, revision: 0, images: [] })
  expect(res.body.data).not.toHaveProperty('variants')
  expect(res.body.data).not.toHaveProperty('ratingSummary')
  const d = await detail(own, res.body.data.id)
  expect(d.variants[0]).toMatchObject({
    sku: 'DEFAULT-SKU',
    stock: { physical: 0, reserved: 0, committed: 0, available: 0 },
    revision: 0,
  })
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('returns every active/inactive variant in detail and bounded filtered lists without writing', async () => {
  const own = await account(),
    p = await create(own, {
      variants: [
        variant({ attributes: { size: 's' } }),
        variant({ attributes: { size: 'm' }, status: 'inactive' }),
      ],
    })
  await create(own, { status: 'inactive' })
  const before = await models.users.findById(own.user._id).lean()
  expect((await detail(own, p.id)).variants).toHaveLength(2)
  const r = await get(own, `${base}?pageSize=1`).expect(200)
  expect(r.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 })
  expect(r.body.data).toHaveLength(1)
  expect((await get(own, `${base}?status=inactive`)).body.meta.totalItems).toBe(1)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
  expect((await get(own, `${base}?q=%2E%2A`)).body.data).toEqual([])
})
it.each([
  { variants: [] },
  { variants: undefined },
  { variants: [variant({ attributes: {} }), variant({ attributes: { size: 'm' } })] },
  { variants: [variant({ attributes: { size: 'm' } }), variant({ attributes: { size: ' M ' } })] },
  { variants: [variant({ salePricePoisha: 101 })] },
  { stock: { physical: 1 } },
])('rejects invalid initial variants or protected product fields', async (extra) => {
  const own = await account()
  await post(own, base, body(extra)).expect(400)
  expect(await productModels(db.connection).products.countDocuments()).toBe(0)
})
it('rejects unknown/inactive ancestry and an active product without active SKUs', async () => {
  const own = await account()
  await post(own, base, body({ categoryIds: [new Types.ObjectId().toHexString()] })).expect(404)
  await categoryModel(db.connection).updateOne(
    { _id: categoryId },
    { $set: { status: 'inactive' } },
  )
  await post(own, base, body()).expect(409)
  await post(own, base, body({ status: 'draft' })).expect(201)
  await post(own, base, body({ variants: [variant({ status: 'inactive' })] })).expect(409)
})
it('enforces normalized slug/SKU uniqueness and rolls back the whole rejected aggregate', async () => {
  const own = await account(),
    sku = 'UNIQUE-SKU',
    first = await create(own, { slug: 'unique', variants: [variant({ sku })] })
  const before = (await categoryModel(db.connection).findById(categoryId))?.revision
  await post(own, base, body({ slug: ' UNIQUE ' })).expect(409)
  await post(
    own,
    base,
    body({
      variants: [
        variant({ sku: 'NEW', attributes: { size: 's' } }),
        variant({ sku: sku.toLowerCase(), attributes: { size: 'm' } }),
      ],
    }),
  ).expect(409)
  expect(await productModels(db.connection).products.countDocuments()).toBe(1)
  expect(await productModels(db.connection).variants.countDocuments()).toBe(1)
  expect((await categoryModel(db.connection).findById(categoryId))?.revision).toBe(before)
  expect((await detail(own, first.id)).variants[0].sku).toBe(sku)
})
it('serializes concurrent duplicate creation and stale product edits across admins', async () => {
  const own = await account(),
    other = await account(),
    input = body({ slug: 'racing', variants: [variant({ sku: 'RACING' })] })
  const r = await Promise.all([post(own, base, input), post(other, base, input)])
  expect(r.map((x) => x.status).sort()).toEqual([201, 409])
  const p = r.find((x) => x.status === 201)?.body.data
  const edits = await Promise.all([
    patch(own, `${base}/${p.id}`, { featured: true }, '"0"'),
    patch(other, `${base}/${p.id}`, { name: 'Changed' }, '"0"'),
  ])
  expect(edits.map((x) => x.status).sort()).toEqual([200, 412])
})
it('supports product metadata, category changes, featured/search updates and public revalidation', async () => {
  const own = await account(),
    p = await create(own)
  const c = await categoryModel(db.connection).create({
    name: 'Another',
    slug: 'another',
    status: 'active',
  })
  const r = await patch(
    own,
    `${base}/${p.id}`,
    {
      slug: 'updated-ball',
      description: 'Updated plain text',
      categoryIds: [c._id.toHexString()],
      featured: true,
      keywords: [' Match ', 'match'],
    },
    '"0"',
  ).expect(200)
  expect(r.body.data).toMatchObject({ slug: 'updated-ball', featured: true, revision: 1 })
  expect(
    (await request(app).get('/api/v1/products/updated-ball').expect(200)).body.data.description,
  ).toBe('Updated plain text')
  expect((await request(app).get('/api/v1/products?q=match')).body.data).toHaveLength(1)
  await post(own, `${base}/${p.id}/deactivate`, { reason: 'Synthetic operator' }, '"1"').expect(200)
  await request(app).get('/api/v1/products/updated-ball').expect(404)
  expect(await productModels(db.connection).variants.countDocuments()).toBe(1)
})
it('validates variant additions against all configured keys/combinations and invalidates product revision', async () => {
  const own = await account(),
    p = await create(own, { variants: [variant({ attributes: { size: ' S ' } })] })
  const r = await post(
    own,
    `${base}/${p.id}/variants`,
    variant({ attributes: { size: 'M' } }),
  ).expect(201)
  expect(r.body.data.attributes).toEqual({ size: 'm' })
  await post(own, `${base}/${p.id}/variants`, variant({ attributes: { size: 'm' } })).expect(400)
  await post(own, `${base}/${p.id}/variants`, variant({ attributes: { color: 'red' } })).expect(400)
  await post(own, `${base}/${p.id}/variants`, variant()).expect(400)
  await patch(own, `${base}/${p.id}`, { featured: true }, '"0"').expect(412)
  expect((await detail(own, p.id)).variants).toHaveLength(2)
})
it('implements price/status/threshold patch with omission preservation, null unsets and unchanged stock', async () => {
  const own = await account(),
    p = await create(own, { variants: [variant({ salePricePoisha: 80 })] }),
    v = (await detail(own, p.id)).variants[0]
  await patch(own, vp(v.id), { lowStockThreshold: 0 }, '"0"').expect(200)
  const a = await patch(own, vp(v.id), { regularPricePoisha: 120 }, '"1"').expect(200)
  expect(a.body.data).toMatchObject({
    salePricePoisha: 80,
    lowStockThreshold: 0,
    stock: { physical: 0, reserved: 0, committed: 0 },
  })
  const b = await patch(
    own,
    vp(v.id),
    { salePricePoisha: null, lowStockThreshold: null },
    '"2"',
  ).expect(200)
  expect(b.body.data).not.toHaveProperty('salePricePoisha')
  expect(b.body.data).not.toHaveProperty('lowStockThreshold')
  await patch(own, vp(v.id), { salePricePoisha: 121 }, '"3"').expect(400)
  await patch(own, vp(v.id), { sku: 'CHANGED' }, '"3"').expect(400)
  await patch(own, vp(v.id), { stock: { physical: 1 } }, '"3"').expect(400)
  expect(
    (await request(app).get(`/api/v1/products/${p.slug}`)).body.data.variants[0].regularPricePoisha,
  ).toBe(120)
})
it('prevents concurrent deactivation of the last active SKU through the shared parent fence', async () => {
  const own = await account(),
    other = await account(),
    p = await create(own, {
      variants: [variant({ attributes: { size: 's' } }), variant({ attributes: { size: 'm' } })],
    }),
    vs = (await detail(own, p.id)).variants
  const r = await Promise.all(
    vs.map((v: { id: string }, i: number) =>
      post(i ? other : own, `${vp(v.id)}/deactivate`, { reason: 'Synthetic' }, '"0"'),
    ),
  )
  expect(r.map((x) => x.status).sort()).toEqual([200, 422])
  expect(
    await productModels(db.connection).variants.countDocuments({
      productId: p.id,
      status: 'active',
    }),
  ).toBe(1)
})
it('blocks active product reactivation without active SKUs and allows inactive lifecycle management', async () => {
  const own = await account(),
    p = await create(own, { status: 'inactive', variants: [variant({ status: 'inactive' })] }),
    v = (await detail(own, p.id)).variants[0]
  await patch(own, `${base}/${p.id}`, { status: 'active' }, '"0"').expect(422)
  await patch(own, vp(v.id), { status: 'active' }, '"0"').expect(200)
  await patch(own, `${base}/${p.id}`, { status: 'active' }, '"1"').expect(200)
})
it('replaces/reorders/removes galleries atomically with canonical ledger slots and no provider deletion', async () => {
  const own = await account(),
    a = await upload(own),
    b = await upload(own),
    p = await create(own, { images: [a, b] })
  await patch(own, `${base}/${p.id}`, { images: [b, a] }, '"0"').expect(200)
  expect((await detail(own, p.id)).images.map((i: { publicId: string }) => i.publicId)).toEqual([
    b.publicId,
    a.publicId,
  ])
  expect(
    (await mediaModel(db.connection).findOne({ publicId: a.publicId }))?.references[0]?.slot,
  ).toBe('image:1')
  await patch(own, `${base}/${p.id}`, { featured: true }, '"1"').expect(200)
  expect((await detail(own, p.id)).images).toHaveLength(2)
  await patch(own, `${base}/${p.id}`, { images: [] }, '"2"').expect(200)
  expect(
    (await mediaModel(db.connection).findOne({ publicId: a.publicId }))?.references,
  ).toHaveLength(0)
  expect(provider.state.deletes).toBe(0)
})
it('rejects forged, duplicate and quarantined image refs without partial product creation', async () => {
  const own = await account(),
    image = await upload(own)
  await post(
    own,
    base,
    body({ images: [{ ...image, url: 'https://foreign.example.test/fake.png' }] }),
  ).expect(400)
  await post(own, base, body({ images: [image, image] })).expect(400)
  await mediaModel(db.connection).updateOne(
    { publicId: image.publicId },
    { $set: { status: 'quarantined' } },
  )
  await post(own, base, body({ images: [image] })).expect(409)
  expect(await productModels(db.connection).products.countDocuments()).toBe(0)
})
it('rolls back product/variants/media/ancestry/auth fences on audit failure', async () => {
  const own = await account(),
    image = await upload(own),
    before = await models.users.findById(own.user._id).lean(),
    revision = (await categoryModel(db.connection).findById(categoryId))?.revision
  const failing = productAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    async () => {
      throw new Error('Synthetic audit failure')
    },
    media,
  )
  await expect(failing.create(own.token, body({ images: [image] }))).rejects.toThrow('Synthetic')
  expect(await productModels(db.connection).products.countDocuments()).toBe(0)
  expect(await productModels(db.connection).variants.countDocuments()).toBe(0)
  expect(
    (await mediaModel(db.connection).findOne({ publicId: image.publicId }))?.references,
  ).toHaveLength(0)
  expect((await categoryModel(db.connection).findById(categoryId))?.revision).toBe(revision)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
})
it('requires role/browser proof, strict queries, current CAS and known IDs', async () => {
  const own = await account(),
    customer = await account('customer'),
    p = await create(own)
  await request(app).get(base).expect(401)
  await get(customer, base).expect(401)
  await request(app).post(base).set('Cookie', own.cookie).send(body()).expect(403)
  await patch(own, `${base}/${p.id}`, { name: 'Stale' }).expect(428)
  await patch(own, `${base}/${p.id}`, { name: 'Stale' }, 'W/"0"').expect(412)
  await get(own, `${base}?pageSize=101`).expect(400)
  await get(own, `${base}?userId=foreign`).expect(400)
  await get(own, `${base}/${new Types.ObjectId().toHexString()}`).expect(404)
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(service.create(own.token, body())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
})
it('fails closed on missing indexes or unavailable image composition without disabling metadata', async () => {
  const own = await account(),
    image = await upload(own),
    noMedia = productAdminService(
      db.connection,
      createAdminAccountAccess(db.connection, models, sessions),
      createAuditWriter(db.connection),
    )
  await expect(noMedia.create(own.token, body({ images: [image] }))).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  })
  await noMedia.create(own.token, body())
  await productModels(db.connection).products.collection.dropIndex('product_slug_unique')
  try {
    await get(own, base).expect(503)
  } finally {
    await productModels(db.connection).products.createIndexes()
  }
})
it('wires full product/variant APIs through actual root admin activation', async () => {
  await createRegistrationNotifications(db.connection).initialize()
  const config = loadEnvironment(identityEnvironment())
  if (!config.identity) throw new Error('Missing fixture identity')
  const own = await account(),
    rs = createSessionService(db.connection, models, config.identity.sessions),
    issued = await rs.issue('admin', own.user._id)
  const runtime = createApp({ apiRouter: await composeIdentityRoutes(db.connection, config) })
  await request(runtime)
    .post(base)
    .set('Cookie', `sz_admin_sid=${issued.token}`)
    .set('Origin', config.ADMIN_ORIGIN)
    .set('X-CSRF-Token', issued.csrfToken)
    .send(body())
    .expect(201)
  const disabled = createApp({
    apiRouter: await composeIdentityRoutes(db.connection, { ...config, ADMIN_AUTH_ENABLED: false }),
  })
  await request(disabled).get(base).expect(404)
})
it('runs compiled catalog bootstrap additively and refuses production', async () => {
  const own = await account(),
    p = await create(own),
    env = {
      ...testEnvironment(),
      MONGODB_URI: db.replica.getUri(),
      MONGODB_DB_NAME: db.connection.name,
    }
  for (let i = 0; i < 2; i++) {
    const r = spawnSync(process.execPath, ['scripts/bootstrap-catalog.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(r.status, r.stderr).toBe(0)
  }
  expect((await detail(own, p.id)).variants).toHaveLength(1)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-catalog.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(refused.status).toBe(1)
  expect(refused.stderr).not.toContain(env.MONGODB_URI)
})

it('invalidates product detail ETag on canonical stock movement and rolls back an exhausted parent fence', async () => {
  const own = await account(),
    p = await create(own),
    v = (await detail(own, p.id)).variants[0]
  const inventory = inventoryService(db.connection, variantStockAccess(db.connection))
  await inventory.adjustPhysical({
    variantId: v.id,
    actorId: own.user._id.toHexString(),
    deltaPhysical: 1,
    operationKey: 'stock',
    reason: 'Synthetic count',
  })
  const res = await get(own, `${base}/${p.id}`).expect(200)
  expect(res.headers.etag).toBe('"1"')
  expect(res.body.data.variants[0].stock.physical).toBe(1)
  await patch(own, `${base}/${p.id}`, { featured: true }, '"0"').expect(412)
  await productModels(db.connection).products.updateOne(
    { _id: p.id },
    { $set: { revision: Number.MAX_SAFE_INTEGER } },
  )
  await expect(
    inventory.adjustPhysical({
      variantId: v.id,
      actorId: own.user._id.toHexString(),
      deltaPhysical: 1,
      operationKey: 'exhausted',
      reason: 'Synthetic',
    }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const row = await productModels(db.connection).variants.findById(v.id)
  expect(row?.stock.physical).toBe(1)
  expect(row?.revision).toBe(1)
})
it('rolls back an existing variant and its parent revision when audit persistence fails', async () => {
  const own = await account(),
    p = await create(own),
    v = (await detail(own, p.id)).variants[0]
  const failing = productAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    async () => {
      throw new Error('Synthetic audit failure')
    },
  )
  await expect(
    failing.patchVariant(own.token, v.id, { regularPricePoisha: 200 }, '"0"'),
  ).rejects.toThrow('Synthetic')
  const after = await detail(own, p.id)
  expect(after.revision).toBe(0)
  expect(after.variants[0]).toMatchObject({ regularPricePoisha: 100, revision: 0 })
})

it('reorders a gallery at the public reference limit without needing an extra reference', async () => {
  const own = await account(),
    a = await upload(own),
    b = await upload(own),
    p = await create(own, { images: [a, b] })
  // Synthetic historical references fill the canonical ledger to its 40-target limit.
  for (const image of [a, b])
    await mediaModel(db.connection).updateOne(
      { publicId: image.publicId },
      {
        $push: {
          references: {
            $each: Array.from({ length: 39 }, () => ({
              targetType: 'product',
              targetId: new Types.ObjectId(),
              slot: 'image:0',
            })),
          },
        },
      },
    )
  await patch(own, `${base}/${p.id}`, { images: [b, a] }, '"0"').expect(200)
  expect((await detail(own, p.id)).images.map((i: { publicId: string }) => i.publicId)).toEqual([
    b.publicId,
    a.publicId,
  ])
  for (const image of [a, b])
    expect(
      (await mediaModel(db.connection).findOne({ publicId: image.publicId }))?.references,
    ).toHaveLength(40)
})
it('serializes variant price edits with real stock movement without lost counters or stale price overwrite', async () => {
  const own = await account(),
    p = await create(own),
    v = (await detail(own, p.id)).variants[0]
  const inventory = inventoryService(db.connection, variantStockAccess(db.connection))
  const [edited] = await Promise.all([
    patch(own, vp(v.id), { regularPricePoisha: 120 }, '"0"'),
    inventory.adjustPhysical({
      variantId: v.id,
      actorId: own.user._id.toHexString(),
      deltaPhysical: 2,
      operationKey: 'race-stock',
      reason: 'Synthetic count',
    }),
  ])
  expect([200, 412]).toContain(edited.status)
  const after = await detail(own, p.id)
  expect(after.variants[0].stock).toEqual({ physical: 2, reserved: 0, committed: 0, available: 2 })
  expect(after.variants[0].regularPricePoisha).toBe(edited.status === 200 ? 120 : 100)
  expect(after.variants[0].revision).toBe(edited.status === 200 ? 2 : 1)
})

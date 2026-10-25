import { spawnSync } from 'node:child_process'
import { testEnvironment } from '../helpers/environment.js'
import { Router } from 'express'
import { Types } from 'mongoose'
import { randomBytes, randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createMediaAdminAccess } from '../../src/modules/auth/media-access.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { catalogRoutes } from '../../src/modules/catalog/catalog.routes.js'
import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { categoryAdminRoutes } from '../../src/modules/catalog/categories/category-admin.routes.js'
import { categoryAdminService } from '../../src/modules/catalog/categories/category-admin.service.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { categoryService } from '../../src/modules/catalog/categories/category.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { productService } from '../../src/modules/catalog/products/product.service.js'
import { mediaModel } from '../../src/modules/media/media.model.js'
import { initializeMediaPersistence } from '../../src/modules/media/media.persistence.js'
import { createMediaService } from '../../src/modules/media/media.service.js'
import { publicMediaService } from '../../src/modules/media/public-media.service.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { isolatedDatabase } from '../helpers/database.js'
import { identityEnvironment } from '../helpers/environment.js'
import { fakeMediaProvider, imageFile, mediaPolicy } from '../helpers/media.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let identities: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let service: ReturnType<typeof categoryAdminService>
let media: ReturnType<typeof createMediaService>
let provider: ReturnType<typeof fakeMediaProvider>
let app: ReturnType<typeof createApp>
const origin = 'http://localhost:5173',
  base = '/api/v1/admin/categories'
async function account(role: 'admin' | 'customer' = 'admin') {
  const user = await identities.users.create({
    name: 'Synthetic',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
  })
  const issued = await sessions.issue(role, user._id)
  return {
    user,
    issued,
    token: issued.token,
    cookie: `sz_${role}_sid=${issued.token}`,
  }
}
type Principal = Awaited<ReturnType<typeof account>>
function post(who: Principal, body: object, suffix = '', match?: string) {
  const req = request(app)
    .post(base + suffix)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) req.set('If-Match', match)
  return req.send(body)
}
function patch(who: Principal, id: string, body: object, match?: string) {
  const req = request(app)
    .patch(`${base}/${id}`)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) req.set('If-Match', match)
  return req.send(body)
}
const list = (who: Principal, q = '') =>
  request(app)
    .get(base + q)
    .set('Cookie', who.cookie)
async function create(who: Principal, extra: object = {}) {
  return (
    await post(who, {
      name: 'Sports',
      slug: `sports-${randomUUID()}`,
      ...extra,
    }).expect(201)
  ).body.data
}
async function upload(who: Principal) {
  const res = await media.uploadPublic(who.token, imageFile())
  if (!res.publicId || !res.url) throw new Error('Synthetic upload was not ready')
  return { publicId: res.publicId, url: res.url, alt: 'Synthetic image' }
}
async function revision(id: string) {
  return String((await categoryModel(db.connection).findById(id))?.revision)
}
beforeAll(async () => {
  db = await isolatedDatabase()
  identities = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, identities)
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeProductPersistence(db.connection)
  await initializeMediaPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
  sessions = createSessionService(db.connection, identities, {
    secret: randomBytes(32).toString('hex'),
    customerTtlSeconds: 600,
    adminTtlSeconds: 300,
    sameSite: 'lax',
    appEnvironment: 'test',
    apiOrigin: 'http://localhost:4000',
  })
  security = createBrowserSecurity(db.connection, identities, sessions, {
    secret: randomBytes(32).toString('hex'),
    contextTtlSeconds: 120,
    storefrontOrigin: 'http://localhost:3000',
    adminOrigin: origin,
  })
})
beforeEach(async () => {
  await categoryModel(db.connection).deleteMany({})
  await mediaModel(db.connection).deleteMany({})
  await productModels(db.connection).products.deleteMany({})
  await productModels(db.connection).variants.deleteMany({})
  await db.connection.db?.collection('auditLogs').deleteMany({})
  provider = fakeMediaProvider()
  media = createMediaService(db.connection, {
    provider: provider.adapter,
    scanner: async () => 'clean',
    policy: mediaPolicy,
    canDelete: async () => true,
    access: {
      admin: createMediaAdminAccess(identities, sessions),
      evidence: async () => {
        throw new Error('No synthetic private evidence access')
      },
    },
  })
  service = categoryAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    createAuditWriter(db.connection),
    media,
  )
  const router = Router().use(
    categoryAdminRoutes(service, security, sessions),
    catalogRoutes(
      catalogService(db.connection, publicMediaService(db.connection, provider.adapter)),
      [origin],
    ),
  )
  app = createApp({ apiRouter: router })
})
afterAll(async () => {
  await db?.close()
})
it('creates normalized safe categories with strong ETag and a durable audit digest', async () => {
  const own = await account()
  const res = await post(own, {
    name: ' Sports ',
    slug: ' SPORTS ',
    sortOrder: 2,
  }).expect(201)
  expect(res.headers.etag).toBe('"0"')
  expect(res.headers['cache-control']).toBe('no-store')
  expect(res.headers['access-control-expose-headers']).toContain('ETag')
  expect(res.body.data).toMatchObject({
    name: 'Sports',
    slug: 'sports',
    status: 'active',
    sortOrder: 2,
    revision: 0,
  })
  expect(res.body.data).not.toHaveProperty('_id')
  const audit = await db.connection.db
    ?.collection('auditLogs')
    .findOne({ action: 'category.create' })
  expect(audit?.actorId).toEqual(own.user._id)
  expect(audit?.afterDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(audit).not.toHaveProperty('name')
})
it('lists bounded stable status-filtered pages without changing principal timestamps', async () => {
  const own = await account(),
    a = await create(own),
    b = await create(own, { status: 'inactive' })
  const before = await identities.users.findById(own.user._id).lean()
  const first = await list(own, '?pageSize=1').expect(200),
    second = await list(own, '?pageSize=1&page=2').expect(200)
  expect(first.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 })
  expect([first.body.data[0].id, second.body.data[0].id].sort()).toEqual([a.id, b.id].sort())
  expect((await list(own, '?status=inactive')).body.data[0].id).toBe(b.id)
  expect((await identities.users.findById(own.user._id).lean())?.updatedAt).toEqual(
    before?.updatedAt,
  )
})
it('preserves omitted parent and supports explicit null root reassignment', async () => {
  const own = await account(),
    root = await create(own),
    child = await create(own, { parentId: root.id })
  const a = await patch(own, child.id, { name: 'Renamed' }, '"0"').expect(200)
  expect(a.body.data.parentId).toBe(root.id)
  const b = await patch(own, child.id, { parentId: null }, '"1"').expect(200)
  expect(b.body.data).not.toHaveProperty('parentId')
  expect(await revision(root.id)).toBe('1')
})
it('rejects cycles, missing parents and stale ancestry revisions', async () => {
  const own = await account(),
    root = await create(own),
    child = await create(own, { parentId: root.id })
  await patch(own, root.id, { name: 'Stale' }, '"0"').expect(412)
  await patch(own, root.id, { parentId: child.id }, '"1"').expect(409)
  await patch(own, root.id, { parentId: root.id }, '"1"').expect(409)
  await create(own, { parentId: root.id })
  await post(own, {
    name: 'Missing',
    slug: 'missing',
    parentId: new Types.ObjectId().toHexString(),
  }).expect(404)
})
it.each([undefined, '0', '*', 'W/"0"', '"01"', '"9007199254740992"'])(
  'rejects missing or malformed revision %s',
  async (match) => {
    const own = await account(),
      c = await create(own)
    await patch(own, c.id, { name: 'Changed' }, match).expect(match === undefined ? 428 : 412)
  },
)
it('serializes normalized slug uniqueness and concurrent cross-admin writes', async () => {
  const own = await account(),
    other = await account(),
    slug = `unique-${randomUUID()}`
  const creates = await Promise.all([
    post(own, { name: 'A', slug }),
    post(other, { name: 'B', slug: slug.toUpperCase() }),
  ])
  expect(creates.map((r) => r.status).sort()).toEqual([201, 409])
  const c = (await list(own)).body.data[0]
  const edits = await Promise.all([
    patch(own, c.id, { name: 'A' }, '"0"'),
    patch(other, c.id, { name: 'B' }, '"0"'),
  ])
  expect(edits.map((r) => r.status).sort()).toEqual([200, 412])
})
it('prevents concurrent mutual reparenting and leaves an acyclic hierarchy', async () => {
  const own = await account(),
    other = await account(),
    a = await create(own),
    b = await create(own)
  const res = await Promise.all([
    patch(own, a.id, { parentId: b.id }, '"0"'),
    patch(other, b.id, { parentId: a.id }, '"0"'),
  ])
  expect(res.filter((r) => r.status === 200)).toHaveLength(1)
  expect(res.every((r) => [200, 409, 412].includes(r.status))).toBe(true)
  const rows = await categoryModel(db.connection).find().lean()
  expect(rows.filter((row) => row.parentId)).toHaveLength(1)
})
it('deactivates ancestry without deleting dependent products or rewriting historical references', async () => {
  const own = await account(),
    root = await create(own),
    child = await create(own, { parentId: root.id })
  const products = productService(db.connection, categoryService(db.connection))
  await products.create(
    {
      name: 'Ball',
      slug: 'ball',
      description: 'Synthetic',
      categoryIds: [child.id],
      status: 'active',
    },
    [{ sku: 'BALL', attributes: {}, regularPricePoisha: 100 }],
  )
  const res = await post(
    own,
    { reason: 'Synthetic operator decision' },
    `/${root.id}/deactivate`,
    `"${await revision(root.id)}"`,
  ).expect(200)
  expect(res.body.data.status).toBe('inactive')
  expect((await request(app).get('/api/v1/categories')).body.data).toEqual([])
  expect((await request(app).get('/api/v1/products')).body.data).toEqual([])
  expect(await productModels(db.connection).products.countDocuments()).toBe(1)
  await expect(
    products.create(
      {
        name: 'Another',
        slug: 'another',
        description: 'Synthetic',
        categoryIds: [child.id],
        status: 'active',
      },
      [{ sku: 'ANOTHER', attributes: {}, regularPricePoisha: 1 }],
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await request(app)
    .delete(`${base}/${root.id}`)
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', own.issued.csrfToken)
    .expect(404)
})
it('attaches, replaces and removes eligible media atomically while preserving omission semantics', async () => {
  const own = await account(),
    image = await upload(own),
    another = await upload(own)
  const c = await create(own, { image })
  let first = await mediaModel(db.connection).findOne({
    publicId: image.publicId,
  })
  expect(first?.references[0]).toMatchObject({
    targetType: 'category',
    slot: 'image',
  })
  await patch(own, c.id, { name: 'Renamed' }, '"0"').expect(200)
  expect((await categoryModel(db.connection).findById(c.id))?.image?.publicId).toBe(image.publicId)
  await patch(own, c.id, { image: another }, '"1"').expect(200)
  first = await mediaModel(db.connection).findOne({ publicId: image.publicId })
  expect(first?.status).toBe('temporary')
  expect(first?.references).toHaveLength(0)
  expect((await request(app).get('/api/v1/categories')).body.data[0].image.url).toBe(another.url)
  await patch(own, c.id, { image: null }, '"2"').expect(200)
  expect((await categoryModel(db.connection).findById(c.id))?.image).toBeUndefined()
  expect(
    (await mediaModel(db.connection).findOne({ publicId: another.publicId }))?.references,
  ).toHaveLength(0)
  expect(provider.state.deletes).toBe(0)
})
it('revalidates same-image metadata changes and derives a bounded alt when omitted', async () => {
  const own = await account(),
    image = await upload(own),
    c = await create(own, { image })
  const res = await patch(
    own,
    c.id,
    {
      image: { publicId: image.publicId, url: image.url },
      name: 'Category name',
    },
    '"0"',
  ).expect(200)
  expect(res.body.data.image.alt).toBe('Category name')
  expect(
    (await mediaModel(db.connection).findOne({ publicId: image.publicId }))?.references,
  ).toHaveLength(1)
})
it('rejects forged URLs, unknown/quarantined/expired media without changing target or references', async () => {
  const own = await account(),
    image = await upload(own),
    c = await create(own)
  await patch(
    own,
    c.id,
    { image: { ...image, url: 'https://foreign.example.test/fake.png' } },
    '"0"',
  ).expect(400)
  await patch(
    own,
    c.id,
    {
      image: {
        ...image,
        publicId: `sportzone/${new Types.ObjectId().toHexString()}`,
      },
    },
    '"0"',
  ).expect(404)
  await mediaModel(db.connection).updateOne(
    { publicId: image.publicId },
    { $set: { status: 'quarantined' } },
  )
  await patch(own, c.id, { image }, '"0"').expect(409)
  await mediaModel(db.connection).updateOne(
    { publicId: image.publicId },
    { $set: { status: 'temporary', expiresAt: new Date(Date.now() - 1000) } },
  )
  await patch(own, c.id, { image }, '"0"').expect(409)
  expect(await revision(c.id)).toBe('0')
  expect(
    (await mediaModel(db.connection).findOne({ publicId: image.publicId }))?.references,
  ).toHaveLength(0)
})
it('fails closed for image writes when media composition is absent while metadata remains usable', async () => {
  const own = await account(),
    image = await upload(own)
  const unavailable = categoryAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    createAuditWriter(db.connection),
  )
  await expect(
    unavailable.create(own.token, {
      name: 'No media',
      slug: 'no-media',
      image,
    }),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  expect(
    await unavailable.create(own.token, {
      name: 'Metadata only',
      slug: 'metadata-only',
    }),
  ).toMatchObject({ name: 'Metadata only' })
})
it('rolls back image refs, category, ancestry and account changes if audit fails', async () => {
  const own = await account(),
    image = await upload(own),
    root = await create(own)
  const before = await identities.users.findById(own.user._id).lean()
  const failing = categoryAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    async () => {
      throw new Error('Synthetic audit failure')
    },
    media,
  )
  await expect(
    failing.create(own.token, {
      name: 'Rollback',
      slug: 'rollback',
      parentId: root.id,
      image,
    }),
  ).rejects.toThrow('Synthetic')
  expect(await categoryModel(db.connection).countDocuments()).toBe(1)
  expect(await revision(root.id)).toBe('0')
  expect(
    (await mediaModel(db.connection).findOne({ publicId: image.publicId }))?.references,
  ).toHaveLength(0)
  expect((await identities.users.findById(own.user._id).lean())?.updatedAt).toEqual(
    before?.updatedAt,
  )
})
it('rejects protected fields, empty patches, invalid queries and malformed IDs', async () => {
  const own = await account(),
    c = await create(own)
  await post(own, { name: 'Bad', slug: 'bad', revision: 0 }).expect(400)
  await post(own, { name: 'Bad', slug: 'bad', parentId: null }).expect(400)
  await patch(own, c.id, {}, '"0"').expect(400)
  await patch(own, c.id, { revision: 1 }, '"0"').expect(400)
  await patch(own, 'invalid', { name: 'Bad' }, '"0"').expect(400)
  await list(own, '?pageSize=101').expect(400)
  await list(own, '?userId=foreign').expect(400)
})
it('denies anonymous/customer/missing CSRF/wrong origin and suspended service identities', async () => {
  const own = await account(),
    customer = await account('customer')
  await request(app).get(base).expect(401)
  await list(customer).expect(401)
  await request(app)
    .post(base)
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .send({ name: 'Bad', slug: 'bad' })
    .expect(403)
  await request(app)
    .post(base)
    .set('Cookie', own.cookie)
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', own.issued.csrfToken)
    .send({ name: 'Bad', slug: 'bad' })
    .expect(403)
  await identities.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(service.create(own.token, { name: 'Bad', slug: 'bad' })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
})
it('rejects missing category indexes without creating persistence at request time', async () => {
  const own = await account()
  await categoryModel(db.connection).collection.dropIndex('category_slug_unique')
  try {
    await list(own).expect(503)
  } finally {
    await categoryModel(db.connection).createIndexes()
  }
})
it('is wired in actual admin runtime while default image composition remains disabled', async () => {
  await createRegistrationNotifications(db.connection).initialize()
  const config = loadEnvironment(identityEnvironment())
  if (!config.identity) throw new Error('Missing fixture identity')
  const own = await account(),
    runtimeSessions = createSessionService(db.connection, identities, config.identity.sessions),
    issued = await runtimeSessions.issue('admin', own.user._id)
  const runtime = createApp({
    apiRouter: await composeIdentityRoutes(db.connection, config),
  })
  await request(runtime)
    .post(base)
    .set('Cookie', `sz_admin_sid=${issued.token}`)
    .set('Origin', config.ADMIN_ORIGIN)
    .set('X-CSRF-Token', issued.csrfToken)
    .send({ name: 'Runtime', slug: 'runtime' })
    .expect(201)
  const disabled = createApp({
    apiRouter: await composeIdentityRoutes(db.connection, {
      ...config,
      ADMIN_AUTH_ENABLED: false,
    }),
  })
  await request(disabled).get(base).expect(404)
})
it('rejects foreign private evidence as a category image', async () => {
  const own = await account(),
    customer = await account('customer'),
    id = new Types.ObjectId()
  const publicId = `sportzone/${id.toHexString()}`
  await mediaModel(db.connection).create({
    _id: id,
    publicId,
    assetKind: 'claim_evidence',
    owner: { kind: 'customer', principalId: customer.user._id },
    orderId: new Types.ObjectId(),
    claimType: 'physical_return',
    orderItemIds: [new Types.ObjectId()],
    mimeType: 'image/png',
    format: 'png',
    size: 68,
    digest: 'a'.repeat(64),
    scanStatus: 'clean',
    access: 'private',
    status: 'temporary',
    expiresAt: new Date(Date.now() + 60000),
  })
  await post(own, {
    name: 'Private',
    slug: 'private',
    image: { publicId, url: provider.adapter.publicUrl(publicId, 'png') },
  }).expect(403)
  expect(await categoryModel(db.connection).countDocuments()).toBe(0)
})
it('rolls back image replacement and metadata together after audit failure', async () => {
  const own = await account(),
    first = await upload(own),
    next = await upload(own),
    c = await create(own, { image: first })
  const failing = categoryAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    async () => {
      throw new Error('Synthetic audit failure')
    },
    media,
  )
  await expect(
    failing.patch(own.token, c.id, { name: 'Rollback', image: next }, '"0"'),
  ).rejects.toThrow('Synthetic')
  expect((await categoryModel(db.connection).findById(c.id))?.image?.publicId).toBe(first.publicId)
  expect(await revision(c.id)).toBe('0')
  expect(
    (await mediaModel(db.connection).findOne({ publicId: first.publicId }))?.references,
  ).toHaveLength(1)
  expect(
    (await mediaModel(db.connection).findOne({ publicId: next.publicId }))?.references,
  ).toHaveLength(0)
})
it('serializes category attachment against authorized orphan deletion without dangling image refs', async () => {
  const own = await account(),
    image = await upload(own),
    c = await create(own)
  const asset = await mediaModel(db.connection).findOne({ publicId: image.publicId }).orFail()
  const results = await Promise.allSettled([
    patch(own, c.id, { image }, '"0"'),
    media.cleanup(asset._id.toHexString(), { adminCredential: own.token }),
  ])
  const saved = await mediaModel(db.connection).findById(asset._id).orFail()
  const target = await categoryModel(db.connection).findById(c.id).orFail()
  const response = results[0]
  expect(response?.status).toBe('fulfilled')
  if (response?.status !== 'fulfilled') throw new Error('Missing HTTP response')
  if (saved.status === 'attached') {
    expect(response.value.status).toBe(200)
    expect(target.image?.publicId).toBe(image.publicId)
    expect(saved.references).toHaveLength(1)
    expect(provider.state.deletes).toBe(0)
  } else {
    expect(saved.status).toBe('deleted')
    expect(response.value.status).toBe(409)
    expect(target.image).toBeUndefined()
    expect(saved.references).toHaveLength(0)
    expect(provider.state.deletes).toBe(1)
  }
})
it('rejects exhausted category and ancestry revisions instead of overflowing them', async () => {
  const own = await account(),
    parent = await create(own),
    c = await create(own)
  await categoryModel(db.connection).updateMany(
    { _id: { $in: [parent.id, c.id] } },
    { $set: { revision: Number.MAX_SAFE_INTEGER } },
  )
  await patch(own, c.id, { name: 'Overflow' }, `"${Number.MAX_SAFE_INTEGER}"`).expect(409)
  await post(own, { name: 'Child', slug: 'overflow-child', parentId: parent.id }).expect(409)
  expect(await categoryModel(db.connection).countDocuments()).toBe(2)
})

it('runs compiled category bootstrap additively and refuses production without exposing configuration', async () => {
  const own = await account(),
    c = await create(own)
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-categories.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Category indexes and audit persistence ready')
  }
  expect((await categoryModel(db.connection).findById(c.id))?.revision).toBe(0)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-categories.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(refused.status).toBe(1)
  expect(refused.stderr).not.toContain(env.MONGODB_URI)
})

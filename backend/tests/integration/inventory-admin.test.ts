import { Router } from 'express'
import { productAdminService } from '../../src/modules/catalog/products/product-admin.service.js'
import { productAdminRoutes } from '../../src/modules/catalog/products/product-admin.routes.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
import { identityEnvironment } from '../helpers/environment.js'
import { loadEnvironment } from '../../src/config/env.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { isolatedDatabase } from '../helpers/database.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { attributeSignature } from '../../src/modules/catalog/variants/variant.schema.js'
import {
  variantStockAccess,
  variantInventoryAccess,
} from '../../src/modules/catalog/variants/variant.service.js'
import { inventoryAdminService } from '../../src/modules/inventory/inventory-admin.service.js'
import { inventoryAdminRoutes } from '../../src/modules/inventory/inventory-admin.routes.js'
import { inventoryService } from '../../src/modules/inventory/inventory.service.js'
import { initializeAllocationPersistence } from '../../src/modules/inventory/inventory.persistence.js'
import { inventoryMovementModel } from '../../src/modules/inventory/inventory.model.js'
import { stockSettingsReader } from '../../src/modules/settings/stock-settings.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { allocationService } from '../../src/modules/inventory/allocation.service.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let service: ReturnType<typeof inventoryAdminService>
let app: ReturnType<typeof createApp>
const origin = 'http://localhost:5173',
  base = '/api/v1/admin/inventory'
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
async function variant(physical = 10, reserved = 2, committed = 3, name = 'Synthetic ball') {
  const category = await categoryModel(db.connection).create({
    name: 'Sports',
    slug: `cat-${randomUUID()}`,
    status: 'active',
  })
  const m = productModels(db.connection)
  const product = await m.products.create({
    name,
    slug: `product-${randomUUID()}`,
    description: 'Synthetic',
    categoryIds: [category._id],
    status: 'active',
  })
  const row = await m.variants.create({
    productId: product._id,
    skuNormalized: `SKU-${randomUUID().toUpperCase()}`,
    attributes: {},
    attributeSignature: attributeSignature({}),
    regularPricePoisha: 100,
    status: 'active',
    stock: { physical, reserved, committed },
  })
  return row._id.toHexString()
}
function adjust(
  who: Principal,
  id: string,
  deltaPhysical = 1,
  key: string = randomUUID(),
  extra: object = {},
) {
  return request(app)
    .post(`${base}/${id}/adjustments`)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
    .set('Idempotency-Key', key)
    .send({ deltaPhysical, reason: 'Synthetic count', ...extra })
}
function threshold(who: Principal, id: string, raw: object, match?: string) {
  const req = request(app)
    .patch(`/api/v1/admin/variants/${id}`)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) req.set('If-Match', match)
  return req.send(raw)
}
const list = (who: Principal, query = '') =>
  request(app)
    .get(base + query)
    .set('Cookie', who.cookie)
const history = (who: Principal, id: string, query = '') =>
  request(app).get(`${base}/${id}/movements${query}`).set('Cookie', who.cookie)
beforeAll(async () => {
  db = await isolatedDatabase()
  models = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, models)
  await initializeProductPersistence(db.connection)
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeAllocationPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
  // Synthetic canonical primary fixture; production settings provisioning/approval belongs to P09-013.
  await db.connection.db
    ?.collection('storeSettings')
    .createIndex({ key: 1 }, { unique: true, name: 'settings_primary_unique' })
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
  service = inventoryAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    inventoryService(db.connection, variantStockAccess(db.connection)),
    variantInventoryAccess(db.connection),
    stockSettingsReader(db.connection),
    createAuditWriter(db.connection),
  )
  app = createApp({
    apiRouter: Router().use(
      inventoryAdminRoutes(service, security, sessions),
      productAdminRoutes(
        productAdminService(
          db.connection,
          createAdminAccountAccess(db.connection, models, sessions),
          createAuditWriter(db.connection),
        ),
        security,
        sessions,
      ),
    ),
  })
})
beforeEach(async () => {
  const m = productModels(db.connection)
  await m.variants.deleteMany({})
  await m.products.deleteMany({})
  await inventoryMovementModel(db.connection).collection.deleteMany({})
  await db.connection.db?.collection('auditLogs').deleteMany({})
  await db.connection.db?.collection('storeSettings').deleteMany({})
  await db.connection.db?.collection('storeSettings').insertOne({
    key: 'primary',
    lowStockThreshold: 5,
    revision: 0,
    deliveryCoverageRevision: 0,
    paymentChannels: {
      bkashEnabled: false,
      nagadEnabled: false,
      rocketEnabled: false,
      codEnabled: false,
    },
    activePolicyVersions: {},
  })
})
afterAll(async () => {
  await db?.close()
})
it('returns separated counters, all-match totals, stock-based filters and bounded pages without writes', async () => {
  const own = await account(),
    id = await variant(),
    other = await variant(20, 1, 0)
  const before = await models.users.findById(own.user._id).lean()
  const res = await list(own, '?pageSize=1').expect(200)
  expect(res.body.data).toMatchObject({ physical: 30, reserved: 3, committed: 3, available: 24 })
  expect(res.body.data.variants).toHaveLength(1)
  expect(res.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 })
  const low = await list(own, '?lowStock=true').expect(200)
  expect(low.body.data.variants.map((v: { variantId: string }) => v.variantId)).toEqual([id])
  expect((await list(own, '?lowStock=false')).body.data.variants[0].variantId).toBe(other)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(0)
})
it('searches SKU and product names as bounded literal input including regex characters', async () => {
  const own = await account(),
    id = await variant(10, 0, 0, 'Ball [test]')
  await variant(10, 0, 0, 'Other')
  const res = await list(own, '?q=%5Btest%5D').expect(200)
  expect(res.body.data.variants[0].variantId).toBe(id)
  expect(res.body.meta.totalItems).toBe(1)
  expect((await list(own, '?q=%2E%2A')).body.meta.totalItems).toBe(0)
})
it('adjusts only physical stock with actor-derived movement and transactional audit', async () => {
  const own = await account(),
    id = await variant()
  const res = await adjust(own, id, -4).expect(200)
  expect(res.body.data.stock).toEqual({ physical: 6, reserved: 2, committed: 3, available: 1 })
  const movement = await inventoryMovementModel(db.connection).findById(res.body.data.movementId)
  expect(movement?.actor.id).toEqual(own.user._id)
  expect(movement?.deltaReserved).toBe(0)
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({ action: 'inventory.adjust' }),
  ).toBe(1)
})
it('replays the same key exactly once and rejects changed payload or actor', async () => {
  const own = await account(),
    other = await account(),
    id = await variant(),
    key = randomUUID()
  const a = await adjust(own, id, 2, key).expect(200),
    b = await adjust(own, id, 2, key).expect(200)
  expect(a.body.data).toEqual(b.body.data)
  await adjust(own, id, 3, key).expect(409)
  await adjust(other, id, 2, key).expect(409)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('serializes concurrent duplicate requests into one movement and audit fact', async () => {
  const own = await account(),
    id = await variant(),
    key = randomUUID()
  const res = await Promise.all([adjust(own, id, 2, key), adjust(own, id, 2, key)])
  expect(res.map((r) => r.status)).toEqual([200, 200])
  expect(res[0]?.body.data.movementId).toBe(res[1]?.body.data.movementId)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('rejects physical counts below reserved plus committed and unsafe overflow', async () => {
  const own = await account(),
    id = await variant()
  await adjust(own, id, -6).expect(409)
  const huge = await variant(Number.MAX_SAFE_INTEGER, 0, 0)
  await adjust(own, huge, 1).expect(409)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(0)
})
it.each([0, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])(
  'rejects malformed adjustment delta %s',
  async (delta) => {
    const own = await account(),
      id = await variant()
    await request(app)
      .post(`${base}/${id}/adjustments`)
      .set('Cookie', own.cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', own.issued.csrfToken)
      .set('Idempotency-Key', 'test')
      .send({ deltaPhysical: delta, reason: 'Synthetic' })
      .expect(400)
  },
)
it('rejects missing key, protected fields, invalid queries and path IDs', async () => {
  const own = await account(),
    id = await variant()
  await request(app)
    .post(`${base}/${id}/adjustments`)
    .set('Cookie', own.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', own.issued.csrfToken)
    .send({ deltaPhysical: 1, reason: 'Synthetic' })
    .expect(400)
  await adjust(own, id, 1, 'key', { actorId: new Types.ObjectId().toHexString() }).expect(400)
  await list(own, '?lowStock=1').expect(400)
  await list(own, '?pageSize=101').expect(400)
  await list(own, '?role=admin').expect(400)
  await history(own, 'invalid').expect(400)
  await history(own, new Types.ObjectId().toHexString()).expect(404)
})
it('uses threshold overrides, strong CAS and null fallback without stock changes', async () => {
  const own = await account(),
    id = await variant()
  const res = await threshold(own, id, { lowStockThreshold: 0 }, '"0"').expect(200)
  expect(res.headers.etag).toBe('"1"')
  expect(res.body.data.stock).toEqual({ physical: 10, reserved: 2, committed: 3, available: 5 })
  expect((await list(own, '?lowStock=true')).body.data.variants).toEqual([])
  await threshold(own, id, { lowStockThreshold: 10 }, '"0"').expect(412)
  await threshold(own, id, { lowStockThreshold: 10 }).expect(428)
  await threshold(own, id, { lowStockThreshold: -1 }, '"1"').expect(400)
  await threshold(own, id, { lowStockThreshold: 2, reserved: 0 }, '"1"').expect(400)
  await threshold(own, id, { lowStockThreshold: null }, '"1"').expect(200)
  expect((await list(own, '?lowStock=true')).body.data.variants[0]).toMatchObject({
    effectiveLowStockThreshold: 5,
  })
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(0)
})
it('rejects stale concurrent threshold edits across admins', async () => {
  const own = await account(),
    other = await account(),
    id = await variant()
  const res = await Promise.all([
    threshold(own, id, { lowStockThreshold: 1 }, '"0"'),
    threshold(other, id, { lowStockThreshold: 2 }, '"0"'),
  ])
  expect(res.map((r) => r.status).sort()).toEqual([200, 412])
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('paginates and date-bounds movement history with a safe allowlist', async () => {
  const own = await account(),
    id = await variant()
  await adjust(own, id, 1).expect(200)
  await adjust(own, id, -1).expect(200)
  const a = await history(own, id, '?pageSize=1').expect(200),
    b = await history(own, id, '?pageSize=1&page=2').expect(200)
  expect(a.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 })
  expect(a.body.data[0].id).not.toBe(b.body.data[0].id)
  expect(JSON.stringify(a.body)).not.toMatch(/operationKey|requestCorrelation|password/)
  expect((await history(own, id, '?from=2099-01-01T00:00:00Z')).body.data).toEqual([])
  await history(own, id, '?from=2099-01-01T00:00:00Z&to=2026-01-01T00:00:00Z').expect(400)
})
it('rolls back stock, movement, threshold and account fence if auditing fails', async () => {
  const own = await account(),
    id = await variant(),
    before = await models.users.findById(own.user._id).lean()
  const failing = inventoryAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    inventoryService(db.connection, variantStockAccess(db.connection)),
    variantInventoryAccess(db.connection),
    stockSettingsReader(db.connection),
    async () => {
      throw new Error('Synthetic audit failure')
    },
  )
  await expect(
    failing.adjust(own.token, id, { deltaPhysical: 1, reason: 'Synthetic' }, 'rollback'),
  ).rejects.toThrow('Synthetic')
  await expect(
    productAdminService(
      db.connection,
      createAdminAccountAccess(db.connection, models, sessions),
      async () => {
        throw new Error('Synthetic audit failure')
      },
    ).patchVariant(own.token, id, { lowStockThreshold: 1 }, '"0"'),
  ).rejects.toThrow('Synthetic')
  expect((await productModels(db.connection).variants.findById(id))?.revision).toBe(0)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(0)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
})
it('fails closed instead of inventing a default setting or ignoring missing indexes', async () => {
  const own = await account()
  await variant()
  await db.connection.db?.collection('storeSettings').deleteMany({})
  await list(own).expect(503)
  await db.connection.db
    ?.collection('storeSettings')
    .insertOne({ key: 'primary', lowStockThreshold: -1 })
  await list(own).expect(503)
  await db.connection.db
    ?.collection('storeSettings')
    .updateOne({ key: 'primary' }, { $set: { lowStockThreshold: 5 } })
  await db.connection.db?.collection('storeSettings').dropIndex('settings_primary_unique')
  try {
    await list(own).expect(503)
  } finally {
    await db.connection.db
      ?.collection('storeSettings')
      .createIndex({ key: 1 }, { unique: true, name: 'settings_primary_unique' })
  }
  await productModels(db.connection).variants.collection.dropIndex('variant_sku_unique')
  try {
    await list(own).expect(503)
  } finally {
    await productModels(db.connection).variants.createIndexes()
  }
})
it('denies anonymous/customer/wrong-origin requests and rechecks suspended services', async () => {
  const own = await account(),
    customer = await account('customer'),
    id = await variant()
  await request(app).get(base).expect(401)
  await list(customer).expect(401)
  await request(app)
    .post(`${base}/${id}/adjustments`)
    .set('Cookie', own.cookie)
    .send({ deltaPhysical: 1, reason: 'Synthetic' })
    .expect(403)
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(
    service.adjust(own.token, id, { deltaPhysical: 1, reason: 'Synthetic' }, 'key'),
  ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
})
it('serializes physical adjustments against real inventory reservations', async () => {
  const own = await account(),
    id = await variant(5, 0, 0)
  const allocation = allocationService(db.connection, variantStockAccess(db.connection))
  const command = {
    variantId: id,
    orderId: new Types.ObjectId().toHexString(),
    quantity: 4,
    generation: 1,
    operationKey: 'reserve',
    reason: 'Synthetic',
  }
  const results = await Promise.all([
    adjust(own, id, -4).then((response) => response.status),
    inTransaction(db.connection, (s) => allocation.reserve(s, command, new Date())).then(
      () => 200,
      (error: unknown) => {
        if (!(error instanceof ApiError)) throw error
        return error.status
      },
    ),
  ])
  const row = await productModels(db.connection).variants.findById(id)
  expect(row?.stock.physical).toBeGreaterThanOrEqual(
    (row?.stock.reserved ?? 0) + (row?.stock.committed ?? 0),
  )
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  expect(results.sort()).toEqual([200, 409])
})

it('rejects aggregate overflow without returning rounded all-match totals', async () => {
  const own = await account()
  await variant(Number.MAX_SAFE_INTEGER, 0, 0)
  await variant(1, 0, 0)
  await list(own).expect(409)
})
it('keeps adjustment available without inventing missing global settings', async () => {
  const own = await account(),
    id = await variant()
  await db.connection.db?.collection('storeSettings').deleteMany({})
  await list(own).expect(503)
  await adjust(own, id).expect(200)
})
it('wires inventory APIs through actual root admin composition with real auth configuration', async () => {
  await createRegistrationNotifications(db.connection).initialize()
  const config = loadEnvironment(identityEnvironment())
  if (!config.identity) throw new Error('Missing synthetic identity options')
  const own = await account(),
    id = await variant()
  const runtimeSessions = createSessionService(db.connection, models, config.identity.sessions)
  const issued = await runtimeSessions.issue('admin', own.user._id)
  const runtime = createApp({ apiRouter: await composeIdentityRoutes(db.connection, config) })
  await request(runtime)
    .post(`${base}/${id}/adjustments`)
    .set('Cookie', `sz_admin_sid=${issued.token}`)
    .set('Origin', config.ADMIN_ORIGIN)
    .set('X-CSRF-Token', issued.csrfToken)
    .set('Idempotency-Key', 'runtime')
    .send({ deltaPhysical: 1, reason: 'Synthetic runtime' })
    .expect(200)
  const disabled = createApp({
    apiRouter: await composeIdentityRoutes(db.connection, { ...config, ADMIN_AUTH_ENABLED: false }),
  })
  await request(disabled).get(base).expect(404)
})

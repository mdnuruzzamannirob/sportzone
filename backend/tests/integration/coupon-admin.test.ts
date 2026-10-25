import { ApiError } from '../../src/shared/errors/app-error.js'
import { spawnSync } from 'node:child_process'
import { testEnvironment, identityEnvironment } from '../helpers/environment.js'
import { loadEnvironment } from '../../src/config/env.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { createApp } from '../../src/app.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { initializeCouponPersistence } from '../../src/modules/promotions/coupon.persistence.js'
import { couponModels } from '../../src/modules/promotions/coupon.model.js'
import { couponAdminService } from '../../src/modules/promotions/coupon-admin.service.js'
import { couponAdminRoutes } from '../../src/modules/promotions/coupon-admin.routes.js'
import {
  initializeAuditPersistence,
  auditValidator,
} from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { couponAllocationService } from '../../src/modules/promotions/coupon-allocation.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let service: ReturnType<typeof couponAdminService>
let app: ReturnType<typeof createApp>
let security: ReturnType<typeof createBrowserSecurity>
const origin = 'http://localhost:5173'
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
const base = '/api/v1/admin/coupons'
function input() {
  return {
    code: `save-${randomUUID()}`,
    type: 'fixed',
    value: 100,
    minEligibleSubtotalPoisha: 0,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    status: 'active',
    overallLimit: 10,
  }
}
function post(who: Principal, data: object, suffix = '', match?: string) {
  const req = request(app)
    .post(base + suffix)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) req.set('If-Match', match)
  return req.send(data)
}
function patch(who: Principal, id: string, data: object, match?: string) {
  const req = request(app)
    .patch(`${base}/${id}`)
    .set('Cookie', who.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', who.issued.csrfToken)
  if (match !== undefined) req.set('If-Match', match)
  return req.send(data)
}
const list = (who: Principal, query = '') =>
  request(app)
    .get(base + query)
    .set('Cookie', who.cookie)
const history = (who: Principal, id: string, query = '') =>
  request(app).get(`${base}/${id}/redemptions${query}`).set('Cookie', who.cookie)
async function create(who: Principal, fields = {}) {
  return (await post(who, { ...input(), ...fields }).expect(201)).body.data
}
beforeAll(async () => {
  db = await isolatedDatabase()
  models = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, models)
  await initializeCouponPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
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
  service = couponAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    createAuditWriter(db.connection),
  )
  app = createApp({ apiRouter: couponAdminRoutes(service, security, sessions) })
})
beforeEach(async () => {
  const c = couponModels(db.connection)
  await c.redemptions.deleteMany({})
  await c.customers.deleteMany({})
  await c.coupons.deleteMany({})
  await db.connection.db?.collection('auditLogs').deleteMany({})
})
afterAll(async () => {
  await db?.close()
})
it('creates normalized allowlisted configuration, ETag and one durable audit fact', async () => {
  const own = await account(),
    body = { ...input(), code: '  save  ' }
  const res = await post(own, body).expect(201)
  expect(res.body.data).toMatchObject({
    code: 'SAVE',
    heldCount: 0,
    redeemedCount: 0,
    revision: 0,
    termsVersion: 0,
  })
  expect(res.headers.etag).toBe('"0"')
  expect(res.headers['access-control-expose-headers']).toContain('ETag')
  expect(res.headers['cache-control']).toBe('no-store')
  const event = await db.connection.db?.collection('auditLogs').findOne({})
  expect(event).toMatchObject({
    actorType: 'admin',
    actorId: own.user._id,
    action: 'coupon.create',
    targetType: 'coupon',
  })
  expect(event?.afterDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(event)).not.toContain('SAVE')
})
it('updates with CAS, clears optional limits/scope and deactivates without deletion', async () => {
  const own = await account(),
    c = await create(own, { eligibleProductIds: [new Types.ObjectId().toHexString()] })
  const a = await patch(
    own,
    c.id,
    { value: 200, overallLimit: null, eligibleProductIds: null },
    '"0"',
  ).expect(200)
  expect(a.body.data).toMatchObject({ value: 200, revision: 1, termsVersion: 1 })
  expect(a.body.data.overallLimit).toBeUndefined()
  expect(a.body.data.eligibleProductIds).toBeUndefined()
  const b = await post(
    own,
    { reason: 'Synthetic operator decision' },
    `/${c.id}/deactivate`,
    '"1"',
  ).expect(200)
  expect(b.body.data).toMatchObject({ status: 'inactive', revision: 2 })
  expect(await couponModels(db.connection).coupons.countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(3)
})
it.each([undefined, '0', 'W/"0"', '*', '"01"', '"9007199254740992"', '"1"'])(
  'rejects missing, malformed or stale revision %s',
  async (match) => {
    const own = await account(),
      c = await create(own)
    await patch(own, c.id, { value: 200 }, match).expect(match === undefined ? 428 : 412)
    expect((await couponModels(db.connection).coupons.findById(c.id))?.value).toBe(100)
  },
)
it('rejects merged invalid policy and protected counter fields', async () => {
  const own = await account(),
    c = await create(own)
  await patch(own, c.id, { startsAt: new Date(Date.now() + 7200000).toISOString() }, '"0"').expect(
    400,
  )
  await patch(own, c.id, { type: 'percentage', value: 10001 }, '"0"').expect(400)
  await patch(own, c.id, { heldCount: 1 }, '"0"').expect(400)
  await patch(own, c.id, {}, '"0"').expect(400)
  await post(own, { ...input(), redeemedCount: 0 }).expect(400)
  await post(own, {
    ...input(),
    eligibleCategoryIds: Array(201).fill(new Types.ObjectId().toHexString()),
  }).expect(400)
})
it('enforces normalized unique codes under concurrent creation', async () => {
  const own = await account(),
    other = await account(),
    body = input()
  const res = await Promise.all([
    post(own, body),
    post(other, { ...body, code: body.code.toUpperCase() }),
  ])
  expect(res.map((r) => r.status).sort()).toEqual([201, 409])
  expect(await couponModels(db.connection).coupons.countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('allows exactly one concurrent stale-edit winner across administrators', async () => {
  const own = await account(),
    other = await account(),
    c = await create(own)
  const res = await Promise.all([
    patch(own, c.id, { value: 200 }, '"0"'),
    patch(other, c.id, { value: 300 }, '"0"'),
  ])
  expect(res.map((r) => r.status).sort()).toEqual([200, 412])
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(2)
})
it('denies missing/customer/suspended/revoked identities and wrong browser proof', async () => {
  const own = await account(),
    customer = await account('customer')
  await request(app).get(base).expect(401)
  await list(customer).expect(401)
  await request(app).post(base).set('Cookie', own.cookie).send(input()).expect(403)
  await request(app)
    .post(base)
    .set('Cookie', own.cookie)
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', own.issued.csrfToken)
    .send(input())
    .expect(403)
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(service.create(own.token, input())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'active' } })
  await sessions.logout('admin', own.token)
  await list(own).expect(401)
})
it('provides bounded stable filtered lists and private history without writes', async () => {
  const own = await account()
  const first = await create(own),
    second = await create(own, { status: 'inactive' })
  const before = await models.users.findById(own.user._id).lean()
  const a = await list(own, '?pageSize=1').expect(200)
  const b = await list(own, '?pageSize=1&page=2').expect(200)
  expect(a.body.meta).toMatchObject({ totalItems: 2, totalPages: 2, pageSize: 1 })
  expect(a.body.data[0].id).not.toBe(b.body.data[0].id)
  expect((await list(own, '?status=inactive').expect(200)).body.data[0].id).toBe(second.id)
  expect((await history(own, first.id).expect(200)).body.meta.totalItems).toBe(0)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
  await list(own, '?pageSize=101').expect(400)
  await list(own, '?unknown=1').expect(400)
  await history(own, new Types.ObjectId().toHexString()).expect(404)
})
it('rolls back coupon creation and edit when durable audit persistence fails', async () => {
  const own = await account(),
    c = await create(own)
  const before = await models.users.findById(own.user._id).lean()
  const failed = couponAdminService(
    db.connection,
    createAdminAccountAccess(db.connection, models, sessions),
    async () => {
      throw new Error('Synthetic audit failure')
    },
  )
  await expect(failed.create(own.token, input())).rejects.toThrow('Synthetic')
  await expect(failed.update(own.token, c.id, { value: 500 }, '"0"')).rejects.toThrow('Synthetic')
  expect(await couponModels(db.connection).coupons.countDocuments()).toBe(1)
  expect((await couponModels(db.connection).coupons.findById(c.id))?.value).toBe(100)
  expect((await models.users.findById(own.user._id).lean())?.updatedAt).toEqual(before?.updatedAt)
})
it('fails closed on missing coupon indexes and incompatible audit validator', async () => {
  const own = await account()
  await couponModels(db.connection).coupons.collection.dropIndex('coupon_code_unique')
  try {
    await list(own).expect(503)
  } finally {
    await couponModels(db.connection).coupons.createIndexes()
  }
  await db.connection.db?.command({ collMod: 'auditLogs', validator: {} })
  try {
    await post(own, input()).expect(503)
    await expect(initializeAuditPersistence(db.connection)).rejects.toThrow(/reviewed/)
    expect(await couponModels(db.connection).coupons.countDocuments()).toBe(0)
  } finally {
    await db.connection.db?.command({ collMod: 'auditLogs', validator: auditValidator })
  }
})

// Explicit test-only owning order capability; production checkout/order wiring is a later task.
async function allocation(couponId: string, userId: string) {
  const orderId = new Types.ObjectId().toHexString()
  const pricing = {
    items: [
      {
        id: new Types.ObjectId().toHexString(),
        variantId: new Types.ObjectId().toHexString(),
        quantity: 1,
        couponEligible: true,
        regularUnitPoisha: 1000,
        effectiveUnitPoisha: 1000,
      },
    ],
    deliveryChargePoisha: 0,
  }
  const c = await couponModels(db.connection).coupons.findById(couponId)
  if (!c) throw new Error('Missing synthetic coupon')
  const terms = {
    code: c.codeNormalized,
    type: c.type,
    value: c.value,
    version: c.termsVersion,
    discountPoisha: 100,
    eligibleLineIds: pricing.items.map((line) => line.id),
  }
  await db.connection.db
    ?.collection('orders')
    .insertOne({ _id: new Types.ObjectId(orderId), fixtureFence: 0 })
  const service = couponAllocationService(db.connection, {
    authorize: async (session, id) => {
      const row = await db.connection.db
        ?.collection('orders')
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id) },
          { $inc: { fixtureFence: 1 } },
          { session },
        )
      if (!row) throw new Error('Missing fixture order')
      return {
        orderId,
        couponId,
        userId,
        acceptedPricing: pricing,
        currentPricing: pricing,
        termsSnapshot: terms,
      }
    },
  })
  const command = { couponId, orderId, generation: 1, operationKey: randomUUID() }
  return { service, command, terms }
}
it('preserves live hold terms and exact counts through edit/deactivation, commit and replay', async () => {
  const own = await account(),
    c = await create(own),
    user = new Types.ObjectId().toHexString()
  const a = await allocation(c.id, user)
  const held = await inTransaction(db.connection, (s) =>
    a.service.reserve(s, a.command, new Date()),
  )
  const current = await couponModels(db.connection).coupons.findById(c.id)
  await patch(own, c.id, { value: 300 }, `"${current?.revision}"`).expect(200)
  const edited = await couponModels(db.connection).coupons.findById(c.id)
  await post(own, { reason: 'Synthetic' }, `/${c.id}/deactivate`, `"${edited?.revision}"`).expect(
    200,
  )
  const before = await history(own, c.id).expect(200)
  expect(before.body.data[0]).toMatchObject({
    id: held.id,
    status: 'held',
    termsSnapshot: { value: 100, discountPoisha: 100 },
  })
  expect(JSON.stringify(before.body)).not.toMatch(/lastOperationKey|fixtureFence|activeKey/)
  await inTransaction(db.connection, (s) =>
    a.service.commit(s, { ...a.command, operationKey: 'commit' }),
  )
  await inTransaction(db.connection, (s) =>
    a.service.commit(s, { ...a.command, operationKey: 'commit' }),
  )
  expect((await history(own, c.id).expect(200)).body.data[0].status).toBe('redeemed')
  expect((await list(own).expect(200)).body.data[0]).toMatchObject({
    heldCount: 0,
    redeemedCount: 1,
    value: 300,
    status: 'inactive',
  })
})
it('rejects quota reduction below real usage and serializes capacity edits with allocation', async () => {
  const own = await account(),
    c = await create(own),
    user = new Types.ObjectId().toHexString()
  const a = await allocation(c.id, user),
    b = await allocation(c.id, user)
  await inTransaction(db.connection, (s) => a.service.reserve(s, a.command, new Date()))
  await inTransaction(db.connection, (s) => b.service.reserve(s, b.command, new Date()))
  const current = await couponModels(db.connection).coupons.findById(c.id)
  await patch(own, c.id, { overallLimit: 1 }, `"${current?.revision}"`).expect(422)
  await patch(own, c.id, { perCustomerLimit: 1 }, `"${current?.revision}"`).expect(422)
  const otherUser = new Types.ObjectId().toHexString(),
    third = await allocation(c.id, otherUser)
  const res = await Promise.all([
    patch(own, c.id, { overallLimit: 2 }, `"${current?.revision}"`).then(
      (response) => response.status,
    ),
    inTransaction(db.connection, (s) => third.service.reserve(s, third.command, new Date())).then(
      () => 200,
      (error: unknown) => {
        if (!(error instanceof ApiError)) throw error
        return error.code
      },
    ),
  ])
  const final = await couponModels(db.connection).coupons.findById(c.id)
  expect(final?.heldCount).toBeLessThanOrEqual(final?.overallLimit ?? 10)
  expect([
    [200, 'COUPON_UNAVAILABLE'],
    [412, 200],
  ]).toContainEqual(res)
})
it('keeps normalized no-op edits stable without emitting a fictitious terms change', async () => {
  const own = await account(),
    c = await create(own)
  const res = await patch(
    own,
    c.id,
    { code: ` ${c.code.toLowerCase()} `, value: 100 },
    '"0"',
  ).expect(200)
  expect(res.body.data).toMatchObject({ revision: 0, termsVersion: 0 })
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})

it('registers protected coupon APIs only when admin auth is enabled in actual composition', async () => {
  await createRegistrationNotifications(db.connection).initialize()
  const config = loadEnvironment(identityEnvironment())
  const router = await composeIdentityRoutes(db.connection, config)
  const runtime = createApp({ apiRouter: router })
  const own = await account()
  if (!config.identity) throw new Error('Missing fixture identity')
  const runtimeSessions = createSessionService(db.connection, models, config.identity.sessions)
  const issued = await runtimeSessions.issue('admin', own.user._id)
  const res = await request(runtime)
    .post(base)
    .set('Cookie', `sz_admin_sid=${issued.token}`)
    .set('Origin', config.ADMIN_ORIGIN)
    .set('X-CSRF-Token', issued.csrfToken)
    .send(input())
    .expect(201)
  expect(res.body.data.revision).toBe(0)
  const disabled = createApp({
    apiRouter: await composeIdentityRoutes(db.connection, { ...config, ADMIN_AUTH_ENABLED: false }),
  })
  await request(disabled).get(base).expect(404)
})
it('runs additive compiled local bootstrap without deleting records and refuses production', async () => {
  const own = await account()
  await create(own)
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const run = spawnSync(process.execPath, ['scripts/bootstrap-promotions.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(run.status, run.stderr).toBe(0)
  }
  expect(await couponModels(db.connection).coupons.countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-promotions.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(refused.status).toBe(1)
  expect(refused.stderr).not.toContain(env.MONGODB_URI)
})
it('provides append-only audit capability with strict validation and duplicate-cause rejection', async () => {
  const writer = createAuditWriter(db.connection)
  const event = {
    actorType: 'admin',
    actorId: new Types.ObjectId().toHexString(),
    action: 'coupon.update',
    targetType: 'coupon',
    targetId: new Types.ObjectId().toHexString(),
    operationKey: 'synthetic',
    occurredAt: new Date(),
  }
  await inTransaction(db.connection, (s) => writer(s, event))
  await expect(inTransaction(db.connection, (s) => writer(s, event))).rejects.toMatchObject({
    code: 11000,
  })
  await expect(
    inTransaction(db.connection, (s) => writer(s, { ...event, token: 'forbidden' })),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await expect(
    db.connection.db?.collection('auditLogs').insertOne({
      ...event,
      actorId: new Types.ObjectId(),
      targetId: new Types.ObjectId(),
      unknown: true,
    }),
  ).rejects.toMatchObject({ code: 121 })
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})

it('paginates real held/released histories without leaking another coupon or private operation keys', async () => {
  const own = await account(),
    c = await create(own),
    other = await create(own)
  const first = await allocation(c.id, new Types.ObjectId().toHexString())
  const second = await allocation(c.id, new Types.ObjectId().toHexString())
  await inTransaction(db.connection, (s) => first.service.reserve(s, first.command, new Date()))
  await inTransaction(db.connection, (s) => second.service.reserve(s, second.command, new Date()))
  await inTransaction(db.connection, (s) =>
    first.service.release(s, { ...first.command, operationKey: 'release' }, 'held'),
  )
  const a = await history(own, c.id, '?pageSize=1').expect(200)
  const b = await history(own, c.id, '?pageSize=1&page=2').expect(200)
  expect(a.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 })
  expect(a.body.data[0].id).not.toBe(b.body.data[0].id)
  expect([a.body.data[0].status, b.body.data[0].status].sort()).toEqual(['held', 'released'])
  expect((await history(own, other.id).expect(200)).body.data).toEqual([])
  await history(own, c.id, '?pageSize=101').expect(400)
  await history(own, c.id, '?operationKey=foreign').expect(400)
})

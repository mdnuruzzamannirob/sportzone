import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { deliveryModels } from '../../src/modules/delivery/delivery.model.js'
import { initializeDeliveryPersistence } from '../../src/modules/delivery/delivery.persistence.js'
import { deliveryRoutes } from '../../src/modules/delivery/delivery.routes.js'
import { deliveryService } from '../../src/modules/delivery/delivery.service.js'
import { createAddressCoverage } from '../../src/modules/delivery/delivery-coverage.service.js'
import { deliverySettingsGuard } from '../../src/modules/settings/delivery-settings.service.js'
import { settingsModel } from '../../src/modules/settings/settings.model.js'
import { initializeSettingsPersistence } from '../../src/modules/settings/settings.persistence.js'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
let identities: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let service: ReturnType<typeof deliveryService>
let app: ReturnType<typeof createApp>
let now: Date
const base = '/api/v1/admin/delivery',
  origin = 'http://localhost:5173'
async function account(role: 'admin' | 'customer' = 'admin') {
  const user = await identities.users.create({
    name: 'Synthetic',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
  })
  const issued = await sessions.issue(role, user._id)
  return { token: issued.token, cookie: `sz_${role}_sid=${issued.token}`, csrf: issued.csrfToken }
}
type Actor = Awaited<ReturnType<typeof account>>
function write(
  actor: Actor,
  path: string,
  body: object,
  revision = '"0"',
  key = randomUUID(),
  method: 'post' | 'patch' = 'post',
) {
  return request(app)
    [method](base + path)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrf)
    .set('If-Match', revision)
    .set('Idempotency-Key', key)
    .send(body)
}
const read = (actor: Actor, path: string) =>
  request(app)
    .get(base + path)
    .set('Cookie', actor.cookie)
async function zone(actor: Actor, name = randomUUID()) {
  return (await write(actor, '/zones', { name, status: 'active' }).expect(201)).body.data
}
async function charge(actor: Actor, zoneId: string, extra: object = {}) {
  return (
    await write(actor, '/charges', {
      zoneId,
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 7500,
      effectiveFrom: now.toISOString(),
      ...extra,
    }).expect(201)
  ).body.data
}
async function supports(district = 'dhaka', area = 'synthetic') {
  return db.connection.transaction((session) =>
    createAddressCoverage(db.connection, () => now).supports(district, area, session),
  )
}
beforeAll(async () => {
  db = await isolatedDatabase()
  identities = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, identities)
  await initializeAuditPersistence(db.connection)
  await initializeSettingsPersistence(db.connection, 5)
  await initializeDeliveryPersistence(db.connection)
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
  const { zones, charges } = deliveryModels(db.connection)
  await charges.deleteMany({})
  await zones.deleteMany({})
  await settingsModel(db.connection).deleteMany({})
  await initializeSettingsPersistence(db.connection, 5)
  await db.connection.db?.collection('auditLogs').deleteMany({})
  now = new Date()
  service = deliveryService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    deliverySettingsGuard(db.connection),
    createAuditWriter(db.connection),
    () => now,
  )
  app = createApp({ apiRouter: Router().use(deliveryRoutes(service, security, sessions)) })
})
afterAll(async () => {
  await db?.close()
})
it('protects delivery APIs with admin session, Origin, CSRF and strict DTOs', async () => {
  const actor = await account(),
    customer = await account('customer')
  await request(app).get(`${base}/zones`).expect(401)
  await read(customer, '/zones').expect(401)
  await request(app)
    .post(`${base}/zones`)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .send({ name: 'Synthetic', status: 'active' })
    .expect(403)
  await request(app)
    .post(`${base}/zones`)
    .set('Cookie', actor.cookie)
    .set('Origin', 'https://foreign.invalid')
    .set('X-CSRF-Token', actor.csrf)
    .send({ name: 'Synthetic', status: 'active' })
    .expect(403)
  await write(actor, '/zones', { name: 'Synthetic', status: 'active', coverageRevision: 0 }).expect(
    400,
  )
  const created = await zone(actor)
  await write(actor, '/charges', {
    zoneId: created.id,
    coverageKey: 'dhaka:synthetic',
    amountPoisha: -1,
    effectiveFrom: now.toISOString(),
  }).expect(400)
  await read(actor, '/charges?status=deleted').expect(400)
})
it('keeps zone CAS separate from the canonical settings edit ETag and coverage guard', async () => {
  const actor = await account(),
    created = await zone(actor)
  expect(created.revision).toBe(0)
  const edited = await write(
    actor,
    `/zones/${created.id}`,
    { name: 'Edited synthetic' },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(200)
  expect(edited.headers.etag).toBe('"1"')
  await write(
    actor,
    `/zones/${created.id}`,
    { status: 'inactive' },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(412)
  await write(
    actor,
    `/zones/${created.id}`,
    { status: 'inactive' },
    '"1"',
    randomUUID(),
    'patch',
  ).expect(200)
  const primary = await settingsModel(db.connection).findOne({ key: 'primary' }).orFail()
  expect(primary.revision).toBe(0)
  expect(primary.deliveryCoverageRevision).toBe(2)
})
it('allows one cross-zone writer for overlapping windows and allocates versions globally', async () => {
  const actor = await account(),
    other = await account(),
    a = await zone(actor),
    b = await zone(other)
  const from = new Date(now.getTime() + 10000).toISOString()
  const results = await Promise.all([
    write(actor, '/charges', {
      zoneId: a.id,
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 100,
      effectiveFrom: from,
    }),
    write(other, '/charges', {
      zoneId: b.id,
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 200,
      effectiveFrom: from,
    }),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([201, 409])
  expect(await deliveryModels(db.connection).charges.countDocuments()).toBe(1)
  const row = await deliveryModels(db.connection).charges.findOne().orFail()
  expect(row.ruleVersion).toBe(1)
})
it('schedules adjacent windows and atomically expires the predecessor before activating its successor', async () => {
  const actor = await account(),
    a = await zone(actor),
    b = await zone(actor),
    boundary = new Date(now.getTime() + 10000)
  const first = await charge(actor, a.id, { effectiveTo: boundary.toISOString() })
  const next = await charge(actor, b.id, {
    effectiveFrom: boundary.toISOString(),
    amountPoisha: 9000,
  })
  expect(first.status).toBe('active')
  expect(next.status).toBe('scheduled')
  expect(next.ruleVersion).toBe(2)
  expect(await supports()).toBe(true)
  now = boundary
  await Promise.all([service.runDue(), service.runDue()])
  const rows = await deliveryModels(db.connection).charges.find().sort({ ruleVersion: 1 })
  expect(rows.map((row) => row.status)).toEqual(['inactive', 'active'])
  expect(rows[0]?.amountPoisha).toBe(7500)
  expect(rows[1]?.amountPoisha).toBe(9000)
  expect(await supports()).toBe(true)
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'delivery.charge.activate' }),
  ).toBe(1)
})
it('supersedes across zones with immutable original price and durable response replay', async () => {
  const actor = await account(),
    a = await zone(actor),
    b = await zone(actor),
    first = await charge(actor, a.id)
  const boundary = new Date(now.getTime() + 10000).toISOString(),
    key = randomUUID()
  const body = {
    effectiveAt: boundary,
    reason: 'Synthetic replacement',
    replacement: {
      zoneId: b.id,
      coverageKey: first.coverageKey,
      amountPoisha: 9000,
      effectiveFrom: boundary,
    },
  }
  const original = await write(actor, `/charges/${first.id}/supersede`, body, '"0"', key).expect(
    200,
  )
  expect(original.body.data.previous.status).toBe('active')
  expect(original.body.data.replacement.status).toBe('scheduled')
  now = new Date(boundary)
  await service.runDue()
  const replay = await write(actor, `/charges/${first.id}/supersede`, body, '"0"', key).expect(200)
  expect(replay.body.data).toEqual(original.body.data)
  await write(
    actor,
    `/charges/${first.id}/supersede`,
    { ...body, reason: 'Changed' },
    '"0"',
    key,
  ).expect(409)
  const old = await deliveryModels(db.connection).charges.findById(first.id).orFail()
  expect(old.amountPoisha).toBe(7500)
  expect(old.ruleVersion).toBe(1)
  expect(old.coverageKey).toBe(first.coverageKey)
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'delivery.charge.supersede' }),
  ).toBe(1)
})
it('supports immediate deactivation, rejects retroactive edits and keeps future coverage unavailable', async () => {
  const actor = await account(),
    a = await zone(actor),
    first = await charge(actor, a.id)
  now = new Date(now.getTime() + 1000)
  await write(actor, `/charges/${first.id}/deactivate`, {
    effectiveAt: new Date(now.getTime() - 1).toISOString(),
    reason: 'Retroactive',
  }).expect(422)
  await write(actor, `/charges/${first.id}/deactivate`, {
    effectiveAt: now.toISOString(),
    reason: 'Synthetic end',
  }).expect(200)
  expect(await supports()).toBe(false)
  const replacement = await charge(actor, a.id, {
    effectiveFrom: new Date(now.getTime() + 10000).toISOString(),
  })
  expect(replacement.ruleVersion).toBe(2)
  expect(await supports()).toBe(false)
})
it('resolves exact coverage before wildcard and fails closed for an inactive exact zone', async () => {
  const actor = await account(),
    exact = await zone(actor),
    wildcard = await zone(actor)
  await charge(actor, wildcard.id, { coverageKey: 'dhaka:*', amountPoisha: 0 })
  await charge(actor, exact.id)
  expect(await supports()).toBe(true)
  expect(await supports('dhaka', 'other')).toBe(true)
  const current = await deliveryModels(db.connection).zones.findById(exact.id).orFail()
  await write(
    actor,
    `/zones/${exact.id}`,
    { status: 'inactive' },
    `"${current.revision}"`,
    randomUUID(),
    'patch',
  ).expect(200)
  expect(await supports()).toBe(false)
  expect(await supports('dhaka', 'other')).toBe(true)
})
it('requires CAS and replay keys and rejects changes to commercial identity', async () => {
  const actor = await account(),
    a = await zone(actor),
    future = await charge(actor, a.id, {
      effectiveFrom: new Date(now.getTime() + 10000).toISOString(),
    })
  await write(actor, `/charges/${future.id}/activate`, { reason: 'Too early' }).expect(409)
  await write(actor, `/zones/${a.id}`, { name: 'Stale' }, 'W/"0"', randomUUID(), 'patch').expect(
    412,
  )
  await request(app)
    .patch(`${base}/zones/${a.id}`)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrf)
    .send({ name: 'Missing precondition' })
    .expect(428)
  now = new Date(future.effectiveFrom)
  await request(app)
    .post(`${base}/charges/${future.id}/activate`)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrf)
    .set('If-Match', '"0"')
    .send({ reason: 'Missing key' })
    .expect(400)
  await write(actor, `/charges/${future.id}/activate`, {
    reason: 'Synthetic',
    amountPoisha: 1,
  }).expect(400)
  const key = randomUUID(),
    body = { reason: 'Synthetic activation' }
  const first = await write(actor, `/charges/${future.id}/activate`, body, '"0"', key).expect(200)
  const second = await write(actor, `/charges/${future.id}/activate`, body, '"0"', key).expect(200)
  expect(second.body.data).toEqual(first.body.data)
})
it('rolls back the global guard, zone fences, window and successor if audit fails', async () => {
  const actor = await account(),
    a = await zone(actor),
    first = await charge(actor, a.id),
    before = await settingsModel(db.connection).findOne({ key: 'primary' }).orFail()
  const failed = deliveryService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    deliverySettingsGuard(db.connection),
    async () => {
      throw new Error('Synthetic audit failure')
    },
    () => now,
  )
  const boundary = new Date(now.getTime() + 1000).toISOString()
  await expect(
    failed.transition(
      actor.token,
      first.id,
      'supersede',
      {
        effectiveAt: boundary,
        reason: 'Synthetic',
        replacement: {
          zoneId: a.id,
          coverageKey: first.coverageKey,
          amountPoisha: 8000,
          effectiveFrom: boundary,
        },
      },
      '"0"',
      randomUUID(),
    ),
  ).rejects.toThrow('Synthetic audit failure')
  expect(
    (await settingsModel(db.connection).findOne({ key: 'primary' }))?.deliveryCoverageRevision,
  ).toBe(before.deliveryCoverageRevision)
  expect(await deliveryModels(db.connection).charges.countDocuments()).toBe(1)
  expect(
    (await deliveryModels(db.connection).charges.findById(first.id))?.effectiveTo,
  ).toBeUndefined()
})
it('fails closed for a missing/overflowed singleton and rolls back failed scheduling', async () => {
  const actor = await account(),
    a = await zone(actor)
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $set: { deliveryCoverageRevision: Number.MAX_SAFE_INTEGER } },
  )
  await write(actor, '/charges', {
    zoneId: a.id,
    coverageKey: 'dhaka:synthetic',
    amountPoisha: 1,
    effectiveFrom: now.toISOString(),
  }).expect(409)
  await settingsModel(db.connection).deleteMany({})
  await write(actor, '/zones', { name: 'Missing singleton', status: 'active' }).expect(503)
  expect(await deliveryModels(db.connection).charges.countDocuments()).toBe(0)
})
it('prevents a disabled-zone schedule from starving another due zone', async () => {
  const actor = await account(),
    disabled = await zone(actor),
    enabled = await zone(actor),
    from = new Date(now.getTime() + 1000).toISOString()
  await charge(actor, disabled.id, { effectiveFrom: from })
  const other = await charge(actor, enabled.id, { coverageKey: 'dhaka:other', effectiveFrom: from })
  const row = await deliveryModels(db.connection).zones.findById(disabled.id).orFail()
  await write(
    actor,
    `/zones/${disabled.id}`,
    { status: 'inactive' },
    `"${row.revision}"`,
    randomUUID(),
    'patch',
  ).expect(200)
  now = new Date(from)
  await service.runDue()
  expect((await deliveryModels(db.connection).charges.findById(other.id))?.status).toBe('active')
})
it('permits only one same-revision supersession and preserves global non-overlap under concurrent writers', async () => {
  const actor = await account(),
    other = await account(),
    a = await zone(actor),
    b = await zone(other),
    initial = await charge(actor, a.id)
  const at = new Date(now.getTime() + 10000).toISOString()
  const body = (amountPoisha: number) => ({
    effectiveAt: at,
    reason: 'Synthetic concurrent replacement',
    replacement: {
      zoneId: b.id,
      coverageKey: initial.coverageKey,
      amountPoisha,
      effectiveFrom: at,
    },
  })
  const results = await Promise.all([
    write(actor, `/charges/${initial.id}/supersede`, body(100)),
    write(other, `/charges/${initial.id}/supersede`, body(200)),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  expect(await deliveryModels(db.connection).charges.countDocuments()).toBe(2)
  expect(await deliveryModels(db.connection).charges.countDocuments({ status: 'scheduled' })).toBe(
    1,
  )
})
it('serializes activation against deactivation of the same due schedule', async () => {
  const actor = await account(),
    other = await account(),
    a = await zone(actor),
    initial = await charge(actor, a.id, {
      effectiveFrom: new Date(now.getTime() + 10000).toISOString(),
    })
  now = new Date(now.getTime() + 11000)
  const results = await Promise.all([
    write(actor, `/charges/${initial.id}/activate`, { reason: 'Synthetic activate' }),
    write(other, `/charges/${initial.id}/deactivate`, {
      reason: 'Synthetic end',
      effectiveAt: now.toISOString(),
    }),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 412])
  expect(
    await deliveryModels(db.connection).charges.countDocuments({ status: 'active' }),
  ).toBeLessThanOrEqual(1)
})
it('rolls back supersession when the replacement overlaps a separately approved future window', async () => {
  const actor = await account(),
    a = await zone(actor),
    b = await zone(actor),
    boundary = new Date(now.getTime() + 20000).toISOString()
  const first = await charge(actor, a.id, { effectiveTo: boundary })
  await charge(actor, b.id, { effectiveFrom: boundary })
  const at = new Date(now.getTime() + 10000).toISOString(),
    before = await settingsModel(db.connection).findOne({ key: 'primary' }).orFail()
  await write(actor, `/charges/${first.id}/supersede`, {
    effectiveAt: at,
    reason: 'Synthetic overlap',
    replacement: {
      zoneId: a.id,
      coverageKey: first.coverageKey,
      amountPoisha: 100,
      effectiveFrom: at,
    },
  }).expect(409)
  const old = await deliveryModels(db.connection).charges.findById(first.id).orFail()
  expect(old.effectiveTo?.toISOString()).toBe(boundary)
  expect(old.revision).toBe(0)
  expect(
    (await settingsModel(db.connection).findOne({ key: 'primary' }))?.deliveryCoverageRevision,
  ).toBe(before.deliveryCoverageRevision)
  expect(await deliveryModels(db.connection).charges.countDocuments()).toBe(2)
})
it('rolls back scheduled activation and expiry when worker audit fails', async () => {
  const actor = await account(),
    a = await zone(actor),
    boundary = new Date(now.getTime() + 10000).toISOString()
  const first = await charge(actor, a.id, { effectiveTo: boundary }),
    second = await charge(actor, a.id, { effectiveFrom: boundary })
  now = new Date(boundary)
  const failed = deliveryService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    deliverySettingsGuard(db.connection),
    async () => {
      throw new Error('Synthetic worker audit failure')
    },
    () => now,
  )
  await expect(failed.runDue()).rejects.toThrow('Synthetic worker audit failure')
  expect((await deliveryModels(db.connection).charges.findById(first.id))?.status).toBe('active')
  expect((await deliveryModels(db.connection).charges.findById(second.id))?.status).toBe(
    'scheduled',
  )
  expect(await supports()).toBe(false)
})
it('preserves scheduled end boundaries and replays deactivation across later worker expiry', async () => {
  const actor = await account(),
    other = await account(),
    a = await zone(actor),
    first = await charge(actor, a.id),
    at = new Date(now.getTime() + 10000).toISOString(),
    key = randomUUID(),
    body = { effectiveAt: at, reason: 'Synthetic future closure' }
  const original = await write(actor, `/charges/${first.id}/deactivate`, body, '"0"', key).expect(
    200,
  )
  expect(original.body.data.status).toBe('active')
  expect(await supports()).toBe(true)
  now = new Date(at)
  await service.runDue()
  const replay = await write(actor, `/charges/${first.id}/deactivate`, body, '"0"', key).expect(200)
  expect(replay.body.data).toEqual(original.body.data)
  await write(other, `/charges/${first.id}/deactivate`, body, '"0"', key).expect(409)
  expect(await supports()).toBe(false)
})
it('runs compiled additive bootstrap and due worker, and refuses production bootstrap', async () => {
  now = new Date(Date.now() - 60000)
  const actor = await account(),
    a = await zone(actor),
    scheduled = await charge(actor, a.id, {
      effectiveFrom: new Date(Date.now() - 30000).toISOString(),
    })
  expect(scheduled.status).toBe('scheduled')
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-delivery.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  for (const expected of [1, 0]) {
    const result = spawnSync(process.execPath, ['scripts/activate-delivery.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).processed).toBe(expected)
  }
  expect((await deliveryModels(db.connection).charges.findById(scheduled.id))?.status).toBe(
    'active',
  )
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-delivery.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(refused.status).toBe(1)
  expect(refused.stderr).not.toContain(env.MONGODB_URI)
})
it('serializes valid different-zone concurrent inserts rather than relying on duplicate version rejection', async () => {
  const actor = await account(),
    other = await account(),
    a = await zone(actor),
    b = await zone(other)
  const boundary = new Date(now.getTime() + 10000).toISOString()
  const results = await Promise.all([
    write(actor, '/charges', {
      zoneId: a.id,
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 100,
      effectiveFrom: now.toISOString(),
      effectiveTo: boundary,
    }),
    write(other, '/charges', {
      zoneId: b.id,
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 200,
      effectiveFrom: boundary,
    }),
  ])
  expect(results.map((r) => r.status)).toEqual([201, 201])
  expect(results.map((r) => r.body.data.ruleVersion).sort()).toEqual([1, 2])
  const primary = await settingsModel(db.connection).findOne({ key: 'primary' }).orFail()
  expect(primary.deliveryCoverageRevision).toBe(4)
  expect(primary.revision).toBe(0)
})
it('enforces canonical active-key and historical-version uniqueness in the real database', async () => {
  const actor = await account(),
    a = await zone(actor),
    first = await charge(actor, a.id)
  const { charges } = deliveryModels(db.connection)
  const body = {
    zoneId: a.id,
    coverageKey: first.coverageKey,
    amountPoisha: 100,
    effectiveFrom: now,
    status: 'active' as const,
  }
  await expect(charges.create({ ...body, ruleVersion: 2 })).rejects.toMatchObject({ code: 11000 })
  await expect(
    charges.create({ ...body, status: 'inactive', ruleVersion: 1 }),
  ).rejects.toMatchObject({ code: 11000 })
  await charges.updateOne(
    { _id: first.id },
    {
      $set: {
        amountPoisha: 1,
        coverageKey: 'changed:identity',
        ruleVersion: 99,
        effectiveFrom: new Date(0),
      },
    },
  )
  const persisted = await charges.findById(first.id).orFail()
  expect(persisted.amountPoisha).toBe(7500)
  expect(persisted.coverageKey).toBe(first.coverageKey)
  expect(persisted.ruleVersion).toBe(1)
})

import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { catalogRoutes } from '../../src/modules/catalog/catalog.routes.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { publicMediaService } from '../../src/modules/media/public-media.service.js'
import { storefrontSettingsAccess } from '../../src/modules/settings/settings.service.js'
import { spawnSync } from 'node:child_process'
import { testEnvironment } from '../helpers/environment.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import type { PolicyApproval } from '../../src/config/settings.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createMediaAdminAccess } from '../../src/modules/auth/media-access.service.js'
import { initializeMediaPersistence } from '../../src/modules/media/media.persistence.js'
import { createMediaService } from '../../src/modules/media/media.service.js'
import { mediaModel } from '../../src/modules/media/media.model.js'
import { policyModel } from '../../src/modules/settings/policy.model.js'
import { policyService } from '../../src/modules/settings/policy.service.js'
import { settingsModel } from '../../src/modules/settings/settings.model.js'
import { initializeSettingsPersistence } from '../../src/modules/settings/settings.persistence.js'
import {
  settingsAdminRoutes,
  settingsPublicRoutes,
} from '../../src/modules/settings/settings.routes.js'
import { settingsService } from '../../src/modules/settings/settings.service.js'
import { stockSettingsReader } from '../../src/modules/settings/stock-settings.service.js'
import { isolatedDatabase } from '../helpers/database.js'
import { fakeMediaProvider, imageFile, mediaPolicy } from '../helpers/media.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let identities: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let settings: ReturnType<typeof settingsService>
let policies: ReturnType<typeof policyService>
let media: ReturnType<typeof createMediaService>
let app: ReturnType<typeof createApp>
let now: Date
const proofs: PolicyApproval[] = []
const base = '/api/v1/admin/settings',
  origin = 'http://localhost:5173'
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
    token: issued.token,
    cookie: `sz_${role}_sid=${issued.token}`,
    csrf: issued.csrfToken,
  }
}
type Actor = Awaited<ReturnType<typeof account>>
function write(
  actor: Actor,
  path: string,
  body: object,
  match = '"0"',
  key = randomUUID(),
  method: 'post' | 'patch' = 'post',
) {
  return request(app)
    [method](base + path)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrf)
    .set('If-Match', match)
    .set('Idempotency-Key', key)
    .send(body)
}
const read = (actor: Actor, path = '') =>
  request(app)
    .get(base + path)
    .set('Cookie', actor.cookie)
async function draft(actor: Actor, type = 'terms') {
  return (
    await write(actor, '/policies', {
      type,
      content: 'Synthetic plain policy for tests only.',
    }).expect(201)
  ).body.data
}
async function approve(
  actor: Actor,
  created: { policyId: string; version: string },
  effectiveAt = now.toISOString(),
) {
  const target = await policyModel(db.connection).findById(created.policyId).orFail()
  const evidenceRef = `synthetic:${randomUUID()}`
  proofs.push({
    evidenceRef,
    type: target.type,
    version: created.version,
    contentDigest: target.contentDigest,
    effectiveAt,
    approvedAt: new Date(now.getTime() - 1000).toISOString(),
    approvedBy: 'Synthetic test reviewer',
  })
  await write(actor, `/policies/${created.policyId}/approve`, {
    approvalEvidenceRef: evidenceRef,
    reason: 'Synthetic approval',
  }).expect(200)
  return { effectiveAt, reason: 'Synthetic publication' }
}
beforeAll(async () => {
  db = await isolatedDatabase()
  identities = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, identities)
  await initializeAuditPersistence(db.connection)
  await initializeSettingsPersistence(db.connection, 5)
  await initializeMediaPersistence(db.connection)
  await initializeProductPersistence(db.connection)
  await createDeclaredIndexes(categoryModel(db.connection))
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
  await settingsModel(db.connection).deleteMany({})
  await policyModel(db.connection).deleteMany({})
  await mediaModel(db.connection).deleteMany({})
  await db.connection.db?.collection('auditLogs').deleteMany({})
  await initializeSettingsPersistence(db.connection, 5)
  now = new Date()
  proofs.length = 0
  const access = createAdminAccountAccess(db.connection, identities, sessions)
  media = createMediaService(db.connection, {
    provider: fakeMediaProvider().adapter,
    scanner: async () => 'clean',
    policy: mediaPolicy,
    canDelete: async () => true,
    access: {
      admin: createMediaAdminAccess(identities, sessions),
      evidence: async () => {
        throw new Error('No private test access')
      },
    },
  })
  settings = settingsService(db.connection, access, createAuditWriter(db.connection), media)
  policies = policyService(
    db.connection,
    access,
    createAuditWriter(db.connection),
    proofs,
    () => now,
  )
  app = createApp({
    apiRouter: Router().use(
      settingsAdminRoutes(settings, policies, security, sessions),
      catalogRoutes(
        catalogService(db.connection, publicMediaService(db.connection), {
          settings: storefrontSettingsAccess(
            db.connection,
            publicMediaService(db.connection, {
              publicUrl: (id, format) => `https://public.example.test/${id}.${format}`,
            }),
          ),
          policies: policies.publicLinks,
        }),
        [origin],
      ),
      settingsPublicRoutes(settings, policies, [origin]),
    ),
  })
})
afterAll(async () => {
  await db?.close()
})
it('bootstraps one canonical singleton without enabling channels or overwriting existing configuration', async () => {
  const actor = await account()
  await Promise.all([
    initializeSettingsPersistence(db.connection, 2),
    initializeSettingsPersistence(db.connection, 8),
  ])
  const response = await read(actor).expect(200)
  expect(response.body.data).toMatchObject({
    key: 'primary',
    revision: 0,
    lowStockThreshold: 5,
    activePolicyVersions: {},
    paymentChannels: {
      bkashEnabled: false,
      nagadEnabled: false,
      rocketEnabled: false,
      codEnabled: false,
    },
  })
  expect(await settingsModel(db.connection).countDocuments()).toBe(1)
  expect(response.body.data).not.toHaveProperty('deliveryCoverageRevision')
})
it('rejects unauthenticated/customer/foreign-origin/CSRF mutations and protected fields', async () => {
  const actor = await account(),
    customer = await account('customer')
  await request(app).get(base).expect(401)
  await read(customer).expect(401)
  await request(app)
    .patch(base)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('If-Match', '"0"')
    .send({ storeName: 'Synthetic' })
    .expect(403)
  await request(app)
    .patch(base)
    .set('Cookie', actor.cookie)
    .set('Origin', 'https://foreign.invalid')
    .set('X-CSRF-Token', actor.csrf)
    .send({ storeName: 'Synthetic' })
    .expect(403)
  await write(
    actor,
    '',
    { activePolicyVersions: { terms: 'fake' } },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(400)
  await write(
    actor,
    '',
    { paymentChannels: { secret: 'fake' } },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(400)
})
it('validates CAS, public contact allowlists and no-op revisions; inventory reads canonical threshold', async () => {
  const actor = await account()
  const body = {
    contact: { email: 'synthetic@example.test', phone: '+8801700000000' },
    complaintContact: { email: 'complaints@example.test' },
    address: { line1: 'Synthetic address', area: 'Synthetic area', district: 'Dhaka' },
    lowStockThreshold: 9,
  }
  const result = await write(actor, '', body, '"0"', randomUUID(), 'patch').expect(200)
  expect(result.headers.etag).toBe('"1"')
  await write(actor, '', { lowStockThreshold: 10 }, '"0"', randomUUID(), 'patch').expect(412)
  await write(actor, '', { lowStockThreshold: -1 }, '"1"', randomUUID(), 'patch').expect(400)
  const same = await write(actor, '', body, '"1"', randomUUID(), 'patch').expect(200)
  expect(same.headers.etag).toBe('"1"')
  const publicResult = await request(app).get('/api/v1/storefront/contact').expect(200)
  expect(publicResult.body.data).toEqual({
    contact: body.contact,
    complaintContact: body.complaintContact,
  })
  const threshold = await db.connection.transaction((session) =>
    stockSettingsReader(db.connection)(session),
  )
  expect(threshold).toBe(9)
})
it('permits one winner for simultaneous same-revision settings edits', async () => {
  const actor = await account()
  const results = await Promise.all([
    write(actor, '', { lowStockThreshold: 10 }, '"0"', randomUUID(), 'patch'),
    write(actor, '', { lowStockThreshold: 11 }, '"0"', randomUUID(), 'patch'),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 412])
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({ action: 'settings.update' }),
  ).toBe(1)
})
it('validates branding/banner through the real media ledger, and detaches cleared banners atomically', async () => {
  const actor = await account(),
    image = await media.uploadPublic(actor.token, imageFile())
  if (!image.publicId || !image.url) throw new Error('Synthetic upload unavailable')
  const asset = await mediaModel(db.connection).findOne({ publicId: image.publicId }).orFail()
  await write(
    actor,
    '',
    {
      homepageBanner: {
        assetId: asset._id.toHexString(),
        title: 'Synthetic banner',
        alt: 'Synthetic image',
        href: '/products',
      },
      branding: { publicId: image.publicId, url: image.url, alt: 'Synthetic logo' },
    },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(200)
  expect((await mediaModel(db.connection).findById(asset._id))?.references).toHaveLength(2)
  await write(actor, '', { homepageBanner: null }, '"1"', randomUUID(), 'patch').expect(200)
  expect((await mediaModel(db.connection).findById(asset._id))?.references).toHaveLength(1)
  await write(
    actor,
    '',
    {
      branding: {
        publicId: image.publicId,
        url: 'https://foreign.invalid/image.png',
        alt: 'Synthetic',
      },
    },
    '"2"',
    randomUUID(),
    'patch',
  ).expect(400)
  await write(
    actor,
    '',
    {
      homepageBanner: {
        assetId: new Types.ObjectId().toHexString(),
        title: 'Missing',
        alt: 'Missing',
      },
    },
    '"2"',
    randomUUID(),
    'patch',
  ).expect(404)
  expect((await read(actor)).body.data.revision).toBe(2)
})
it('keeps drafts private, enforces draft-only CAS and paginates summary allowlists', async () => {
  const actor = await account(),
    created = await draft(actor)
  await request(app).get('/api/v1/storefront/policies/terms').expect(404)
  await write(
    actor,
    `/policies/${created.policyId}`,
    { content: 'Edited synthetic policy' },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(200)
  await write(
    actor,
    `/policies/${created.policyId}`,
    { content: 'Stale synthetic policy' },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(412)
  const list = await read(actor, '/policies?type=terms&pageSize=1').expect(200)
  expect(list.body.meta.totalItems).toBe(1)
  expect(list.body.data[0]).not.toHaveProperty('content')
  await write(actor, '/policies', { type: 'privacy', content: '<script>invalid</script>' }).expect(
    400,
  )
})
it('requires evidence bound to version/content/date and never accepts a browser assertion', async () => {
  const actor = await account(),
    created = await draft(actor)
  await write(actor, `/policies/${created.policyId}/approve`, {
    approvalEvidenceRef: 'invented',
    reason: 'Synthetic',
  }).expect(422)
  await write(actor, `/policies/${created.policyId}/publish`, {
    effectiveAt: now.toISOString(),
    reason: 'Synthetic',
  }).expect(409)
  await approve(actor, created)
  await write(
    actor,
    `/policies/${created.policyId}`,
    { content: 'Cannot edit approved content' },
    '"1"',
    randomUUID(),
    'patch',
  ).expect(409)
  await write(
    actor,
    `/policies/${created.policyId}/publish`,
    { effectiveAt: new Date(now.getTime() + 1000).toISOString(), reason: 'Wrong date' },
    '"1"',
  ).expect(409)
})
it('publishes every policy type through approved effective pointers without leaking private fields', async () => {
  const actor = await account()
  for (const type of [
    'shipping',
    'cancellation',
    'returns',
    'refunds',
    'privacy',
    'terms',
    'complaints',
  ]) {
    const created = await draft(actor, type),
      body = await approve(actor, created)
    await write(actor, `/policies/${created.policyId}/publish`, body, '"1"').expect(200)
    const result = await request(app).get(`/api/v1/storefront/policies/${type}`).expect(200)
    expect(Object.keys(result.body.data).sort()).toEqual(['content', 'effectiveAt', 'version'])
    expect(result.body.data.version).toBe(created.version)
  }
})
it('replays approval/publication across later state without duplicate audit or pointer movement', async () => {
  const actor = await account(),
    created = await draft(actor),
    target = await policyModel(db.connection).findById(created.policyId).orFail()
  const ref = 'synthetic:replay',
    approvalBody = { approvalEvidenceRef: ref, reason: 'Synthetic' },
    key = randomUUID()
  proofs.push({
    evidenceRef: ref,
    type: 'terms',
    version: created.version,
    contentDigest: target.contentDigest,
    effectiveAt: now.toISOString(),
    approvedAt: now.toISOString(),
    approvedBy: 'Synthetic reviewer',
  })
  const first = await write(
    actor,
    `/policies/${created.policyId}/approve`,
    approvalBody,
    '"0"',
    key,
  ).expect(200)
  const publication = { effectiveAt: now.toISOString(), reason: 'Synthetic' },
    publishKey = randomUUID()
  await write(
    actor,
    `/policies/${created.policyId}/publish`,
    publication,
    '"1"',
    publishKey,
  ).expect(200)
  const replay = await write(
    actor,
    `/policies/${created.policyId}/approve`,
    approvalBody,
    '"0"',
    key,
  ).expect(200)
  expect(replay.body.data).toEqual(first.body.data)
  await write(
    actor,
    `/policies/${created.policyId}/publish`,
    publication,
    '"1"',
    publishKey,
  ).expect(200)
  await write(
    actor,
    `/policies/${created.policyId}/publish`,
    { ...publication, reason: 'Changed' },
    '"1"',
    publishKey,
  ).expect(409)
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({ action: 'policy.publish' }),
  ).toBe(1)
})
it('preserves prior published history until scheduled effective activation, including concurrent workers', async () => {
  const actor = await account(),
    first = await draft(actor),
    initial = await approve(actor, first)
  await write(actor, `/policies/${first.policyId}/publish`, initial, '"1"').expect(200)
  const second = await draft(actor),
    future = new Date(now.getTime() + 60000),
    body = await approve(actor, second, future.toISOString())
  const scheduled = await write(actor, `/policies/${second.policyId}/publish`, body, '"1"').expect(
    200,
  )
  expect(scheduled.body.data.status).toBe('scheduled')
  expect((await request(app).get('/api/v1/storefront/policies/terms')).body.data.version).toBe(
    first.version,
  )
  expect((await policies.activateDue()).processed).toBe(0)
  now = future
  await Promise.all([policies.activateDue(), policies.activateDue()])
  expect((await request(app).get('/api/v1/storefront/policies/terms')).body.data.version).toBe(
    second.version,
  )
  expect((await policyModel(db.connection).findById(first.policyId))?.status).toBe('superseded')
  expect((await policyModel(db.connection).findById(first.policyId))?.content).toBe(
    'Synthetic plain policy for tests only.',
  )
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({ action: 'policy.activate' }),
  ).toBe(1)
})
it('rolls back settings, media and publication when transactional audit fails', async () => {
  const actor = await account(),
    access = createAdminAccountAccess(db.connection, identities, sessions)
  const fail = async () => {
    throw new Error('Synthetic audit failure')
  }
  const failedSettings = settingsService(db.connection, access, fail, media)
  const uploaded = await media.uploadPublic(actor.token, imageFile())
  if (!uploaded.publicId) throw new Error('Synthetic upload unavailable')
  const asset = await mediaModel(db.connection).findOne({ publicId: uploaded.publicId }).orFail()
  await expect(
    failedSettings.patch(
      actor.token,
      {
        homepageBanner: { assetId: asset._id.toHexString(), title: 'Synthetic', alt: 'Synthetic' },
      },
      '"0"',
    ),
  ).rejects.toThrow('Synthetic audit failure')
  expect((await settingsModel(db.connection).findOne({ key: 'primary' }))?.revision).toBe(0)
  expect((await mediaModel(db.connection).findById(asset._id))?.references).toHaveLength(0)
  const created = await draft(actor),
    body = await approve(actor, created)
  await expect(
    policyService(db.connection, access, fail, proofs, () => now).transition(
      actor.token,
      created.policyId,
      'publish',
      body,
      '"1"',
      randomUUID(),
    ),
  ).rejects.toThrow('Synthetic audit failure')
  expect((await policyModel(db.connection).findById(created.policyId))?.status).toBe('approved')
  await request(app).get('/api/v1/storefront/policies/terms').expect(404)
})
it('rejects missing/malformed preconditions and keys without changing settings or policies', async () => {
  const actor = await account(),
    created = await draft(actor)
  await request(app)
    .patch(base)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrf)
    .send({ lowStockThreshold: 8 })
    .expect(428)
  await write(actor, '', { lowStockThreshold: 8 }, 'W/"0"', randomUUID(), 'patch').expect(412)
  await request(app)
    .post(`${base}/policies/${created.policyId}/approve`)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('X-CSRF-Token', actor.csrf)
    .set('If-Match', '"0"')
    .send({ approvalEvidenceRef: 'synthetic', reason: 'Synthetic' })
    .expect(400)
  expect((await read(actor)).body.data.revision).toBe(0)
  expect((await policyModel(db.connection).findById(created.policyId))?.status).toBe('draft')
})
it('does not let an older scheduled version overwrite a newer effective publication', async () => {
  const actor = await account(),
    older = await draft(actor),
    date = new Date(now.getTime() + 1000)
  const scheduled = await approve(actor, older, date.toISOString())
  await write(actor, `/policies/${older.policyId}/publish`, scheduled, '"1"').expect(200)
  now = new Date(date.getTime() + 1000)
  const newer = await draft(actor),
    immediate = await approve(actor, newer)
  await write(actor, `/policies/${newer.policyId}/publish`, immediate, '"1"').expect(200)
  await policies.activateDue()
  expect((await request(app).get('/api/v1/storefront/policies/terms')).body.data.version).toBe(
    newer.version,
  )
  expect((await policyModel(db.connection).findById(older.policyId))?.status).toBe('superseded')
})
it('rejects digest-mismatched approval evidence and actor changes on replay', async () => {
  const actor = await account(),
    other = await account(),
    created = await draft(actor)
  proofs.push({
    evidenceRef: 'synthetic:wrong-digest',
    type: 'terms',
    version: created.version,
    contentDigest: 'a'.repeat(64),
    effectiveAt: now.toISOString(),
    approvedAt: now.toISOString(),
    approvedBy: 'Synthetic reviewer',
  })
  await write(actor, `/policies/${created.policyId}/approve`, {
    approvalEvidenceRef: 'synthetic:wrong-digest',
    reason: 'Synthetic',
  }).expect(422)
  const body = await approve(actor, created),
    key = randomUUID()
  await write(actor, `/policies/${created.policyId}/publish`, body, '"1"', key).expect(200)
  await write(other, `/policies/${created.policyId}/publish`, body, '"1"', key).expect(409)
})
it('fails closed when canonical settings are missing and enforces unique schema identities', async () => {
  const actor = await account()
  const current = await settingsModel(db.connection).findOne({ key: 'primary' }).orFail()
  const copy = current.toObject()
  await expect(
    settingsModel(db.connection).create({ ...copy, _id: new Types.ObjectId() }),
  ).rejects.toMatchObject({ code: 11000 })
  const invalid = new (settingsModel(db.connection))({
    ...copy,
    _id: new Types.ObjectId(),
    lowStockThreshold: -1,
  })
  await expect(invalid.validate()).rejects.toThrow()
  await settingsModel(db.connection).deleteMany({})
  await read(actor).expect(503)
  await request(app).get('/api/v1/storefront/contact').expect(503)
})

it('runs compiled additive bootstrap and scheduled worker; refuses production bootstrap', async () => {
  now = new Date(Date.now() - 60000)
  const actor = await account(),
    created = await draft(actor)
  const effectiveAt = new Date(Date.now() - 30000).toISOString(),
    body = await approve(actor, created, effectiveAt)
  await write(actor, `/policies/${created.policyId}/publish`, body, '"1"').expect(200)
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
    STORE_INITIAL_LOW_STOCK_THRESHOLD: '99',
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-settings.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await settingsModel(db.connection).findOne({ key: 'primary' }))?.lowStockThreshold).toBe(
    5,
  )
  const run = spawnSync(process.execPath, ['scripts/activate-policies.mjs'], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(run.status, run.stderr).toBe(0)
  expect(JSON.parse(run.stdout).processed).toBe(1)
  expect((await policyModel(db.connection).findById(created.policyId))?.status).toBe('published')
  const repeat = spawnSync(process.execPath, ['scripts/activate-policies.mjs'], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(repeat.status, repeat.stderr).toBe(0)
  expect(JSON.parse(repeat.stdout).processed).toBe(0)
  for (const overrides of [
    { STORE_INITIAL_LOW_STOCK_THRESHOLD: '' },
    { NODE_ENV: 'production', APP_ENV: 'production' },
  ]) {
    const refused = spawnSync(process.execPath, ['scripts/bootstrap-settings.mjs'], {
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(refused.status).toBe(1)
    expect(refused.stderr).not.toContain(env.MONGODB_URI)
  }
})

it('public home reflects persisted admin contact/banner updates with independent verified branding slots', async () => {
  const actor = await account(),
    uploaded = await media.uploadPublic(actor.token, imageFile())
  if (!uploaded.publicId || !uploaded.url) throw new Error('Synthetic upload unavailable')
  const asset = await mediaModel(db.connection).findOne({ publicId: uploaded.publicId }).orFail()
  await write(
    actor,
    '',
    {
      storeName: 'Synthetic Store',
      contact: { email: 'store@example.test' },
      complaintContact: { email: 'complaints@example.test' },
      homepageBanner: {
        assetId: asset._id.toHexString(),
        title: 'Approved banner',
        alt: 'Banner alt',
        href: '/products',
      },
      branding: { publicId: uploaded.publicId, url: uploaded.url, alt: 'Logo alt' },
    },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(200)
  const home = (await request(app).get('/api/v1/storefront/home').expect(200)).body.data
  expect(home).toMatchObject({
    storeName: 'Synthetic Store',
    contact: { email: 'store@example.test' },
    complaintContact: { email: 'complaints@example.test' },
    branding: { alt: 'Logo alt' },
    banner: {
      assetId: asset._id.toHexString(),
      title: 'Approved banner',
      alt: 'Banner alt',
      image: { alt: 'Banner alt' },
    },
  })
  expect(home.banner.image.url).toContain('https://public.example.test/')
  expect(home.banner.image.url).not.toBe(uploaded.url)
  const noProvider = await storefrontSettingsAccess(
    db.connection,
    publicMediaService(db.connection),
  )()
  expect(noProvider).not.toHaveProperty('banner')
  expect(noProvider).not.toHaveProperty('branding')
  const unsafeProvider = await storefrontSettingsAccess(
    db.connection,
    publicMediaService(db.connection, { publicUrl: () => 'http://unsafe.example.test/image.png' }),
  )()
  expect(unsafeProvider).not.toHaveProperty('banner')
  expect(unsafeProvider).not.toHaveProperty('branding')
  await write(actor, '', { homepageBanner: null }, '"1"', randomUUID(), 'patch').expect(200)
  const cleared = (await request(app).get('/api/v1/storefront/home').expect(200)).body.data
  expect(cleared).not.toHaveProperty('banner')
  expect(cleared.branding.alt).toBe('Logo alt')
})
it('public home rechecks clean/public/attached ledger state and exact settings slot/asset identity', async () => {
  const actor = await account(),
    uploaded = await media.uploadPublic(actor.token, imageFile())
  if (!uploaded.publicId || !uploaded.url) throw new Error('Synthetic upload unavailable')
  const asset = await mediaModel(db.connection).findOne({ publicId: uploaded.publicId }).orFail()
  await write(
    actor,
    '',
    {
      homepageBanner: { assetId: asset._id.toHexString(), title: 'Banner', alt: 'Banner' },
      branding: { publicId: uploaded.publicId, url: uploaded.url, alt: 'Logo' },
    },
    '"0"',
    randomUUID(),
    'patch',
  ).expect(200)
  const references = (await mediaModel(db.connection).findById(asset._id).orFail()).toObject()
    .references
  for (const changes of [
    { status: 'quarantined', scanStatus: 'rejected', references: [] },
    { status: 'deleting', references: [] },
    { status: 'deleted', references: [] },
    {
      assetKind: 'claim_evidence',
      access: 'private',
      owner: { kind: 'customer', principalId: new Types.ObjectId() },
      orderId: new Types.ObjectId(),
      claimType: 'physical_return',
      orderItemIds: [new Types.ObjectId()],
      status: 'quarantined',
      scanStatus: 'rejected',
      references: [],
    },
  ]) {
    await mediaModel(db.connection).collection.updateOne({ _id: asset._id }, { $set: changes })
    const home = (await request(app).get('/api/v1/storefront/home').expect(200)).body.data
    expect(home).not.toHaveProperty('branding')
    expect(home).not.toHaveProperty('banner')
    await mediaModel(db.connection).collection.updateOne(
      { _id: asset._id },
      {
        $set: {
          assetKind: 'public_media',
          owner: asset.toObject().owner,
          scanStatus: 'clean',
          access: 'public',
          status: 'attached',
          references,
          orderItemIds: [],
        },
        $unset: { orderId: 1, claimType: 1 },
      },
    )
  }
  await mediaModel(db.connection).collection.updateOne(
    { _id: asset._id },
    { $set: { references: references.filter((ref) => ref.slot !== 'homepageBanner') } },
  )
  const wrongSlot = (await request(app).get('/api/v1/storefront/home').expect(200)).body.data
  expect(wrongSlot).not.toHaveProperty('banner')
  expect(wrongSlot).toHaveProperty('branding')
  await mediaModel(db.connection).collection.updateOne({ _id: asset._id }, { $set: { references } })
  await settingsModel(db.connection).collection.updateOne(
    { key: 'primary' },
    { $set: { 'homepageBanner.assetId': new Types.ObjectId() } },
  )
  expect(
    (await request(app).get('/api/v1/storefront/home').expect(200)).body.data,
  ).not.toHaveProperty('banner')
})
it('home policy links expose only the current approved effective publication and track later supersession', async () => {
  const actor = await account(),
    created = await draft(actor),
    publication = await approve(actor, created)
  expect(
    (await request(app).get('/api/v1/storefront/home').expect(200)).body.data.policyLinks,
  ).toEqual([])
  await write(actor, `/policies/${created.policyId}/publish`, publication, '"1"').expect(200)
  expect(
    (await request(app).get('/api/v1/storefront/home').expect(200)).body.data.policyLinks,
  ).toEqual([
    { type: 'terms', version: created.version, href: '/api/v1/storefront/policies/terms' },
  ])
  const next = await draft(actor),
    future = new Date(now.getTime() + 60000).toISOString(),
    scheduled = await approve(actor, next, future)
  await write(actor, `/policies/${next.policyId}/publish`, scheduled, '"1"').expect(200)
  expect(
    (await request(app).get('/api/v1/storefront/home').expect(200)).body.data.policyLinks[0]
      .version,
  ).toBe(created.version)
  now = new Date(future)
  await policies.activateDue()
  expect(
    (await request(app).get('/api/v1/storefront/home').expect(200)).body.data.policyLinks[0]
      .version,
  ).toBe(next.version)
  await policyModel(db.connection).updateOne(
    { version: next.version },
    { $unset: { approvalEvidenceRef: 1 } },
  )
  expect(
    (await request(app).get('/api/v1/storefront/home').expect(200)).body.data.policyLinks,
  ).toEqual([])
})

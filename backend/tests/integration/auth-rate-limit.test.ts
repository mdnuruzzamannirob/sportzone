import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAuthQuotaStore } from '../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../src/modules/auth/sessions/auth-throttle.service.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createApp } from '../../src/app.js'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
const secret = randomBytes(32).toString('hex')
let time = Date.now()
const clock = () => time
const store = () => createAuthQuotaStore(fixture.connection)
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await initializeIdentityPersistence(fixture.connection, createIdentityModels(fixture.connection))
  await createRegistrationNotifications(fixture.connection).initialize()
})
beforeEach(async () => {
  await fixture.connection.db?.collection('authRateLimits').deleteMany({})
  time = Date.now()
})
afterAll(async () => {
  await fixture?.close()
})
describe('P03-014 real shared auth quota persistence', () => {
  it('uses strict schema, exact indexes and repeatable additive bootstrap without erasing data', async () => {
    const s = store()
    await s.verify()
    await s.increment('a'.repeat(64), new Date(time + 60000), 10)
    await s.initialize()
    expect(await fixture.connection.db?.collection('authRateLimits').countDocuments()).toBe(1)
    await expect(
      fixture.connection.db
        ?.collection<{
          _id: string
          count: number
          expiresAt: Date
          email?: string
        }>('authRateLimits')
        .insertOne({
          _id: 'bad',
          count: 1,
          expiresAt: new Date(),
          email: 'private@example.test',
        }),
    ).rejects.toMatchObject({ code: 121 })
    await expect(
      fixture.connection.db
        ?.collection<{ _id: string; count: number; expiresAt: Date }>('authRateLimits')
        .updateOne({ _id: 'a'.repeat(64) }, { $set: { count: 1.5 } }),
    ).rejects.toMatchObject({ code: 121 })
    expect(
      (await fixture.connection.db?.collection('authRateLimits').indexes())
        ?.map((i) => i.name)
        .sort(),
    ).toEqual(['_id_', 'auth_rate_limits_expiry'])
  })
  it('enforces the exact limit under concurrent independent API instances and survives recreation', async () => {
    const a = createAuthThrottle(store(), secret, clock),
      b = createAuthThrottle(store(), secret, clock)
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        (i % 2 ? a : b).consume('customer', 'credentials', 'synthetic-network'),
      ),
    )
    expect(results.filter((r) => r === 0)).toHaveLength(10)
    expect(results.filter((r) => r > 0)).toHaveLength(20)
    expect(
      await createAuthThrottle(store(), secret, clock).consume(
        'customer',
        'credentials',
        'synthetic-network',
      ),
    ).toBeGreaterThan(0)
    const rows = await fixture.connection.db?.collection('authRateLimits').find({}).toArray()
    expect(
      rows?.every(
        (r) =>
          Object.keys(r).sort().join(',') === '_id,count,expiresAt' &&
          /^[a-f0-9]{64}$/.test(String(r._id)),
      ),
    ).toBe(true)
  })
  it('limits normalized target attempts across networks without storing target identifiers', async () => {
    const guard = createAuthThrottle(store(), secret, clock)
    for (let i = 0; i < 10; i++)
      expect(
        await guard.consume('customer', 'recovery', `network-${i}`, 'target@example.test'),
      ).toBe(0)
    expect(
      await guard.consume('customer', 'recovery', 'new-network', 'target@example.test'),
    ).toBeGreaterThan(0)
    expect(await guard.consume('customer', 'recovery', 'new-network', 'missing@example.test')).toBe(
      0,
    )
    expect(await guard.consume('admin', 'recovery', 'new-network', 'target@example.test')).toBe(0)
    const text = JSON.stringify(
      await fixture.connection.db?.collection('authRateLimits').find({}).toArray(),
    )
    expect(text).not.toMatch(/target|missing|network|example|secret/)
  })
  it('resets fixed windows while expired rows remain awaiting TTL and saturates bounded counts', async () => {
    const guard = createAuthThrottle(store(), secret, clock)
    for (let i = 0; i < 100; i++) await guard.consume('customer', 'credentials', 'network')
    expect(await guard.consume('customer', 'credentials', 'network')).toBeGreaterThan(0)
    const oldRows = await fixture.connection.db?.collection('authRateLimits').find({}).toArray()
    expect(oldRows?.every((r) => Number(r.count) <= 61)).toBe(true)
    time = Math.floor(time / 60000) * 60000 + 60000
    expect(await guard.consume('customer', 'credentials', 'network')).toBe(0)
    expect(await fixture.connection.db?.collection('authRateLimits').countDocuments()).toBe(4)
  })
  it('fails readiness on missing/mismatched persistence without recreating it at HTTP startup', async () => {
    const db = fixture.connection.db
    if (!db) throw new Error('Missing fixture')
    await db.collection('authRateLimits').dropIndex('auth_rate_limits_expiry')
    await expect(store().verify()).rejects.toThrow('indexes require review')
    await store().initialize()
    await db.command({ collMod: 'authRateLimits', validationAction: 'warn' })
    await expect(store().verify()).rejects.toThrow('reviewed bootstrap')
    await expect(store().initialize()).rejects.toThrow('reviewed migration')
    await db.command({ collMod: 'authRateLimits', validationAction: 'error' })
    await store().verify()
  })
  it('fails closed after a live counter collection is removed without implicitly recreating it', async () => {
    const guard = createAuthThrottle(store(), secret, clock)
    expect(await guard.consume('customer', 'credentials', 'network')).toBe(0)
    await fixture.connection.db?.collection('authRateLimits').drop()
    await expect(guard.consume('customer', 'credentials', 'network')).rejects.toThrow(
      'reviewed bootstrap',
    )
    expect(await fixture.connection.db?.listCollections({ name: 'authRateLimits' }).hasNext()).toBe(
      false,
    )
    await store().initialize()
  })
  it('actual runtime shares counters across compositions and does not bypass CSRF or mutate an account', async () => {
    const env = {
      ...testEnvironment(),
      MONGODB_URI: fixture.replica.getUri(),
      MONGODB_DB_NAME: fixture.connection.name,
      CUSTOMER_AUTH_ENABLED: 'true',
      CUSTOMER_SESSION_TTL_SECONDS: '600',
      ADMIN_SESSION_TTL_SECONDS: '300',
      SESSION_COOKIE_SAME_SITE: 'lax',
      BROWSER_CONTEXT_TTL_SECONDS: '120',
    }
    const config = loadEnvironment(env)
    const a = createApp({
      apiRouter: await composeIdentityRoutes(fixture.connection, config),
    })
    const b = createApp({
      apiRouter: await composeIdentityRoutes(fixture.connection, config),
    })
    for (let i = 0; i < 10; i++)
      await request(i % 2 ? a : b)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({ email: 'synthetic@example.test', password: 'invalid' })
        .expect(403)
    const res = await request(b)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'synthetic@example.test', password: 'invalid' })
      .expect(429)
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    expect(await createIdentityModels(fixture.connection).users.countDocuments()).toBe(0)
    // Startup verifies only: a missing index stays missing and activation fails.
    await fixture.connection.db?.collection('authRateLimits').dropIndex('auth_rate_limits_expiry')
    await expect(composeIdentityRoutes(fixture.connection, config)).rejects.toThrow(
      'indexes require review',
    )
    expect((await fixture.connection.db?.collection('authRateLimits').indexes())?.length).toBe(1)
    await store().initialize()
  })
})

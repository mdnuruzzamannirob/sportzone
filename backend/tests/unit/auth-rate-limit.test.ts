import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createAuthThrottle } from '../../src/modules/auth/sessions/auth-throttle.service.js'
import { createLogger } from '../../src/shared/logger.js'
import { loadEnvironment } from '../../src/config/env.js'
import { testEnvironment } from '../helpers/environment.js'
function memoryStore() {
  const buckets = new Map<string, number>()
  return {
    buckets,
    async increment(key: string, _expiresAt: Date, limit: number) {
      const count = Math.min((buckets.get(key) ?? 0) + 1, limit + 1)
      buckets.set(key, count)
      return count
    },
  }
}
function fixture(group: 'credentials' | 'recovery' | 'bootstrap' = 'credentials') {
  const store = memoryStore(),
    lines: string[] = [],
    clock = { now: 120001 }
  const guard = createAuthThrottle(store, randomBytes(32).toString('hex'), () => clock.now)
  const router = Router()
  let calls = 0
  router.post('/auth/login', guard.middleware('customer', group), (_req, res) => {
    calls++
    res.json({ data: { accepted: true } })
  })
  const app = createApp({
    apiRouter: router,
    logger: createLogger(loadEnvironment(testEnvironment()), (line) => lines.push(line)),
  })
  return { app, store, clock, guard, lines, calls: () => calls }
}
describe('P03-014 bounded auth controls and audit safety', () => {
  it('shares the IP budget across attempts and ignores spoofed forwarding headers', async () => {
    const f = fixture()
    for (let i = 0; i < 10; i++)
      await request(f.app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({ email: `sample${i}@example.test` })
        .expect(200)
    const res = await request(f.app)
      .post('/api/v1/auth/login')
      .send({
        email: 'private@example.test',
        password: 'private-password',
        token: 'private-token',
      })
      .expect(429)
    expect(res.headers['retry-after']).toBe('60')
    expect(res.body.error.code).toBe('RATE_LIMITED')
    expect(f.calls()).toBe(10)
    const record = JSON.parse(f.lines.at(-1) ?? '{}')
    expect(record).toMatchObject({
      securityAction: 'customer.login',
      securityReason: 'rate_limited',
      outcome: 'denied',
      errorCode: 'RATE_LIMITED',
    })
    expect(f.lines.join('')).not.toMatch(/private|192\.0\.2|sample\d|@example|password|token/)
    expect([...f.store.buckets.keys()].every((k) => /^[a-f0-9]{64}$/.test(k))).toBe(true)
  })
  it('normalizes supplied target identity without looking up whether it exists', async () => {
    const f = fixture()
    for (let i = 0; i < 10; i++)
      await request(f.app)
        .post('/api/v1/auth/login')
        .send({
          email: i % 2 ? ' Target@EXAMPLE.TEST ' : 'target@example.test',
        })
        .expect(200)
    // One audience network key, one group network key, one normalized target key.
    expect(f.store.buckets.size).toBe(3)
    for (const email of ['target@example.test', 'missing@example.test']) {
      const r = await request(f.app).post('/api/v1/auth/login').send({ email }).expect(429)
      expect(r.body.error).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      })
    }
  })
  it('resets by fixed window before stale rows are deleted', async () => {
    const f = fixture()
    for (let i = 0; i < 10; i++)
      expect(await f.guard.consume('customer', 'recovery', 'network')).toBe(0)
    expect(await f.guard.consume('customer', 'recovery', 'network')).toBe(60)
    f.clock.now = 180000
    expect(await f.guard.consume('customer', 'recovery', 'network')).toBe(0)
    expect(f.store.buckets.size).toBe(4)
  })
  it('uses independent audiences/groups while sharing the audience-wide network ceiling', async () => {
    const f = fixture()
    for (let i = 0; i < 10; i++) await f.guard.consume('customer', 'credentials', 'network')
    expect(await f.guard.consume('customer', 'credentials', 'network')).toBe(60)
    expect(await f.guard.consume('admin', 'credentials', 'network')).toBe(0)
    expect(await f.guard.consume('customer', 'recovery', 'network')).toBe(0)
    for (let i = 0; i < 60; i++) await f.guard.consume('customer', 'bootstrap', 'second-network')
    expect(await f.guard.consume('customer', 'bootstrap', 'second-network')).toBe(60)
  })
  it('fails closed before invoking a handler when counters are unavailable and logs no store details', async () => {
    const lines: string[] = [],
      router = Router()
    const guard = createAuthThrottle(
      {
        async increment() {
          throw new Error('private DB address and key')
        },
      },
      randomBytes(32).toString('hex'),
    )
    router.post('/auth/login', guard.middleware('customer', 'credentials'), () => {
      throw new Error('Must not invoke')
    })
    const res = await request(
      createApp({
        apiRouter: router,
        logger: createLogger(loadEnvironment(testEnvironment()), (line) => lines.push(line)),
      }),
    )
      .post('/api/v1/auth/login')
      .send({ email: 'private@example.test' })
      .expect(503)
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE')
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      securityReason: 'throttle_unavailable',
      outcome: 'failed',
    })
    expect(JSON.stringify(res.body) + lines.join('')).not.toContain('private')
  })
  it.each([{}, { email: [] }, { email: {} }, { email: 'x'.repeat(2048) }, { newEmail: null }])(
    'bounds malformed target input %j',
    async (body) => {
      const f = fixture()
      await request(f.app).post('/api/v1/auth/login').send(body).expect(200)
      expect(f.store.buckets.size).toBe(2)
    },
  )
})

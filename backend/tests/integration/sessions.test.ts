import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import {
  initializeIdentityPersistence,
  identityCollectionValidators,
} from '../../src/modules/auth/collection-validators.js'
import { createIdentityModels } from '../../src/modules/auth/models.js'
import { createSessionHttp } from '../../src/modules/auth/session-http.js'
import {
  createSessionService,
  type SessionKind,
  type SessionOptions,
} from '../../src/modules/auth/sessions.js'
import { createLogger } from '../../src/observability/logger.js'
import { respond } from '../../src/common/responses.js'
import { isolatedDatabase } from '../support/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let service: ReturnType<typeof createSessionService>
let currentTime = Date.now()
const clock = () => new Date(currentTime)
const options: SessionOptions = {
  secret: randomBytes(32).toString('hex'),
  customerTtlSeconds: 600,
  adminTtlSeconds: 300,
  sameSite: 'lax',
  appEnvironment: 'test',
  apiOrigin: 'http://127.0.0.1:4000',
}
async function user(role: SessionKind = 'customer') {
  return new models.users({
    emailNormalized: `fixture_${randomUUID()}@example.test`,
    name: 'Synthetic identity',
    passwordHash: 'synthetic_encoded_hash',
    role,
  }).save()
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  if (!fixture.connection.db) throw new Error('Missing fixture database')
  await fixture.connection.db
    .admin()
    .command({ setParameter: 1, ttlMonitorEnabled: false })
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  service = createSessionService(fixture.connection, models, options, clock)
})
beforeEach(() => {
  currentTime = Date.now()
})
afterAll(async () => {
  await fixture?.close()
})

describe('real opaque session lifecycle', () => {
  it.each(['customer', 'admin'] as const)(
    'issues %s opaque credentials with independent hashed-at-rest material',
    async (kind) => {
      const account = await user(kind)
      const issued = await service.issue(kind, account._id)
      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(issued.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(issued.token).not.toBe(issued.csrfToken)
      expect(issued.token).not.toContain(account._id.toHexString())
      const stored = await models.sessions
        .findOne({ userId: account._id })
        .select('+tokenHash +csrfSecretHash')
      expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
      expect(stored?.csrfSecretHash).toMatch(/^[a-f0-9]{64}$/)
      expect(JSON.stringify(stored)).not.toContain(issued.token)
      expect(JSON.stringify(stored)).not.toContain(issued.csrfToken)
      expect(await service.authenticate(kind, issued.token)).toMatchObject({
        userId: account._id,
        kind,
      })
      expect(await service.verifyCsrfMaterial(kind, issued.token, issued.csrfToken)).toBe(
        true,
      )
      expect(issued.expiresAt.getTime() - currentTime).toBe(
        (kind === 'customer' ? 600 : 300) * 1000,
      )
    },
  )
  it('isolates customer/admin tokens and denies role-mismatched issuance', async () => {
    const customer = await user(),
      admin = await user('admin')
    const c = await service.issue('customer', customer._id),
      a = await service.issue('admin', admin._id)
    await expect(service.authenticate('admin', c.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    await expect(service.authenticate('customer', a.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    await expect(service.issue('admin', customer._id)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    await expect(service.issue('customer', admin._id)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect(await service.verifyCsrfMaterial('admin', c.token, c.csrfToken)).toBe(false)
  })
  it('binds CSRF material to one credential and rejects malformed supplied values', async () => {
    const account = await user()
    const first = await service.issue('customer', account._id),
      second = await service.issue('customer', account._id)
    expect(
      await service.verifyCsrfMaterial('customer', first.token, second.csrfToken),
    ).toBe(false)
    expect(await service.verifyCsrfMaterial('customer', first.token, 'invalid')).toBe(
      false,
    )
    expect(await service.verifyCsrfMaterial('customer', undefined, first.csrfToken)).toBe(
      false,
    )
    await expect(service.authenticate('customer', 'invalid')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
  })
  it('rotates once, invalidates both old credential and old CSRF, and preserves another login', async () => {
    const account = await user()
    const old = await service.issue('customer', account._id),
      other = await service.issue('customer', account._id)
    const next = await service.rotate('customer', old.token)
    expect(next.token).not.toBe(old.token)
    expect(next.csrfToken).not.toBe(old.csrfToken)
    await expect(service.authenticate('customer', old.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect(await service.verifyCsrfMaterial('customer', next.token, old.csrfToken)).toBe(
      false,
    )
    expect(await service.verifyCsrfMaterial('customer', old.token, next.csrfToken)).toBe(
      false,
    )
    expect(await service.verifyCsrfMaterial('customer', next.token, next.csrfToken)).toBe(
      true,
    )
    expect(await service.authenticate('customer', other.token)).toBeTruthy()
    await expect(service.rotate('customer', old.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
  })
  it('concurrent rotation creates exactly one active replacement', async () => {
    const account = await user(),
      initial = await service.issue('customer', account._id)
    const results = await Promise.allSettled([
      service.rotate('customer', initial.token),
      service.rotate('customer', initial.token),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await models.sessions.countDocuments({ userId: account._id })).toBe(2)
    expect(
      await models.sessions.countDocuments({
        userId: account._id,
        revokedAt: { $exists: false },
      }),
    ).toBe(1)
  })
  it('new login replaces only its same-user/same-kind predecessor', async () => {
    const customer = await user(),
      foreign = await user(),
      admin = await user('admin')
    const old = await service.issue('customer', customer._id),
      other = await service.issue('customer', foreign._id),
      a = await service.issue('admin', admin._id)
    const next = await service.issue('customer', customer._id, old.token)
    await expect(service.authenticate('customer', old.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    await service.issue('customer', customer._id, other.token)
    await service.issue('customer', customer._id, a.token)
    expect(await service.authenticate('customer', next.token)).toBeTruthy()
    expect(await service.authenticate('customer', other.token)).toBeTruthy()
    expect(await service.authenticate('admin', a.token)).toBeTruthy()
  })
  it('logout is idempotent and cannot revoke another namespace or credential', async () => {
    const customer = await user(),
      admin = await user('admin')
    const first = await service.issue('customer', customer._id),
      second = await service.issue('customer', customer._id),
      a = await service.issue('admin', admin._id)
    expect(await service.logout('customer', a.token)).toEqual({ revoked: true })
    expect(await service.authenticate('admin', a.token)).toBeTruthy()
    for (let attempt = 0; attempt < 2; attempt++)
      expect(await service.logout('customer', first.token)).toEqual({ revoked: true })
    expect(await service.logout('customer', undefined)).toEqual({ revoked: true })
    await expect(service.authenticate('customer', first.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect(await service.authenticate('customer', second.token)).toBeTruthy()
    expect(
      await service.verifyCsrfMaterial('customer', first.token, first.csrfToken),
    ).toBe(false)
  })
  it('server expiry is authoritative while the TTL-retained record still exists', async () => {
    const account = await user(),
      issued = await service.issue('customer', account._id)
    currentTime = issued.expiresAt.getTime()
    await expect(service.authenticate('customer', issued.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    await expect(service.rotate('customer', issued.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect(
      await service.verifyCsrfMaterial('customer', issued.token, issued.csrfToken),
    ).toBe(false)
    expect(await models.sessions.countDocuments({ userId: account._id })).toBe(1)
  })
  it.each(['suspended', 'deletion_pending', 'deactivated'] as const)(
    'denies existing and new sessions for %s identity',
    async (status) => {
      const account = await user(),
        issued = await service.issue('customer', account._id)
      await models.users.updateOne({ _id: account._id }, { $set: { status } })
      await expect(service.authenticate('customer', issued.token)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
      await expect(service.rotate('customer', issued.token)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
      await expect(service.issue('customer', account._id)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
    },
  )
  it('security revision and role changes invalidate credentials immediately', async () => {
    const account = await user(),
      issued = await service.issue('customer', account._id)
    await models.users.updateOne({ _id: account._id }, { $inc: { securityRevision: 1 } })
    await expect(service.authenticate('customer', issued.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    const refreshed = await service.issue('customer', account._id)
    await models.users.updateOne({ _id: account._id }, { $set: { role: 'admin' } })
    await expect(service.authenticate('customer', refreshed.token)).rejects.toMatchObject(
      { code: 'AUTH_REQUIRED' },
    )
    await expect(service.authenticate('admin', refreshed.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
  })
  it('principal revocation invalidates all applicable credentials but preserves another principal', async () => {
    const account = await user(),
      other = await user()
    const first = await service.issue('customer', account._id),
      second = await service.issue('customer', account._id),
      foreign = await service.issue('customer', other._id)
    await service.revokeUser(account._id, 'customer')
    for (const token of [first.token, second.token])
      await expect(service.authenticate('customer', token)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
    expect(await service.authenticate('customer', foreign.token)).toBeTruthy()
    expect(
      (await models.users.findById(account._id).select('+securityRevision'))
        ?.securityRevision,
    ).toBe(1)
  })
  it('secret rotation fails closed for old sessions and material', async () => {
    const account = await user(),
      issued = await service.issue('customer', account._id)
    const replacement = createSessionService(
      fixture.connection,
      models,
      { ...options, secret: randomBytes(32).toString('hex') },
      clock,
    )
    await expect(
      replacement.authenticate('customer', issued.token),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(
      await replacement.verifyCsrfMaterial('customer', issued.token, issued.csrfToken),
    ).toBe(false)
  })
  it('rolls back old-session revocation when replacement insertion fails', async () => {
    const account = await user(),
      issued = await service.issue('customer', account._id)
    const old = await service.authenticate('customer', issued.token)
    const db = fixture.connection.db
    if (!db) throw new Error('Missing fixture database')
    await db.command({
      collMod: 'sessions',
      validator: {
        $and: [
          identityCollectionValidators.sessions,
          { $or: [{ revokedAt: { $exists: true } }, { _id: old.sessionId }] },
        ],
      },
    })
    try {
      await expect(service.rotate('customer', issued.token)).rejects.toMatchObject({
        code: 121,
      })
      expect(await service.authenticate('customer', issued.token)).toBeTruthy()
      expect(await models.sessions.countDocuments({ userId: account._id })).toBe(1)
    } finally {
      await db.command({
        collMod: 'sessions',
        validator: identityCollectionValidators.sessions,
      })
    }
  })
})

describe('real HTTP cookie boundary using fixture-only routes', () => {
  function httpFixture(settings: SessionOptions = options) {
    const current = createSessionService(fixture.connection, models, settings, clock)
    const http = createSessionHttp(current, clock),
      router = Router(),
      lines: string[] = []
    router.get('/customer', http.require('customer'), (_req, res) =>
      respond(res, { kind: res.locals.sessionIdentity?.kind }),
    )
    router.get('/admin', http.require('admin'), (_req, res) =>
      respond(res, { kind: res.locals.sessionIdentity?.kind }),
    )
    router.get('/cookie/:kind', (req, res) => {
      const kind = req.params.kind === 'admin' ? 'admin' : 'customer'
      http.setCookie(res, {
        kind,
        token: 'x'.repeat(43),
        csrfToken: 'unused',
        expiresAt: new Date(currentTime + 60000),
      })
      respond(res, { set: true })
    })
    router.get('/clear/:kind', (req, res) => {
      http.clearCookie(res, req.params.kind === 'admin' ? 'admin' : 'customer')
      respond(res, { cleared: true })
    })
    return {
      app: createApp({
        apiRouter: router,
        logger: createLogger({ APP_ENV: 'test', RELEASE_ID: 'synthetic' }, (line) =>
          lines.push(line),
        ),
      }),
      lines,
    }
  }
  it('uses only route-selected cookies, never query/Bearer/forged roles, and logs no credentials', async () => {
    const c = await service.issue('customer', (await user())._id),
      a = await service.issue('admin', (await user('admin'))._id)
    const { app, lines } = httpFixture()
    const headers = `sz_customer_sid=${c.token}; sz_admin_sid=${a.token}`
    expect(
      (await request(app).get('/api/v1/customer').set('Cookie', headers)).body.data,
    ).toEqual({ kind: 'customer' })
    expect(
      (await request(app).get('/api/v1/admin').set('Cookie', headers)).body.data,
    ).toEqual({ kind: 'admin' })
    for (const path of ['/customer', '/admin']) {
      const response = await request(app)
        .get(`/api/v1${path}?token=${c.token}&role=admin`)
        .set('Authorization', `Bearer ${a.token}`)
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_REQUIRED')
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(
      (await request(app).get('/api/v1/admin').set('Cookie', `sz_admin_sid=${c.token}`))
        .status,
    ).toBe(401)
    expect(
      (
        await request(app)
          .get('/api/v1/customer')
          .set('Cookie', `sz_customer_sid=${c.token}; sz_customer_sid=${c.token}`)
      ).status,
    ).toBe(401)
    expect(lines.join('')).not.toContain(c.token)
    expect(lines.join('')).not.toContain(a.token)
  })
  it.each(['customer', 'admin'])(
    'sets and clears host-only %s cookie with matching secure attributes',
    async (kind) => {
      const { app } = httpFixture({
        ...options,
        appEnvironment: 'production',
        apiOrigin: 'https://api.example.test',
        sameSite: 'strict',
      })
      const response = await request(app)
        .get(`/api/v1/cookie/${kind}`)
        .set('X-Forwarded-Proto', 'http')
      const cookie = String(response.headers['set-cookie'])
      expect(cookie).toContain(`sz_${kind}_sid=`)
      for (const part of [
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
        'Max-Age=60',
        'Expires=',
      ])
        expect(cookie).toContain(part)
      expect(cookie).not.toMatch(/Domain=/i)
      expect(cookie).not.toContain(
        kind === 'customer' ? 'sz_admin_sid' : 'sz_customer_sid',
      )
      const cleared = String(
        (await request(app).get(`/api/v1/clear/${kind}`)).headers['set-cookie'],
      )
      expect(cleared).toContain(`sz_${kind}_sid=;`)
      for (const part of [
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
        'Expires=Thu, 01 Jan 1970',
      ])
        expect(cleared).toContain(part)
      expect(cleared).not.toMatch(/Domain=|Max-Age=/i)
    },
  )
  it('permits only configured loopback HTTP testing exception and does not expose real auth routes', async () => {
    const { app } = httpFixture()
    const cookie = String(
      (await request(app).get('/api/v1/cookie/customer')).headers['set-cookie'],
    )
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
    expect((await request(createApp()).post('/api/v1/auth/login').send({})).status).toBe(
      404,
    )
  })
})

import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/collection-validators.js'
import { createIdentityModels } from '../../src/modules/auth/models.js'
import { createSessionService } from '../../src/modules/auth/sessions.js'
import {
  createBrowserSecurity,
  readContextCookie,
  type BrowserAudience,
} from '../../src/modules/auth/browser-security.js'
import {
  browserSecurityRoutes,
  requireGuestCsrf,
} from '../../src/modules/auth/browser-routes.js'
import { respond } from '../../src/shared/responses.js'
import { isolatedDatabase } from '../support/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let app: ReturnType<typeof createApp>
let time = Date.now()
const clock = () => new Date(time)
const origins = {
  storefront: 'http://localhost:3000',
  admin: 'http://localhost:5173',
}
let mutations = 0
const syntheticGuest = {
  refresh: async () => ({
    csrfToken: 'g'.repeat(43),
    expiresAt: new Date(time + 60000),
  }),
  verify: async (cookie: string | undefined, csrf: string | undefined) =>
    cookie === 'g'.repeat(43) && csrf === 'g'.repeat(43),
}
async function bootstrap(
  audience: BrowserAudience = 'storefront',
  cookie?: string,
  query = '',
) {
  let req = request(app)
    .get(`/api/v1/${audience === 'admin' ? 'admin/' : ''}auth/csrf${query}`)
    .set('Origin', origins[audience])
  if (cookie) req = req.set('Cookie', cookie)
  const response = await req.expect(200)
  return {
    response,
    cookie: response.headers['set-cookie']?.[0]?.split(';')[0] as
      | string
      | undefined,
    csrf: response.body.data.csrfToken as string,
  }
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await fixture.connection.db
    ?.admin()
    .command({ setParameter: 1, ttlMonitorEnabled: false })
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  sessions = createSessionService(
    fixture.connection,
    models,
    {
      secret: randomBytes(32).toString('hex'),
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'http://localhost:4000',
    },
    clock,
  )
  security = createBrowserSecurity(
    fixture.connection,
    models,
    sessions,
    {
      secret: randomBytes(32).toString('hex'),
      contextTtlSeconds: 120,
      storefrontOrigin: origins.storefront,
      adminOrigin: origins.admin,
    },
    clock,
  )
  const router = Router()
  router.use(browserSecurityRoutes(security, sessions, syntheticGuest))
  for (const audience of ['storefront', 'admin'] as const) {
    router.options(`/${audience}/mutation`, security.cors(audience))
    router.post(
      `/${audience}/mutation`,
      security.cors(audience),
      security.require(audience, 'context'),
      (_req, res) => {
        mutations++
        respond(res, { ok: true })
      },
    )
  }
  router.post(
    '/customer/mutation',
    security.require('storefront', 'customer'),
    (_req, res) => {
      mutations++
      respond(res, { ok: true })
    },
  )
  router.post(
    '/checkout/fixture',
    security.require('storefront', 'customer-or-context'),
    (_req, res) => {
      mutations++
      respond(res, { ok: true })
    },
  )
  router.post(
    '/guest/fixture',
    requireGuestCsrf(security, syntheticGuest),
    (_req, res) => {
      mutations++
      respond(res, { ok: true })
    },
  )
  router.all(
    '/method/fixture',
    security.require('storefront', 'context'),
    (_req, res) => {
      mutations++
      respond(res, { ok: true })
    },
  )
  // Explicit provider fixture is outside browser middleware, not a payment verification implementation.
  router.post('/provider/fixture', (_req, res) =>
    respond(res, { browserContextIssued: false }),
  )
  app = createApp({ apiRouter: router })
})
beforeEach(() => {
  time = Date.now()
  mutations = 0
})
afterAll(async () => {
  await fixture?.close()
})

describe('real MongoDB browser security boundary', () => {
  it.each(['storefront', 'admin'] as const)(
    'bootstraps isolated %s contexts, hashes at rest and emits no-store host-only cookies',
    async (audience) => {
      const { response, cookie, csrf } = await bootstrap(audience)
      expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(response.body.data.expiresAt).toBe(
        new Date(time + 120000).toISOString(),
      )
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['access-control-allow-origin']).toBe(
        origins[audience],
      )
      expect(response.headers['access-control-allow-credentials']).toBe('true')
      expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly')
      expect(response.headers['set-cookie']?.[0]).not.toContain('Domain=')
      const record = await models.contexts
        .findOne({ audience, expiresAt: new Date(time + 120000) })
        .select('+contextTokenHash +csrfSecretHash')
      expect(JSON.stringify(record)).not.toContain(csrf)
      expect(JSON.stringify(record)).not.toContain(
        readContextCookie(cookie, audience),
      )
      await request(app)
        .post(`/api/v1/${audience}/mutation`)
        .set('Origin', origins[audience])
        .set('Cookie', cookie ?? '')
        .set('X-CSRF-Token', csrf)
        .expect(200)
      expect(mutations).toBe(1)
    },
  )
  it.each([
    undefined,
    'null',
    'https://evil.example',
    'http://localhost:3000.evil.example',
    'http://localhost:3000/',
    origins.admin,
  ])(
    'rejects invalid storefront mutation Origin %s without side effects',
    async (origin) => {
      const context = await bootstrap()
      let req = request(app)
        .post('/api/v1/storefront/mutation')
        .set('Cookie', context.cookie ?? '')
        .set('X-CSRF-Token', context.csrf)
      if (origin) req = req.set('Origin', origin)
      const response = await req.expect(403)
      expect(response.body.error.code).toBe('CSRF_INVALID')
      expect(mutations).toBe(0)
    },
  )
  it('rejects missing Origin on bootstrap and opposite-origin admin bootstrap', async () => {
    await request(app).get('/api/v1/auth/csrf').expect(403)
    await request(app)
      .get('/api/v1/admin/auth/csrf')
      .set('Origin', origins.storefront)
      .expect(403)
  })
  it.each(['', 'x', 'x'.repeat(43), 'x'.repeat(129)])(
    'rejects missing/malformed/unbound CSRF %s',
    async (csrf) => {
      const context = await bootstrap()
      await request(app)
        .post('/api/v1/storefront/mutation')
        .set('Origin', origins.storefront)
        .set('Cookie', context.cookie ?? '')
        .set('X-CSRF-Token', csrf)
        .expect(403)
      expect(mutations).toBe(0)
    },
  )
  it('rejects missing/duplicate cookies, swapped context tokens and cross audience', async () => {
    const a = await bootstrap(),
      b = await bootstrap(),
      admin = await bootstrap('admin')
    for (const cookie of [
      '',
      `${a.cookie}; ${a.cookie}`,
      b.cookie ?? '',
      admin.cookie ?? '',
    ])
      await request(app)
        .post('/api/v1/storefront/mutation')
        .set('Origin', origins.storefront)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', a.csrf)
        .expect(403)
    expect(mutations).toBe(0)
  })
  it('rotates context on bootstrap and denies retained expired records before TTL cleanup', async () => {
    const a = await bootstrap(),
      b = await bootstrap('storefront', a.cookie)
    expect(
      await security.verifyContext(
        'storefront',
        readContextCookie(a.cookie, 'storefront'),
        a.csrf,
      ),
    ).toBe(false)
    expect(
      await security.verifyContext(
        'storefront',
        readContextCookie(b.cookie, 'storefront'),
        b.csrf,
      ),
    ).toBe(true)
    time += 120000
    expect(
      await security.verifyContext(
        'storefront',
        readContextCookie(b.cookie, 'storefront'),
        b.csrf,
      ),
    ).toBe(false)
    expect(await models.contexts.countDocuments()).toBeGreaterThan(0)
  })
  it('consumes context once under concurrent exchange and preserves effect atomicity', async () => {
    const a = await bootstrap(),
      token = readContextCookie(a.cookie, 'storefront') ?? ''
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        security.consumeContext(
          'storefront',
          token,
          a.csrf,
          async (session) => {
            await models.users.create(
              [
                {
                  emailNormalized: `fixture_${randomUUID()}@example.test`,
                  name: 'Synthetic',
                  passwordHash: 'synthetic_hash',
                  role: 'customer',
                },
              ],
              { session },
            )
            return true
          },
        ),
      ),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await security.verifyContext('storefront', token, a.csrf)).toBe(
      false,
    )
  })
  it('rolls back consumption when its durable effect fails', async () => {
    const a = await bootstrap(),
      token = readContextCookie(a.cookie, 'storefront') ?? ''
    await expect(
      security.consumeContext('storefront', token, a.csrf, async (session) => {
        await models.users.create(
          [
            {
              emailNormalized: 'rollback_browser@example.test',
              name: 'Synthetic',
              passwordHash: 'synthetic_hash',
              role: 'customer',
            },
          ],
          { session },
        )
        throw new Error('Synthetic failure')
      }),
    ).rejects.toThrow('Synthetic failure')
    expect(
      await models.users.exists({
        emailNormalized: 'rollback_browser@example.test',
      }),
    ).toBeNull()
    expect(await security.verifyContext('storefront', token, a.csrf)).toBe(true)
  })
  it('rejects expired and wrong-token exchanges without executing an effect', async () => {
    const a = await bootstrap(),
      token = readContextCookie(a.cookie, 'storefront') ?? ''
    let executed = false
    const effect = async () => {
      executed = true
    }
    await expect(
      security.consumeContext('admin', token, a.csrf, effect),
    ).rejects.toMatchObject({ code: 'CSRF_INVALID' })
    time += 120000
    await expect(
      security.consumeContext('storefront', token, a.csrf, effect),
    ).rejects.toMatchObject({ code: 'CSRF_INVALID' })
    expect(executed).toBe(false)
  })
  it('refreshes session-bound CSRF, invalidates old material and rejects rotated/expired session tokens', async () => {
    const user = await new models.users({
      emailNormalized: `fixture_${randomUUID()}@example.test`,
      name: 'Synthetic',
      passwordHash: 'synthetic_hash',
      role: 'customer',
    }).save()
    const first = await sessions.issue('customer', user._id),
      cookie = `sz_customer_sid=${first.token}`
    const next = await bootstrap('storefront', cookie)
    expect(next.cookie).toBeUndefined()
    await request(app)
      .post('/api/v1/customer/mutation')
      .set('Origin', origins.storefront)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', first.csrfToken)
      .expect(403)
    await request(app)
      .post('/api/v1/customer/mutation')
      .set('Origin', origins.storefront)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', next.csrf)
      .expect(200)
    await sessions.rotate('customer', first.token)
    await request(app)
      .post('/api/v1/customer/mutation')
      .set('Origin', origins.storefront)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', next.csrf)
      .expect(403)
    time += 600000
    await request(app)
      .get('/api/v1/auth/csrf')
      .set('Origin', origins.storefront)
      .set('Cookie', cookie)
      .expect(401)
  })
  it('does not downgrade invalid session credentials into anonymous checkout', async () => {
    const a = await bootstrap()
    await request(app)
      .post('/api/v1/checkout/fixture')
      .set('Origin', origins.storefront)
      .set('Cookie', `${a.cookie}; sz_customer_sid=invalid`)
      .set('X-CSRF-Token', a.csrf)
      .expect(403)
    expect(mutations).toBe(0)
  })
  it('allows a narrow credentialed preflight and denies wildcard/unapproved headers and methods', async () => {
    const response = await request(app)
      .options('/api/v1/storefront/mutation')
      .set('Origin', origins.storefront)
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'Content-Type,X-CSRF-Token,If-Match,Idempotency-Key',
      )
      .expect(204)
    expect(response.headers['access-control-allow-origin']).toBe(
      origins.storefront,
    )
    expect(response.headers.vary).toContain('Origin')
    for (const [method, headers] of [
      ['TRACE', 'x-csrf-token'],
      ['POST', 'authorization'],
      ['POST', '*'],
    ])
      await request(app)
        .options('/api/v1/storefront/mutation')
        .set('Origin', origins.storefront)
        .set('Access-Control-Request-Method', method ?? '')
        .set('Access-Control-Request-Headers', headers ?? '')
        .expect(403)
  })
  it('rejects invalid namespace/query selection and separates guest adapter from customer context', async () => {
    for (const query of [
      '?sessionKind=admin',
      '?sessionKind=customer&sessionKind=context',
      '?role=admin',
    ])
      await request(app)
        .get(`/api/v1/auth/csrf${query}`)
        .set('Origin', origins.storefront)
        .expect(400)
    await request(app)
      .get('/api/v1/admin/auth/csrf?sessionKind=customer')
      .set('Origin', origins.admin)
      .expect(400)
    const guest = await bootstrap(
      'storefront',
      `sz_guest_order_sid=${'g'.repeat(43)}`,
      '?sessionKind=guest',
    )
    expect(guest.csrf).toBe('g'.repeat(43))
    const a = await bootstrap()
    await request(app)
      .post('/api/v1/guest/fixture')
      .set('Origin', origins.storefront)
      .set('Cookie', a.cookie ?? '')
      .set('X-CSRF-Token', a.csrf)
      .expect(403)
    await request(app)
      .post('/api/v1/guest/fixture')
      .set('Origin', origins.admin)
      .set('Cookie', `sz_guest_order_sid=${'g'.repeat(43)}`)
      .set('X-CSRF-Token', guest.csrf)
      .expect(403)
  })
  it.each(['put', 'patch', 'delete'] as const)(
    'requires CSRF on %s and performs no rejected mutation',
    async (method) => {
      const a = await bootstrap()
      await request(app)
        [method]('/api/v1/method/fixture')
        .set('Origin', origins.storefront)
        .set('Cookie', a.cookie ?? '')
        .expect(403)
      expect(mutations).toBe(0)
      await request(app)
        [method]('/api/v1/method/fixture')
        .set('Origin', origins.storefront)
        .set('Cookie', a.cookie ?? '')
        .set('X-CSRF-Token', a.csrf)
        .expect(200)
      expect(mutations).toBe(1)
    },
  )
  it('can bootstrap admin recovery context with an expired admin cookie', async () => {
    const a = await bootstrap(
      'admin',
      `sz_admin_sid=${'x'.repeat(43)}`,
      '?sessionKind=context',
    )
    expect(
      await security.verifyContext(
        'admin',
        readContextCookie(a.cookie, 'admin'),
        a.csrf,
      ),
    ).toBe(true)
  })
  it('validates admin session CSRF and revocation', async () => {
    const account = await new models.users({
      emailNormalized: `fixture_${randomUUID()}@example.test`,
      name: 'Synthetic',
      passwordHash: 'synthetic_hash',
      role: 'admin',
    }).save()
    const issued = await sessions.issue('admin', account._id)
    const refreshed = await bootstrap('admin', `sz_admin_sid=${issued.token}`)
    expect(
      await sessions.verifyCsrfMaterial(
        'admin',
        issued.token,
        issued.csrfToken,
      ),
    ).toBe(false)
    expect(
      await sessions.verifyCsrfMaterial('admin', issued.token, refreshed.csrf),
    ).toBe(true)
    await sessions.revokeUser(account._id, 'admin')
    expect(
      await sessions.verifyCsrfMaterial('admin', issued.token, refreshed.csrf),
    ).toBe(false)
    await request(app)
      .get('/api/v1/admin/auth/csrf')
      .set('Origin', origins.admin)
      .set('Cookie', `sz_admin_sid=${issued.token}`)
      .expect(401)
  })
  it('rejects anonymous context at a session-only boundary and permits guest checkout context', async () => {
    const a = await bootstrap()
    await request(app)
      .post('/api/v1/customer/mutation')
      .set('Origin', origins.storefront)
      .set('Cookie', a.cookie ?? '')
      .set('X-CSRF-Token', a.csrf)
      .expect(403)
    await request(app)
      .post('/api/v1/checkout/fixture')
      .set('Origin', origins.storefront)
      .set('Cookie', a.cookie ?? '')
      .set('X-CSRF-Token', a.csrf)
      .expect(200)
    expect(mutations).toBe(1)
  })
  it('requires exact guest credential namespace and token, even with other valid contexts', async () => {
    await request(app)
      .get('/api/v1/auth/csrf?sessionKind=guest')
      .set('Origin', origins.storefront)
      .expect(401)
    await request(app)
      .post('/api/v1/guest/fixture')
      .set('Origin', origins.storefront)
      .set('Cookie', `sz_guest_order_sid=${'g'.repeat(43)}`)
      .set('X-CSRF-Token', 'g'.repeat(43))
      .expect(200)
    await request(app)
      .post('/api/v1/guest/fixture')
      .set('Origin', origins.storefront)
      .set(
        'Cookie',
        `sz_guest_order_sid=${'g'.repeat(43)}; sz_guest_order_sid=${'g'.repeat(43)}`,
      )
      .set('X-CSRF-Token', 'g'.repeat(43))
      .expect(403)
    expect(mutations).toBe(1)
  })
  it('does not issue cookies or durable contexts on HEAD', async () => {
    const count = await models.contexts.countDocuments()
    const response = await request(app)
      .head('/api/v1/auth/csrf')
      .set('Origin', origins.storefront)
      .expect(204)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(await models.contexts.countDocuments()).toBe(count)
  })
  it('keeps explicitly segregated provider fixtures outside browser context issuance', async () => {
    const response = await request(app)
      .post('/api/v1/provider/fixture')
      .expect(200)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(response.body.data.browserContextIssued).toBe(false)
  })
})

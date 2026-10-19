import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { createServer } from 'node:net'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createIdentityModels } from '../../src/modules/auth/models.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/collection-validators.js'
import { createSessionService } from '../../src/modules/auth/sessions.js'
import { createBrowserSecurity } from '../../src/modules/auth/browser-security.js'
import { browserSecurityRoutes } from '../../src/modules/auth/browser-routes.js'
import { createCustomerService } from '../../src/modules/auth/customer.js'
import { customerRoutes } from '../../src/modules/auth/customer-routes.js'
import {
  createRegistrationNotifications,
  registrationNotificationValidator,
} from '../../src/modules/notifications/registration.js'
import { composeCustomerRoutes } from '../../src/modules/auth/composition.js'
import { loadEnvironment } from '../../src/config/environment.js'
import { startServer } from '../../src/server.js'
import { createLogger } from '../../src/observability/logger.js'
import { testEnvironment } from '../support/environment.js'
import { isolatedDatabase } from '../support/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let notifications: ReturnType<typeof createRegistrationNotifications>
let app: ReturnType<typeof createApp>
let time = Date.now()
const origin = 'http://localhost:3000'
const password = 'synthetic valid password'
const email = () => `synthetic_${randomUUID()}@example.test`
const settings = {
  secret: randomBytes(32).toString('hex'),
  customerTtlSeconds: 600,
  adminTtlSeconds: 300,
  sameSite: 'lax' as const,
  appEnvironment: 'test' as const,
  apiOrigin: 'http://localhost:4000',
}
function makeApp() {
  const router = Router()
  router.use(browserSecurityRoutes(security, sessions))
  router.use(
    customerRoutes(
      createCustomerService(models, sessions, security, notifications),
      security,
      sessions,
    ),
  )
  return createApp({ apiRouter: router })
}
async function context(cookie?: string) {
  let req = request(app)
    .get('/api/v1/auth/csrf?sessionKind=context')
    .set('Origin', origin)
  if (cookie) req = req.set('Cookie', cookie)
  const res = await req.expect(200)
  return {
    cookie: String(res.headers['set-cookie']?.[0]).split(';')[0] ?? '',
    csrf: String(res.body.data.csrfToken),
  }
}
async function post(
  path: string,
  body: object,
  ctx: Awaited<ReturnType<typeof context>>,
  extra = '',
) {
  return request(app)
    .post(`/api/v1/auth/${path}`)
    .set('Origin', origin)
    .set('Cookie', `${ctx.cookie}${extra ? `; ${extra}` : ''}`)
    .set('X-CSRF-Token', ctx.csrf)
    .send(body)
}
async function register(address = email()) {
  const res = await post(
    'register',
    { name: 'Synthetic customer', email: address, password },
    await context(),
  )
  expect(res.status).toBe(201)
  return res.body.data.account as { id: string; email: string }
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  notifications = createRegistrationNotifications(fixture.connection)
  await notifications.initialize()
  sessions = createSessionService(
    fixture.connection,
    models,
    settings,
    () => new Date(time),
  )
  security = createBrowserSecurity(
    fixture.connection,
    models,
    sessions,
    {
      secret: settings.secret,
      contextTtlSeconds: 120,
      storefrontOrigin: origin,
      adminOrigin: 'http://localhost:5173',
    },
    () => new Date(time),
  )
})
beforeEach(() => {
  time = Date.now()
  app = makeApp()
})
afterAll(async () => {
  await fixture?.close()
})

describe('customer credential routes with real MongoDB and adaptive passwords', () => {
  it('registers normalized customer only, persists one secret-free retryable notification and never auto logs in', async () => {
    const address = email(),
      ctx = await context()
    const res = await post(
      'register',
      {
        name: ' Synthetic customer ',
        email: ` ${address.toUpperCase()} `,
        password,
      },
      ctx,
    )
    expect(res.status).toBe(201)
    expect(res.body.data.account.email).toBe(address)
    expect(res.body.data.verificationRequired).toBe(true)
    expect(res.headers['set-cookie']).toBeUndefined()
    const user = await models.users
      .findOne({ emailNormalized: address })
      .select('+passwordHash')
    expect(user?.role).toBe('customer')
    expect(user?.passwordHash).toMatch(/^scrypt\$/)
    const intents = await fixture.connection.db
      ?.collection('notifications')
      .find({ userId: user?._id })
      .toArray()
    expect(intents).toHaveLength(1)
    expect(intents?.[0]).toMatchObject({
      status: 'queued',
      attemptCount: 0,
      eventType: 'registration',
      payload: {},
    })
    expect(JSON.stringify(intents)).not.toContain(password)
    expect(JSON.stringify(res.body)).not.toMatch(
      /passwordHash|securityRevision|tokenHash|role/,
    )
    expect(
      (
        await post(
          'register',
          { name: 'Replay', email: email(), password },
          ctx,
        )
      ).status,
    ).toBe(403)
  })
  it.each([
    { role: 'admin' },
    { status: 'active' },
    { userId: 'a'.repeat(24) },
    { password: 'short' },
  ])('rejects forbidden input %j without writes', async (change) => {
    const address = email()
    const res = await post(
      'register',
      { name: 'Synthetic', email: address, password, ...change },
      await context(),
    )
    expect(res.status).toBe(400)
    expect(await models.users.exists({ emailNormalized: address })).toBeNull()
  })
  it('rejects duplicate normalized email races with one account and one intent', async () => {
    const address = email(),
      contexts = [await context(), await context()]
    const results = await Promise.all(
      contexts.map((ctx) =>
        post('register', { name: 'Synthetic', email: address, password }, ctx),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(
      await models.users.countDocuments({ emailNormalized: address }),
    ).toBe(1)
    const user = await models.users.findOne({ emailNormalized: address })
    expect(
      await fixture.connection.db
        ?.collection('notifications')
        .countDocuments({ userId: user?._id }),
    ).toBe(1)
  })
  it('rolls back account and context consumption when notification persistence fails', async () => {
    const address = email(),
      ctx = await context()
    await fixture.connection.db?.command({
      collMod: 'notifications',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['syntheticImpossibleField'],
        },
      },
    })
    try {
      expect(
        (
          await post(
            'register',
            { name: 'Synthetic', email: address, password },
            ctx,
          )
        ).status,
      ).toBe(500)
      expect(await models.users.exists({ emailNormalized: address })).toBeNull()
    } finally {
      await fixture.connection.db?.command({
        collMod: 'notifications',
        validator: registrationNotificationValidator,
      })
    }
    expect(
      (
        await post(
          'register',
          { name: 'Synthetic', email: address, password },
          ctx,
        )
      ).status,
    ).toBe(201)
  })
  it('logs in, rotates context and predecessor, projects current account and logs out with fresh CSRF', async () => {
    const account = await register(),
      ctx = await context()
    const login = await post('login', { email: account.email, password }, ctx)
    expect(login.status).toBe(200)
    const cookie = String(login.headers['set-cookie']?.[0]).split(';')[0] ?? ''
    expect(cookie).toMatch(/^sz_customer_sid=/)
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly')
    const current = await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(200)
    expect(current.body.data.account.id).toBe(account.id)
    expect(
      (await post('login', { email: account.email, password }, ctx)).status,
    ).toBe(403)
    const next = await post(
      'login',
      { email: account.email, password },
      await context(),
      cookie,
    )
    expect(next.status).toBe(200)
    await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(401)
    const nextCookie =
      String(next.headers['set-cookie']?.[0]).split(';')[0] ?? ''
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', nextCookie)
      .set('X-CSRF-Token', next.body.data.csrfToken)
      .expect(200)
    expect(logout.body.data.revoked).toBe(true)
    expect(String(logout.headers['set-cookie'])).toContain(
      'Expires=Thu, 01 Jan 1970',
    )
    await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', nextCookie)
      .expect(401)
  })
  it.each(['missing', 'wrong', 'suspended', 'admin'] as const)(
    'returns indistinguishable login failure for %s',
    async (kind) => {
      let address = email()
      if (kind !== 'missing') {
        const account = await register(address)
        address = account.email
        if (kind === 'suspended')
          await models.users.updateOne(
            { emailNormalized: address },
            { $set: { status: 'suspended' } },
          )
        if (kind === 'admin')
          await models.users.updateOne(
            { emailNormalized: address },
            { $set: { role: 'admin' } },
          )
      }
      const response = await post(
        'login',
        { email: address, password: kind === 'wrong' ? 'wrong' : password },
        await context(),
      )
      expect(response.status).toBe(401)
      expect(response.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials.',
      })
      expect(response.headers['set-cookie']).toBeUndefined()
    },
  )
  it('permits repeat logout with fresh context despite an expired credential; rejects stale CSRF', async () => {
    const staleCookie = `sz_customer_sid=${'x'.repeat(43)}`
    const ctx = await context(staleCookie)
    const res = await post('logout', {}, ctx, staleCookie)
    expect(res.status).toBe(200)
    expect((await post('logout', {}, ctx, staleCookie)).status).toBe(403)
    const repeatCtx = await context()
    expect((await post('logout', {}, repeatCtx, staleCookie)).status).toBe(200)
  })
  it('blocks forged origin, absent CSRF, body role and admin sessions from customer access', async () => {
    const ctx = await context(),
      address = email()
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'https://evil.example')
      .set('Cookie', ctx.cookie)
      .set('X-CSRF-Token', ctx.csrf)
      .send({ name: 'Synthetic', email: address, password })
      .expect(403)
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ name: 'Synthetic', email: address, password })
      .expect(403)
    expect(await models.users.exists({ emailNormalized: address })).toBeNull()
    await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', `sz_admin_sid=${'x'.repeat(43)}`)
      .expect(401)
  })
  it('limits auth requests before invoking credential work and ignores spoofed forwarded IPs', async () => {
    for (let i = 0; i < 10; i++)
      await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({})
        .expect(403)
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({})
      .expect(429)
  })
  it('commits one concurrent login for one context and rolls back failed session issuance', async () => {
    const account = await register(),
      ctx = await context()
    const result = await Promise.all([
      post('login', { email: account.email, password }, ctx),
      post('login', { email: account.email, password }, ctx),
    ])
    expect(result.map((r) => r.status).sort()).toEqual([200, 403])
    const retained = await context()
    const collection = await fixture.connection.db
      ?.listCollections({ name: 'sessions' }, { nameOnly: false })
      .next()
    if (!collection?.options?.validator)
      throw new Error('Missing session validator')
    await fixture.connection.db?.command({
      collMod: 'sessions',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['syntheticMissingField'],
        },
      },
    })
    try {
      expect(
        (await post('login', { email: account.email, password }, retained))
          .status,
      ).toBe(500)
    } finally {
      await fixture.connection.db?.command({
        collMod: 'sessions',
        validator: collection.options.validator,
      })
    }
    expect(
      (await post('login', { email: account.email, password }, retained))
        .status,
    ).toBe(200)
  })
  it('keeps registration intent unique under retry and validates raw outbox writes', async () => {
    const account = await register(),
      user = await models.users.findById(account.id)
    if (!user) throw new Error('Missing synthetic user')
    await fixture.connection.transaction(async (session) => {
      await notifications.enqueue(
        { userId: user._id, email: user.emailNormalized, name: user.name },
        session,
      )
    })
    expect(
      await fixture.connection.db
        ?.collection('notifications')
        .countDocuments({ userId: user._id }),
    ).toBe(1)
    await expect(
      fixture.connection.db
        ?.collection('notifications')
        .insertOne({ eventKey: 'invalid' }),
    ).rejects.toMatchObject({ code: 121 })
  })
  it('composes enabled production entry point only after validated persistence is ready', async () => {
    const reservation = createServer().listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => reservation.once('listening', resolve))
    const address = reservation.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing test port')
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    )
    const config = loadEnvironment({
      ...testEnvironment(),
      MONGODB_URI: fixture.replica.getUri(),
      MONGODB_DB_NAME: fixture.connection.name,
      SESSION_SECRET: settings.secret,
      CUSTOMER_AUTH_ENABLED: 'true',
      CUSTOMER_SESSION_TTL_SECONDS: '600',
      ADMIN_SESSION_TTL_SECONDS: '300',
      BROWSER_CONTEXT_TTL_SECONDS: '120',
      SESSION_COOKIE_SAME_SITE: 'lax',
      PORT: String(address.port),
    })
    await expect(
      composeCustomerRoutes(fixture.connection, config),
    ).resolves.toBeDefined()
    const runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    try {
      await request(runtime.server)
        .get('/api/v1/auth/csrf')
        .set('Origin', config.STOREFRONT_ORIGIN)
        .expect(200)
    } finally {
      await runtime.close()
    }
    await fixture.connection.db?.collection('notifications').dropIndex('notifications_retry_queue')
    try { await expect(startServer(config, createLogger(config, () => {}))).rejects.toThrow() }
    finally { await notifications.initialize() }
  })
})

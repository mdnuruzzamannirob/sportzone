import { orderReceivedNotificationValidator } from '../../src/modules/notifications/notification.persistence.js'
import { z } from 'zod'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Types } from 'mongoose'
import { Router } from 'express'
import request from 'supertest'
import { isolatedDatabase } from '../helpers/database.js'
import { identityEnvironment } from '../helpers/environment.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { browserSecurityRoutes } from '../../src/modules/auth/sessions/browser-security.routes.js'
import { createAuthQuotaStore } from '../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../src/modules/auth/sessions/auth-throttle.service.js'
import { guestAccessRoutes } from '../../src/modules/auth/guest-access/guest-access.routes.js'
import { guestAccessService } from '../../src/modules/auth/guest-access/guest-access.service.js'
import {
  guestSessionService,
  readGuestCookie,
} from '../../src/modules/auth/guest-access/guest-session.service.js'
import { guestProofDelivery } from '../../src/modules/auth/guest-access/guest-proof-delivery.service.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { createNotificationDeliveryService } from '../../src/modules/notifications/notification-delivery.service.js'
import { orderService, guestOrderAccess } from '../../src/modules/orders/order.service.js'
import { orderModels } from '../../src/modules/orders/order.model.js'
import { initializeOrderPersistence } from '../../src/modules/orders/order.persistence.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { createApp } from '../../src/app.js'
import { composeApplication } from '../../src/setup.js'
import { createLogger } from '../../src/shared/logger.js'
import { createProofEncryption } from '../../src/modules/auth/verification/proof.crypto.js'
import type {
  EmailAdapter,
  EmailMessage,
} from '../../src/modules/notifications/notification.types.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>,
  sessions: ReturnType<typeof createSessionService>,
  security: ReturnType<typeof createBrowserSecurity>
let guestSessions: ReturnType<typeof guestSessionService>,
  proofs: ReturnType<typeof guestAccessService>,
  notifications: ReturnType<typeof createRegistrationNotifications>,
  delivery: ReturnType<typeof guestProofDelivery>
let app: ReturnType<typeof createApp>, now: number
let config: ReturnType<typeof loadEnvironment>
let messages: EmailMessage[]
const clock = () => new Date(now),
  origin = 'https://shop.example.test'
const optionsEnv = () => ({
  ...identityEnvironment(),
  ADMIN_AUTH_ENABLED: 'false',
  PASSWORD_RECOVERY_ENABLED: 'false',
  EMAIL_CHANGE_ENABLED: 'false',
  GUEST_ACCESS_ENABLED: 'true',
  GUEST_ORDER_ACCESS_TTL_SECONDS: '300',
  GUEST_ORDER_ACCESS_COOLDOWN_SECONDS: '60',
  GUEST_ORDER_ACCESS_RESPONSE_FLOOR_MS: '100',
  GUEST_ORDER_SESSION_TTL_SECONDS: '600',
})
const adapter: EmailAdapter = {
  async send(message) {
    messages.push(message)
    return { kind: 'accepted', providerMessageId: `synthetic-${messages.length}` }
  },
}
function worker(custom = adapter, source = delivery) {
  return createNotificationDeliveryService(
    notifications,
    custom,
    { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, claimTtlMs: 1000, batchSize: 10 },
    clock,
    undefined,
    undefined,
    undefined,
    source,
  )
}
function cookieHeaders(headers: unknown) {
  if (
    !Array.isArray(headers) ||
    !headers.every((value): value is string => typeof value === 'string')
  )
    throw new Error('Missing synthetic cookie headers')
  return headers
}
function cookie(headers: unknown, name: string) {
  const value = cookieHeaders(headers).find((value) => value.startsWith(`${name}=`))
  if (!value) throw new Error('Missing synthetic cookie')
  return value.split(';')[0] ?? ''
}
async function context() {
  const result = await request(app)
    .get('/api/v1/auth/csrf?sessionKind=context')
    .set('Origin', origin)
    .expect(200)
  return {
    cookie: cookie(result.headers['set-cookie'], 'sz_browser_ctx'),
    csrf: z.string().parse(result.body.data.csrfToken),
  }
}
async function seed(userId?: string) {
  // Accepted order foundation with synthetic consent authority; guest auth uses real order/identity persistence.
  const proof = syntheticOrderProof({ ...(userId ? { userId } : {}) })
  const result = await inTransaction(db.connection, (session) =>
    orderService(
      db.connection,
      { authorize: async () => proof },
      createAuditWriter(db.connection),
      () => orderTestTime,
    ).create(session, {
      orderId: proof.orderId,
      checkoutIntentId: proof.checkoutIntentId,
      operationKey: `synthetic:${proof.checkoutIntentId}`,
    }),
  )
  return { ...result, email: proof.snapshot.draft.customer.email }
}
async function ask(
  order: { orderNumber: string; email: string },
  browser?: Awaited<ReturnType<typeof context>>,
) {
  const who = browser ?? (await context())
  const result = await request(app)
    .post('/api/v1/guest-access/challenges')
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send({ orderNumber: order.orderNumber, email: order.email })
  return { result, who }
}
function tokenFromEmail(index = messages.length - 1) {
  const token = messages[index]?.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('Missing synthetic proof email')
  return token
}
async function exchange(token: string, previous?: string) {
  const who = await context()
  return request(app)
    .post('/api/v1/guest-access/sessions')
    .set('Origin', origin)
    .set('Cookie', `${who.cookie}${previous ? `; ${previous}` : ''}`)
    .set('X-CSRF-Token', who.csrf)
    .send({ challengeToken: token })
}
async function login(order: Awaited<ReturnType<typeof seed>>) {
  expect((await ask(order)).result.status).toBe(200)
  await worker().runBatch()
  const response = await exchange(tokenFromEmail())
  expect(response.status).toBe(200)
  return {
    response,
    cookie: cookie(response.headers['set-cookie'], 'sz_guest_order_sid'),
    token: tokenFromEmail(),
  }
}
beforeAll(async () => {
  db = await isolatedDatabase()
  now = Date.now()
  config = loadEnvironment(optionsEnv())
  models = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, models)
  await createAuthQuotaStore(db.connection).initialize()
  await initializeOrderPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
  notifications = createRegistrationNotifications(db.connection, clock)
  await notifications.initialize()
  const options = config.identity
  if (!options?.guest) throw new Error('Missing synthetic guest configuration')
  sessions = createSessionService(db.connection, models, options.sessions, clock)
  security = createBrowserSecurity(db.connection, models, sessions, options.browser, clock)
  const orders = guestOrderAccess(db.connection)
  guestSessions = guestSessionService(
    db.connection,
    models,
    options.sessions,
    options.guest.sessionTtlSeconds,
    orders.verify,
    clock,
  )
  proofs = guestAccessService(
    models,
    security,
    guestSessions,
    orders,
    notifications,
    options.guest,
    clock,
  )
  delivery = guestProofDelivery(models, orders, options.guest, clock)
  const throttle = createAuthThrottle(
    createAuthQuotaStore(db.connection),
    config.SESSION_SECRET,
    () => now,
  )
  app = createApp({
    apiRouter: Router().use(
      browserSecurityRoutes(
        security,
        sessions,
        guestSessions,
        throttle.middleware('customer', 'bootstrap'),
      ),
      guestAccessRoutes(proofs, guestSessions, security, throttle.middleware('customer', 'guest')),
    ),
  })
})
beforeEach(async () => {
  now = Date.now()
  messages = []
  for (const model of [models.users, models.sessions, models.challenges, models.contexts])
    await model.collection.deleteMany({})
  for (const name of [
    'orders',
    'orderItemBalances',
    'notifications',
    'auditLogs',
    'authRateLimits',
  ])
    await db.connection.db?.collection(name).deleteMany({})
})
afterAll(async () => {
  await db?.close()
})
it('returns indistinguishable accepted responses for unknown, wrong-email and registered-owned orders with an explicit response floor', async () => {
  const valid = await seed(),
    registered = await seed(new Types.ObjectId().toHexString())
  for (const order of [
    { orderNumber: 'unknown', email: valid.email },
    { ...valid, email: 'wrong@example.test' },
    registered,
    valid,
  ]) {
    const start = performance.now(),
      { result } = await ask(order)
    expect(result.status).toBe(200)
    expect(result.body.data).toEqual({ accepted: true })
    expect(performance.now() - start).toBeGreaterThanOrEqual(90)
    expect(result.body.data).not.toHaveProperty('challengeToken')
  }
  expect(await models.challenges.countDocuments()).toBe(1)
  expect(await models.sessions.countDocuments({ kind: 'guest_order' })).toBe(0)
})
it('delivers a reference-only encrypted proof, exchanges it once and grants only the exact guest order', async () => {
  const order = await seed(),
    foreign = await seed(),
    { response, cookie: authCookie, token } = await login(order)
  expect(response.body.data).toMatchObject({ orderId: order.id })
  expect(response.body.data).not.toHaveProperty('token')
  const header = cookieHeaders(response.headers['set-cookie']).join(';')
  expect(header).toContain('HttpOnly')
  expect(header).toContain('Secure')
  expect(header).toContain('SameSite=Lax')
  expect(header).not.toContain('Domain=')
  expect(
    (await request(app).get('/api/v1/guest-access/session').set('Cookie', authCookie).expect(200))
      .body.data.orderId,
  ).toBe(order.id)
  await expect(
    guestSessions.owned(readGuestCookie(authCookie), foreign.id, async () => true),
  ).rejects.toMatchObject({ code: 'GUEST_PROOF_REQUIRED' })
  await exchange(token).then((result) => expect(result.status).toBe(401))
  const challenge = await models.challenges
    .findOne()
    .select('+deliveryEnvelope +secretHash')
    .orFail()
  expect(challenge.deliveryEnvelope).toBeUndefined()
  expect(challenge.consumedAt).toBeDefined()
  const stored = JSON.stringify(await db.connection.db?.collection('notifications').findOne())
  expect(stored).not.toContain(token)
  expect(stored).not.toContain('ciphertext')
  expect(stored).not.toContain('#token')
  expect(response.headers['cache-control']).toBe('no-store')
})
it('requires approved Origin/context CSRF and rejects invalid bodies, query injection and order-text access', async () => {
  const order = await seed(),
    who = await context(),
    payload = { orderNumber: order.orderNumber, email: order.email }
  await request(app).post('/api/v1/guest-access/challenges').send(payload).expect(403)
  await request(app)
    .post('/api/v1/guest-access/challenges')
    .set('Origin', 'https://foreign.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send(payload)
    .expect(403)
  await request(app)
    .post('/api/v1/guest-access/challenges?admin=true')
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send(payload)
    .expect(400)
  await request(app)
    .post('/api/v1/guest-access/challenges')
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send({ ...payload, orderId: order.id })
    .expect(400)
  await request(app)
    .get('/api/v1/guest-access/session')
    .set('Cookie', `orderNumber=${order.orderNumber}`)
    .expect(401)
  expect(await models.challenges.countDocuments()).toBe(0)
})
it('consumes pre-auth context once and refuses proof-cookie or duplicate-cookie substitution', async () => {
  const order = await seed(),
    browser = await context()
  expect((await ask(order, browser)).result.status).toBe(200)
  expect((await ask(order, browser)).result.status).toBe(403)
  await worker().runBatch()
  const result = await exchange(tokenFromEmail())
  const authCookie = cookie(result.headers['set-cookie'], 'sz_guest_order_sid')
  await request(app)
    .get('/api/v1/guest-access/session')
    .set('Cookie', `${authCookie}; ${authCookie}`)
    .expect(401)
  await request(app)
    .get('/api/v1/guest-access/session')
    .set('Cookie', authCookie.replace('sz_guest_order_sid', 'sz_customer_sid'))
    .expect(401)
})
it('serializes concurrent proof exchange so only one session is created', async () => {
  const order = await seed()
  await ask(order)
  await worker().runBatch()
  const token = tokenFromEmail(),
    outcomes = await Promise.all([exchange(token), exchange(token)])
  expect(outcomes.map((result) => result.status).sort()).toEqual([200, 401])
  expect(await models.sessions.countDocuments({ kind: 'guest_order' })).toBe(1)
})
it('cooldown suppresses duplicates and explicit reissue invalidates the older encrypted proof', async () => {
  const order = await seed()
  await ask(order)
  await worker().runBatch()
  const old = tokenFromEmail()
  await ask(order)
  expect(await models.challenges.countDocuments()).toBe(1)
  now += 61000
  await ask(order)
  await worker().runBatch()
  expect(await models.challenges.countDocuments()).toBe(2)
  expect((await exchange(old)).status).toBe(401)
  expect((await exchange(tokenFromEmail())).status).toBe(200)
  expect(
    await models.challenges.countDocuments({
      invalidatedAt: { $exists: true },
      deliveryEnvelope: { $exists: true },
    }),
  ).toBe(0)
})
it('revokes the previous guest cookie during a new proof exchange without granting its prior order', async () => {
  const a = await seed(),
    b = await seed(),
    first = await login(a)
  await ask(b)
  await worker().runBatch()
  const second = await exchange(tokenFromEmail(), first.cookie)
  expect(second.status).toBe(200)
  expect(second.body.data.orderId).toBe(b.id)
  await request(app).get('/api/v1/guest-access/session').set('Cookie', first.cookie).expect(401)
})
it('enforces expiry independently of TTL and removes expired delivery envelopes without granting access', async () => {
  const order = await seed()
  await ask(order)
  await worker().runBatch()
  const token = tokenFromEmail()
  now += 300000
  expect((await exchange(token)).status).toBe(401)
  const order2 = await seed()
  await ask(order2)
  now += 300000
  await worker().runBatch()
  const last = await models.challenges
    .findOne({ orderId: new Types.ObjectId(order2.id) })
    .select('+deliveryEnvelope')
    .orFail()
  expect(last.deliveryEnvelope).toBeUndefined()
  expect(messages).toHaveLength(1)
})
it('guest session CSRF refresh rotates the verifier and logout durably revokes only the guest credential', async () => {
  const order = await seed(),
    signed = await login(order),
    token = readGuestCookie(signed.cookie),
    oldCsrf = signed.response.body.data.csrfToken
  expect(await guestSessions.verify(token, oldCsrf)).toBe(true)
  const refreshed = await request(app)
    .get('/api/v1/auth/csrf?sessionKind=guest')
    .set('Origin', origin)
    .set('Cookie', signed.cookie)
    .expect(200)
  expect(await guestSessions.verify(token, oldCsrf)).toBe(false)
  expect(await guestSessions.verify(token, refreshed.body.data.csrfToken)).toBe(true)
  const out = await request(app)
    .post('/api/v1/guest-access/logout')
    .set('Origin', origin)
    .set('Cookie', signed.cookie)
    .set('X-CSRF-Token', refreshed.body.data.csrfToken)
    .send({})
    .expect(200)
  expect(out.body.data).toMatchObject({ revoked: true })
  expect(
    cookieHeaders(out.headers['set-cookie']).some((value: string) =>
      value.startsWith('sz_browser_ctx='),
    ),
  ).toBe(true)
  await request(app).get('/api/v1/guest-access/session').set('Cookie', signed.cookie).expect(401)
})
it('rejects expired, revoked and customer/admin session substitutions without extending the guest lifetime', async () => {
  const order = await seed(),
    signed = await login(order),
    original = signed.response.body.data.expiresAt
  await guestSessions.refresh(readGuestCookie(signed.cookie))
  expect(
    (
      await request(app)
        .get('/api/v1/guest-access/session')
        .set('Cookie', signed.cookie)
        .expect(200)
    ).body.data.expiresAt,
  ).toBe(original)
  now += 600000
  await request(app).get('/api/v1/guest-access/session').set('Cookie', signed.cookie).expect(401)
  now = Date.now()
  const user = await models.users.create({
    name: 'Synthetic',
    emailNormalized: 'synthetic-user@example.test',
    passwordHash: 'synthetic_hash',
    role: 'customer',
  })
  const issued = await sessions.issue('customer', user._id)
  await guestSessions.logout(issued.token)
  expect(await sessions.authenticate('customer', issued.token)).toMatchObject({ userId: user._id })
  await request(app)
    .get('/api/v1/guest-access/session')
    .set('Cookie', `sz_guest_order_sid=${issued.token}`)
    .expect(401)
})
it('tampered AEAD or missing decryption keys cannot send a proof, while hash verification needs no decryption', async () => {
  const order = await seed()
  await ask(order)
  const row = await models.challenges.findOne().select('+deliveryEnvelope').orFail()
  if (!row.deliveryEnvelope) throw new Error('Missing synthetic envelope')
  const ciphertext = Buffer.from(row.deliveryEnvelope.ciphertext)
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 1
  await models.challenges.collection.updateOne(
    { _id: row._id },
    { $set: { 'deliveryEnvelope.ciphertext': ciphertext } },
  )
  await worker().runBatch()
  expect(messages).toHaveLength(0)
  expect(await db.connection.db?.collection('notifications').findOne()).toMatchObject({
    status: 'failed',
    lastErrorCode: 'PROOF_UNAVAILABLE',
  })
})
it('fails missing-key delivery closed and preserves legitimate already-delivered proof exchange under key loss', async () => {
  const order = await seed()
  await ask(order)
  await worker().runBatch()
  const token = tokenFromEmail()
  now += 61000
  const another = await seed()
  await ask(another)
  const options = config.identity?.guest
  if (!options) throw new Error('Missing synthetic options')
  const otherKeys = { alternate: randomBytes(32).toString('hex') }
  const missing = guestProofDelivery(
    models,
    guestOrderAccess(db.connection),
    { ...options, encryption: createProofEncryption('alternate', otherKeys) },
    clock,
  )
  await worker(adapter, missing).runBatch()
  expect(messages).toHaveLength(1)
  const withoutOldKey = guestAccessService(
    models,
    security,
    guestSessions,
    guestOrderAccess(db.connection),
    notifications,
    { ...options, encryption: createProofEncryption('alternate', otherKeys) },
    clock,
  )
  const browser = await context()
  expect(
    (
      await withoutOldKey.exchange(
        { challengeToken: token },
        browser.cookie.slice('sz_browser_ctx='.length),
        browser.csrf,
      )
    ).orderId,
  ).toBe(order.id)
})
it('notification failure rolls back challenge issuance, scope revision and browser context consumption', async () => {
  const order = await seed(),
    browser = await context(),
    options = config.identity?.guest
  if (!options) throw new Error('Missing synthetic options')
  const fail = guestAccessService(
    models,
    security,
    guestSessions,
    guestOrderAccess(db.connection),
    {
      ...notifications,
      enqueueGuestAccess: async () => {
        throw new Error('Synthetic outbox failure')
      },
    },
    options,
    clock,
  )
  const token = browser.cookie.slice('sz_browser_ctx='.length)
  await expect(
    fail.request({ orderNumber: order.orderNumber, email: order.email }, token, browser.csrf),
  ).rejects.toThrow('Synthetic outbox failure')
  expect(await models.challenges.countDocuments()).toBe(0)
  expect(
    (await orderModels(db.connection).orders.findById(order.id))?.guestAccessChallengeRevision,
  ).toBe(0)
  expect((await ask(order, browser)).result.status).toBe(200)
})
it('durable guest admission throttles repeated lookup without changing ambiguous success bodies', async () => {
  const browser = await context()
  for (let i = 0; i < 10; i++) {
    const response = await request(app)
      .post('/api/v1/guest-access/challenges')
      .set('Origin', origin)
      .set('Cookie', browser.cookie)
      .set('X-CSRF-Token', browser.csrf)
      .send({ orderNumber: 'unknown', email: 'unknown@example.test' })
    expect(response.status).toBe(i === 0 ? 200 : 403)
  }
  const blocked = await request(app)
    .post('/api/v1/guest-access/challenges')
    .set('Origin', origin)
    .set('Cookie', browser.cookie)
    .set('X-CSRF-Token', browser.csrf)
    .send({ orderNumber: 'unknown', email: 'unknown@example.test' })
  expect(blocked.status).toBe(429)
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
})
it('actual root wiring activates guest access explicitly and logs no proof/contact material', async () => {
  const lines: string[] = [],
    active = await composeApplication(
      db.connection,
      config,
      { isReady: async () => true },
      createLogger(config, (line) => lines.push(line)),
    )
  const order = await seed(),
    browser = await request(active).get('/api/v1/auth/csrf').set('Origin', origin).expect(200)
  await request(active)
    .post('/api/v1/guest-access/challenges')
    .set('Origin', origin)
    .set('Cookie', cookie(browser.headers['set-cookie'], 'sz_browser_ctx'))
    .set('X-CSRF-Token', browser.body.data.csrfToken)
    .send({ orderNumber: order.orderNumber, email: order.email })
    .expect(200)
  expect(
    lines.some(
      (line) =>
        line.includes(order.email) ||
        line.includes(order.orderNumber) ||
        line.includes(browser.body.data.csrfToken),
    ),
  ).toBe(false)
  const disabled = loadEnvironment({ ...optionsEnv(), GUEST_ACCESS_ENABLED: 'false' })
  const inactive = await composeApplication(
    db.connection,
    disabled,
    { isReady: async () => true },
    createLogger(disabled, () => {}),
  )
  await request(inactive).post('/api/v1/guest-access/challenges').send({}).expect(404)
})

it('concurrent reissue and consume serialize on the order revision without reviving the old proof', async () => {
  const order = await seed()
  await ask(order)
  await worker().runBatch()
  const old = tokenFromEmail()
  now += 61000
  const [issued, consumed] = await Promise.all([ask(order), exchange(old)])
  expect(issued.result.status).toBe(200)
  expect([200, 401]).toContain(consumed.status)
  expect(
    await models.challenges.countDocuments({
      consumedAt: { $exists: false },
      invalidatedAt: { $exists: false },
    }),
  ).toBe(1)
  expect((await exchange(old)).status).toBe(401)
  await worker().runBatch()
  expect((await exchange(tokenFromEmail())).status).toBe(200)
})
it('session issuance failure rolls back single-use consumption and permits retry with the same proof/context', async () => {
  const order = await seed()
  await ask(order)
  await worker().runBatch()
  const token = tokenFromEmail(),
    browser = await context(),
    options = config.identity?.guest
  if (!options) throw new Error('Missing synthetic options')
  const broken = guestAccessService(
    models,
    security,
    {
      ...guestSessions,
      issueAfterProof: async () => {
        throw new Error('Synthetic session persistence failure')
      },
    },
    guestOrderAccess(db.connection),
    notifications,
    options,
    clock,
  )
  const contextToken = browser.cookie.slice('sz_browser_ctx='.length)
  await expect(
    broken.exchange({ challengeToken: token }, contextToken, browser.csrf),
  ).rejects.toThrow('Synthetic session persistence failure')
  expect((await models.challenges.findOne())?.consumedAt).toBeUndefined()
  expect(await models.sessions.countDocuments({ kind: 'guest_order' })).toBe(0)
  expect(
    (await proofs.exchange({ challengeToken: token }, contextToken, browser.csrf)).orderId,
  ).toBe(order.id)
})
it('uncertain proof delivery is not blindly resent; explicit reissue invalidates its old link', async () => {
  const order = await seed()
  await ask(order)
  const uncertain: EmailAdapter = {
    async send(message) {
      messages.push(message)
      return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
    },
  }
  await worker(uncertain).runBatch()
  const old = tokenFromEmail()
  expect(await db.connection.db?.collection('notifications').findOne()).toMatchObject({
    status: 'delivery_uncertain',
  })
  await worker().runBatch()
  expect(messages).toHaveLength(1)
  now += 61000
  await ask(order)
  await worker().runBatch()
  expect(messages).toHaveLength(2)
  expect((await exchange(old)).status).toBe(401)
  expect((await exchange(tokenFromEmail())).status).toBe(200)
})

it('explicit known-schema migration preserves order receipt events and never dispatches them as guest proofs', async () => {
  const order = await seed()
  await inTransaction(db.connection, (session) =>
    notifications.enqueueOrderReceived(
      { orderId: new Types.ObjectId(order.id), email: order.email, name: 'Synthetic' },
      session,
    ),
  )
  const prior = await db.connection.db
    ?.collection('notifications')
    .findOne({ eventType: 'order_received' })
  await db.connection.db?.command({
    collMod: 'notifications',
    validator: orderReceivedNotificationValidator,
  })
  try {
    await expect(notifications.initialize()).rejects.toThrow('reviewed migration')
  } finally {
    await notifications.migrateFoundation()
  }
  expect(
    (await db.connection.db?.collection('notifications').findOne({ eventType: 'order_received' }))
      ?._id,
  ).toEqual(prior?._id)
  expect((await ask(order)).result.status).toBe(200)
  await worker().runBatch()
  expect(messages).toHaveLength(1)
  expect(
    (await db.connection.db?.collection('notifications').findOne({ eventType: 'order_received' }))
      ?.status,
  ).toBe('queued')
})

import { composeIdentityRoutes } from '../../src/setup.js'
import { loadEnvironment } from '../../src/config/env.js'
import { testEnvironment } from '../helpers/environment.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { browserSecurityRoutes } from '../../src/modules/auth/sessions/browser-security.routes.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createRecoveryService } from '../../src/modules/auth/recovery/password-recovery.service.js'
import { recoveryRoutes } from '../../src/modules/auth/recovery/password-recovery.routes.js'
import {
  createProofEncryption,
  proofHash,
} from '../../src/modules/auth/verification/proof.crypto.js'
import { createResetDelivery } from '../../src/modules/auth/verification/proof-delivery.service.js'
import {
  hashPassword,
  verifyPassword,
} from '../../src/modules/auth/credentials/password.service.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import {
  foundationNotificationValidator,
  registrationNotificationValidator,
} from '../../src/modules/notifications/notification.persistence.js'
import { createNotificationWorker } from '../../src/jobs/send-notifications.job.js'
import type { EmailMessage } from '../../src/modules/notifications/notification.types.js'
import { isolatedDatabase } from '../helpers/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let notifications: ReturnType<typeof createRegistrationNotifications>
let service: ReturnType<typeof createRecoveryService>
let delivery: ReturnType<typeof createResetDelivery>
let app: ReturnType<typeof createApp>
let time = Date.now(),
  initialHash = ''
const clock = () => new Date(time)
const origin = 'https://shop.example.test'
const initialPassword = 'Synthetic initial password',
  newPassword = 'Synthetic changed password'
const options = {
  ttlSeconds: 900,
  cooldownSeconds: 60,
  responseFloorMs: 100,
  storefrontOrigin: origin,
  encryption: createProofEncryption('test', {
    test: randomBytes(32).toString('hex'),
  }),
}
const retry = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  claimTtlMs: 10000,
  batchSize: 10,
}
async function user(
  role: 'customer' | 'admin' = 'customer',
  status: 'active' | 'suspended' = 'active',
) {
  return new models.users({
    name: 'Synthetic',
    emailNormalized: `synthetic_${randomUUID()}@example.test`,
    role,
    status,
    passwordHash: initialHash,
  }).save()
}
async function context() {
  const res = await request(app)
    .get('/api/v1/auth/csrf?sessionKind=context')
    .set('Origin', origin)
    .expect(200)
  return {
    cookie: String(res.headers['set-cookie']?.[0]).split(';')[0] ?? '',
    csrf: String(res.body.data.csrfToken),
  }
}
async function post(path: string, body: object, ctx = context()) {
  const material = await ctx
  return request(app)
    .post(`/api/v1${path}`)
    .set('Origin', origin)
    .set('Cookie', material.cookie)
    .set('X-CSRF-Token', material.csrf)
    .send(body)
}
async function issue(account: Awaited<ReturnType<typeof user>>) {
  time = Math.max(time, Date.now())
  await post('/auth/password-resets', { email: account.emailNormalized }).then((res) =>
    expect(res.status).toBe(200),
  )
  const challenge = await models.challenges
    .findOne({
      userId: account._id,
      invalidatedAt: { $exists: false },
      consumedAt: { $exists: false },
    })
    .select('+deliveryEnvelope +scopeRevisionAtIssue')
  if (!challenge?.deliveryNotificationId) throw new Error('Missing synthetic challenge')
  const message = await delivery.message({
    id: challenge.deliveryNotificationId,
    userId: account._id,
    challengeId: challenge._id,
    recipient: account.emailNormalized,
  })
  const token = message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('Missing synthetic proof')
  return { challenge, token }
}
async function passwordMatches(id: Types.ObjectId, password: string) {
  const row = await models.users.findById(id).select('+passwordHash')
  return verifyPassword(password, row?.passwordHash)
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  notifications = createRegistrationNotifications(fixture.connection, clock)
  await notifications.initialize()
  sessions = createSessionService(
    fixture.connection,
    models,
    {
      secret: randomBytes(32).toString('hex'),
      customerTtlSeconds: 3600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'https://api.example.test',
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
      storefrontOrigin: origin,
      adminOrigin: 'https://admin.example.test',
    },
    clock,
  )
  service = createRecoveryService(
    fixture.connection,
    models,
    sessions,
    security,
    notifications,
    options,
    clock,
  )
  delivery = createResetDelivery(models, options, clock)
  initialHash = await hashPassword(initialPassword)
})
beforeEach(async () => {
  time = Date.now()
  await models.challenges.deleteMany({})
  await models.sessions.deleteMany({})
  await models.contexts.deleteMany({})
  await models.users.deleteMany({})
  await fixture.connection.db?.collection('notifications').deleteMany({})
  const router = Router()
  router.use(browserSecurityRoutes(security, sessions))
  router.use(recoveryRoutes(service, security, sessions))
  app = createApp({ apiRouter: router })
})
afterAll(async () => {
  await fixture?.close()
})
describe('customer password reset/change on replica MongoDB and HTTP', () => {
  it('returns identical ambiguous data for active/missing/suspended/admin and no session', async () => {
    const active = await user(),
      suspended = await user('customer', 'suspended'),
      admin = await user('admin')
    for (const email of [
      active.emailNormalized,
      suspended.emailNormalized,
      admin.emailNormalized,
      'missing@example.test',
    ]) {
      const res = await post('/auth/password-resets', { email })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ accepted: true })
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    expect(await models.challenges.countDocuments()).toBe(1)
    expect(await models.sessions.countDocuments()).toBe(0)
  })
  it('persists only a verifier/envelope and reference-only outbox, with safe normal projections', async () => {
    const account = await user(),
      { token, challenge } = await issue(account)
    const plain = await models.challenges.findById(challenge._id)
    expect(plain?.deliveryEnvelope).toBeUndefined()
    expect(plain?.secretHash).toBeUndefined()
    const raw = await fixture.connection.db
      ?.collection('authChallenges')
      .findOne({ _id: challenge._id })
    const notification = await fixture.connection.db?.collection('notifications').findOne({
      _id: challenge.deliveryNotificationId ?? new Types.ObjectId(),
    })
    expect(raw?.secretHash).toBe(proofHash(token))
    expect(JSON.stringify(raw)).not.toContain(token)
    expect(Object.keys(notification?.payload ?? {})).toEqual(['challengeId'])
    expect(JSON.stringify(notification)).not.toContain(token)
  })
  it('resets once, preserves role/email verification and rejects token replay without creating sessions', async () => {
    const account = await user(),
      old = await sessions.issue('customer', account._id),
      { token, challenge } = await issue(account)
    const res = await post('/auth/password-resets/confirm', {
      token,
      newPassword,
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ reset: true })
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(await passwordMatches(account._id, newPassword)).toBe(true)
    await expect(sessions.authenticate('customer', old.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    const consumed = await models.challenges.findById(challenge._id).select('+deliveryEnvelope')
    expect(consumed?.consumedAt).toBeInstanceOf(Date)
    expect(consumed?.deliveryEnvelope).toBeUndefined()
    expect((await models.users.findById(account._id))?.emailVerifiedAt).toBeUndefined()
    expect((await post('/auth/password-resets/confirm', { token, newPassword })).status).toBe(400)
  })
  it('allows exactly one concurrent consume with different contexts', async () => {
    const { token } = await issue(await user()),
      contexts = [await context(), await context()]
    const results = await Promise.all(
      contexts.map((ctx) =>
        post('/auth/password-resets/confirm', { token, newPassword }, Promise.resolve(ctx)),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 400])
  })
  it('suppresses issuance during cooldown and serializes concurrent reissue', async () => {
    const account = await user(),
      first = await issue(account)
    await post('/auth/password-resets', { email: account.emailNormalized })
    expect(await models.challenges.countDocuments()).toBe(1)
    time += 61000
    const contexts = [await context(), await context()]
    const results = await Promise.all(
      contexts.map((ctx) =>
        post('/auth/password-resets', { email: account.emailNormalized }, Promise.resolve(ctx)),
      ),
    )
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(
      await models.challenges.countDocuments({
        invalidatedAt: { $exists: false },
      }),
    ).toBe(1)
    expect(await models.challenges.countDocuments()).toBe(2)
    expect(
      (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
    expect(
      (
        await post('/auth/password-resets/confirm', {
          token: first.token,
          newPassword,
        })
      ).status,
    ).toBe(400)
  })
  it('refuses expired proofs despite TTL lag and strips expired envelopes before TTL deletion', async () => {
    const { token, challenge } = await issue(await user())
    time += 901000
    expect((await post('/auth/password-resets/confirm', { token, newPassword })).status).toBe(400)
    await delivery.cleanup(10)
    expect(
      (await models.challenges.findById(challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
  })
  it('rejects admin-scoped, suspended and wrong-purpose challenges', async () => {
    for (const kind of ['admin', 'suspended', 'purpose', 'email'] as const) {
      const account = await user(),
        { token, challenge } = await issue(account)
      if (kind === 'admin')
        await models.users.updateOne({ _id: account._id }, { $set: { role: 'admin' } })
      if (kind === 'suspended')
        await models.users.updateOne({ _id: account._id }, { $set: { status: 'suspended' } })
      if (kind === 'email')
        await models.users.updateOne(
          { _id: account._id },
          { $set: { emailNormalized: `changed_${randomUUID()}@example.test` } },
        )
      if (kind === 'purpose')
        await models.challenges.updateOne(
          { _id: challenge._id },
          { $set: { purpose: 'email_verify' } },
        )
      expect((await post('/auth/password-resets/confirm', { token, newPassword })).status).toBe(400)
      expect(await passwordMatches(account._id, initialPassword)).toBe(true)
    }
  })
  it('requires current password and session, rotates cookie/CSRF and revokes other sessions and pending proofs', async () => {
    const account = await user(),
      first = await sessions.issue('customer', account._id),
      other = await sessions.issue('customer', account._id),
      { token } = await issue(account)
    const auth = Promise.resolve({
      cookie: `sz_customer_sid=${first.token}`,
      csrf: first.csrfToken,
    })
    expect(
      (await post('/me/password-change', { currentPassword: 'wrong', newPassword }, auth)).status,
    ).toBe(401)
    const res = await post(
      '/me/password-change',
      { currentPassword: initialPassword, newPassword },
      auth,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.changed).toBe(true)
    expect(res.body.data.csrfToken).not.toBe(first.csrfToken)
    const replacement = String(res.headers['set-cookie']?.[0]).split(';')[0]?.split('=')[1]
    expect((await sessions.authenticate('customer', replacement)).userId.toHexString()).toBe(
      account._id.toHexString(),
    )
    for (const old of [first, other])
      await expect(sessions.authenticate('customer', old.token)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
    expect((await post('/auth/password-resets/confirm', { token, newPassword })).status).toBe(400)
  })
  it('serializes concurrent password changes against one credential version', async () => {
    const account = await user(),
      issued = await sessions.issue('customer', account._id)
    const results = await Promise.all(
      [0, 1].map(() =>
        service.change({ currentPassword: initialPassword, newPassword }, issued.token).then(
          () => 'ok',
          () => 'denied',
        ),
      ),
    )
    expect(results.sort()).toEqual(['denied', 'ok'])
  })
  it('rolls challenge and notification back together on outbox failure', async () => {
    const account = await user()
    const broken = createRecoveryService(
      fixture.connection,
      models,
      sessions,
      security,
      {
        ...notifications,
        enqueuePasswordReset: async () => {
          throw new Error('Synthetic storage failure')
        },
      },
      options,
      clock,
    )
    const ctx = await security.issueContext('storefront')
    await expect(
      broken.request({ email: account.emailNormalized }, ctx.token, ctx.csrfToken),
    ).rejects.toThrow('Synthetic storage failure')
    expect(await models.challenges.countDocuments()).toBe(0)
    expect(await fixture.connection.db?.collection('notifications').countDocuments()).toBe(0)
    expect(
      (await models.users.findById(account._id).select('+challengeRevisions'))?.challengeRevisions
        .password_reset,
    ).toBe(0)
  })
  it('delivers reference-only proof after commit and retries only known rejection with the same link/key', async () => {
    await issue(await user())
    const messages: EmailMessage[] = []
    const worker = createNotificationWorker(
      notifications,
      {
        send: async (message) => {
          messages.push(message)
          return messages.length === 1
            ? { kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' }
            : { kind: 'accepted', providerMessageId: 'synthetic' }
        },
      },
      retry,
      clock,
      delivery,
    )
    await worker.runBatch()
    time += 101
    await worker.runBatch()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(messages[1])
    expect(messages[0]?.text).toContain(`${origin}/reset-password#token=`)
    expect((await fixture.connection.db?.collection('notifications').findOne({}))?.status).toBe(
      'sent',
    )
  })
  it('does not resend uncertain proof delivery and explicit reissue invalidates the old proof', async () => {
    const account = await user(),
      first = await issue(account)
    let sends = 0
    const worker = createNotificationWorker(
      notifications,
      {
        send: async () => {
          sends++
          return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
        },
      },
      retry,
      clock,
      delivery,
    )
    await worker.runBatch()
    time += 10001
    await worker.runBatch()
    expect(sends).toBe(1)
    time += 61000
    await issue(account)
    expect(
      (
        await post('/auth/password-resets/confirm', {
          token: first.token,
          newPassword,
        })
      ).status,
    ).toBe(400)
  })
  for (const failure of [
    'tamper',
    'key-loss',
    'consumed',
    'superseded',
    'expired',
    'scope',
    'destination',
  ] as const)
    it(`does not send ${failure} proof material`, async () => {
      const account = await user(),
        first = await issue(account)
      let resolver = delivery
      if (failure === 'tamper')
        await models.challenges.updateOne(
          { _id: first.challenge._id },
          { $set: { 'deliveryEnvelope.authTag': randomBytes(16) } },
        )
      if (failure === 'key-loss')
        resolver = createResetDelivery(
          models,
          {
            ...options,
            encryption: createProofEncryption('other', {
              other: randomBytes(32).toString('hex'),
            }),
          },
          clock,
        )
      if (failure === 'consumed')
        await post('/auth/password-resets/confirm', {
          token: first.token,
          newPassword,
        })
      if (failure === 'superseded') {
        time += 61000
        await issue(account)
      }
      if (failure === 'expired') time += 901000
      if (failure === 'scope')
        await models.users.updateOne(
          { _id: account._id },
          { $inc: { 'challengeRevisions.password_reset': 1 } },
        )
      if (failure === 'destination')
        await models.users.updateOne(
          { _id: account._id },
          { $set: { emailNormalized: 'other@example.test' } },
        )
      let sends = 0
      await createNotificationWorker(
        notifications,
        {
          send: async () => {
            sends++
            return { kind: 'accepted', providerMessageId: 'synthetic' }
          },
        },
        retry,
        clock,
        resolver,
      ).runBatch()
      expect(sends).toBe(failure === 'superseded' ? 1 : 0)
      expect(
        (await notifications.status(first.challenge.deliveryNotificationId ?? new Types.ObjectId()))
          ?.status,
      ).toBe('failed')
    })
  it('enforces Origin, context/session CSRF, query/unknown-field validation and bounded IP abuse', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/password-resets')
          .send({ email: 'synthetic@example.test' })
      ).status,
    ).toBe(403)
    expect(
      (
        await post('/auth/password-resets', {
          email: 'synthetic@example.test',
          role: 'admin',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await post('/auth/password-resets?email=x', {
          email: 'synthetic@example.test',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await post('/me/password-change', {
          currentPassword: initialPassword,
          newPassword,
        })
      ).status,
    ).toBe(403)
    const statuses: number[] = []
    for (let i = 0; i < 11; i++)
      statuses.push((await post('/auth/password-resets', { email: 'missing@example.test' })).status)
    expect(statuses).toContain(429)
  })
  it('rejects proof-envelope transplant to another principal and keeps candidate password untouched', async () => {
    const first = await issue(await user()),
      account = await user(),
      second = await issue(account)
    const raw = await fixture.connection.db
      ?.collection('authChallenges')
      .findOne({ _id: first.challenge._id })
    await fixture.connection.db
      ?.collection('authChallenges')
      .updateOne(
        { _id: second.challenge._id },
        { $set: { deliveryEnvelope: raw?.deliveryEnvelope } },
      )
    await expect(
      delivery.message({
        id: second.challenge.deliveryNotificationId ?? new Types.ObjectId(),
        userId: account._id,
        challengeId: second.challenge._id,
        recipient: account.emailNormalized,
      }),
    ).rejects.toThrow()
    expect(await passwordMatches(account._id, initialPassword)).toBe(true)
  })
  it('serializes reset against authenticated change without accepting the losing credential', async () => {
    const account = await user(),
      old = await sessions.issue('customer', account._id),
      { token } = await issue(account)
    const ctx = await security.issueContext('storefront')
    const results = await Promise.all([
      service.confirm({ token, newPassword }, ctx.token, ctx.csrfToken).then(
        () => 'reset',
        () => 'denied',
      ),
      service
        .change(
          {
            currentPassword: initialPassword,
            newPassword: 'Synthetic alternate password',
          },
          old.token,
        )
        .then(
          () => 'change',
          () => 'denied',
        ),
    ])
    expect(results.filter((value) => value !== 'denied')).toHaveLength(1)
    expect(
      await passwordMatches(
        account._id,
        results.includes('reset') ? newPassword : 'Synthetic alternate password',
      ),
    ).toBe(true)
  })
  it('serializes reset against reissue so only the current revision can authorize', async () => {
    const account = await user(),
      first = await issue(account)
    time += 61000
    const resetContext = await security.issueContext('storefront'),
      issueContext = await security.issueContext('storefront')
    const results = await Promise.all([
      service
        .confirm({ token: first.token, newPassword }, resetContext.token, resetContext.csrfToken)
        .then(
          () => 'reset',
          () => 'denied',
        ),
      service
        .request({ email: account.emailNormalized }, issueContext.token, issueContext.csrfToken)
        .then(() => 'issued'),
    ])
    expect(results[1]).toBe('issued')
    expect(
      (
        await post('/auth/password-resets/confirm', {
          token: first.token,
          newPassword,
        })
      ).status,
    ).toBe(400)
    expect(
      await models.challenges.findOne({
        userId: account._id,
        consumedAt: { $exists: false },
        invalidatedAt: { $exists: false },
      }),
    ).not.toBeNull()
  })
  it('does not require decryption keys to verify a supplied proof', async () => {
    const account = await user(),
      { token } = await issue(account)
    const missingKeys = createRecoveryService(
      fixture.connection,
      models,
      sessions,
      security,
      notifications,
      {
        ...options,
        encryption: createProofEncryption('other', {
          other: randomBytes(32).toString('hex'),
        }),
      },
      clock,
    )
    const ctx = await security.issueContext('storefront')
    expect(await missingKeys.confirm({ token, newPassword }, ctx.token, ctx.csrfToken)).toEqual({
      reset: true,
    })
    expect(await passwordMatches(account._id, newPassword)).toBe(true)
  })
  it('rolls back password change and session revocation on a transaction failure', async () => {
    const account = await user(),
      old = await sessions.issue('customer', account._id),
      first = await issue(account)
    const broken = createRecoveryService(
      fixture.connection,
      models,
      {
        ...sessions,
        issue: async () => {
          throw new Error('Synthetic session storage failure')
        },
      },
      security,
      notifications,
      options,
      clock,
    )
    await expect(
      broken.change({ currentPassword: initialPassword, newPassword }, old.token),
    ).rejects.toThrow('Synthetic session storage failure')
    expect(await passwordMatches(account._id, initialPassword)).toBe(true)
    expect((await sessions.authenticate('customer', old.token)).userId.toHexString()).toBe(
      account._id.toHexString(),
    )
    const challenge = await models.challenges
      .findById(first.challenge._id)
      .select('+deliveryEnvelope')
    expect(challenge?.invalidatedAt).toBeUndefined()
    expect(challenge?.deliveryEnvelope).toBeDefined()
  })
  it('rejects weak passwords without consuming proof and applies the common issuance response floor', async () => {
    const account = await user(),
      { token } = await issue(account)
    expect(
      (
        await post('/auth/password-resets/confirm', {
          token,
          newPassword: 'short',
        })
      ).status,
    ).toBe(400)
    expect((await post('/auth/password-resets/confirm', { token, newPassword })).status).toBe(200)
    const ctx = await security.issueContext('storefront'),
      started = performance.now()
    expect(
      await service.request({ email: 'missing@example.test' }, ctx.token, ctx.csrfToken),
    ).toEqual({ accepted: true })
    expect(performance.now() - started).toBeGreaterThanOrEqual(95)
  })
  it('activates only configured recovery routes through the real customer composition', async () => {
    const base = {
      ...testEnvironment(),
      CUSTOMER_AUTH_ENABLED: 'true',
      CUSTOMER_SESSION_TTL_SECONDS: '600',
      ADMIN_SESSION_TTL_SECONDS: '300',
      BROWSER_CONTEXT_TTL_SECONDS: '120',
      SESSION_COOKIE_SAME_SITE: 'lax',
      STOREFRONT_ORIGIN: origin,
      CORS_ALLOWED_ORIGINS: `${origin},http://localhost:5173`,
    }
    const disabled = createApp({
      apiRouter: await composeIdentityRoutes(fixture.connection, loadEnvironment(base)),
    })
    expect((await request(disabled).post('/api/v1/auth/password-resets').send({})).status).toBe(404)
    app = createApp({
      apiRouter: await composeIdentityRoutes(
        fixture.connection,
        loadEnvironment({
          ...base,
          PASSWORD_RECOVERY_ENABLED: 'true',
          PASSWORD_RESET_TTL_SECONDS: '900',
          PASSWORD_RESET_COOLDOWN_SECONDS: '60',
          PASSWORD_RESET_RESPONSE_FLOOR_MS: '100',
          AUTH_PROOF_ACTIVE_KEY_VERSION: 'active',
          AUTH_PROOF_KEYS_JSON: JSON.stringify({ active: randomBytes(32).toString('hex') }),
        }),
      ),
    })
    const account = await user()
    expect((await post('/auth/password-resets', { email: account.emailNormalized })).status).toBe(
      200,
    )
    expect(await models.challenges.countDocuments({ userId: account._id })).toBe(1)
  })
  it('migrates the exact P03-009 validator additively without deleting old intent data', async () => {
    const account = await user()
    await inTransaction(fixture.connection, async (session) =>
      notifications.enqueue(
        {
          userId: account._id,
          email: account.emailNormalized,
          name: account.name,
        },
        session,
      ),
    )
    await fixture.connection.db?.command({
      collMod: 'notifications',
      validator: foundationNotificationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
    await expect(notifications.verifyIndexes()).rejects.toThrow()
    await notifications.migrateFoundation()
    await notifications.migrateFoundation()
    await notifications.verifyIndexes()
    expect(
      await fixture.connection.db
        ?.collection('notifications')
        .countDocuments({ eventType: 'registration' }),
    ).toBe(1)
    expect(
      (
        await fixture.connection.db
          ?.listCollections({ name: 'notifications' }, { nameOnly: false })
          .next()
      )?.options?.validator,
    ).toEqual(registrationNotificationValidator)
    await issue(account)
  })
})

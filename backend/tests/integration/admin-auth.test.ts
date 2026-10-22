import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import {
  provisionInitialAdmin,
  initialAdminId,
} from '../../src/modules/auth/credentials/admin-provision.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { browserSecurityRoutes } from '../../src/modules/auth/sessions/browser-security.routes.js'
import { createCustomerService } from '../../src/modules/auth/credentials/credentials.service.js'
import { createRecoveryService } from '../../src/modules/auth/recovery/password-recovery.service.js'
import { adminRoutes } from '../../src/modules/auth/credentials/admin-auth.routes.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import {
  createAdminResetDelivery,
  createResetDelivery,
} from '../../src/modules/auth/verification/proof-delivery.service.js'
import { createProofEncryption } from '../../src/modules/auth/verification/proof.crypto.js'
import {
  hashPassword,
  verifyPassword,
} from '../../src/modules/auth/credentials/password.service.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import {
  emailChangeNotificationValidator,
  registrationNotificationValidator,
} from '../../src/modules/notifications/notification.persistence.js'
import { createNotificationWorker } from '../../src/jobs/send-notifications.job.js'
import type { EmailMessage } from '../../src/modules/notifications/notification.types.js'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>,
  sessions: ReturnType<typeof createSessionService>,
  security: ReturnType<typeof createBrowserSecurity>,
  notifications: ReturnType<typeof createRegistrationNotifications>
let credentials: ReturnType<typeof createCustomerService>,
  recovery: ReturnType<typeof createRecoveryService>,
  customerRecovery: ReturnType<typeof createRecoveryService>,
  delivery: ReturnType<typeof createAdminResetDelivery>
let app: ReturnType<typeof createApp>,
  time = Date.now(),
  encoded = ''
const clock = () => new Date(time),
  origin = 'https://admin.example.test',
  password = 'Synthetic initial password',
  replacement = 'Synthetic replacement password'
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
const email = () => `synthetic_${randomUUID()}@example.test`
async function user(role: 'customer' | 'admin' = 'admin') {
  return new models.users({
    name: 'Synthetic',
    emailNormalized: email(),
    role,
    status: 'active',
    passwordHash: encoded,
  }).save()
}
async function bootstrap() {
  const res = await request(app)
    .get('/api/v1/admin/auth/csrf?sessionKind=context')
    .set('Origin', origin)
    .expect(200)
  return {
    cookie: String(res.headers['set-cookie']?.[0]).split(';')[0] ?? '',
    csrf: String(res.body.data.csrfToken),
  }
}
async function post(path: string, body: object, ctx = bootstrap()) {
  const input = await ctx
  return request(app)
    .post(`/api/v1/admin/auth/${path}`)
    .set('Origin', origin)
    .set('Cookie', input.cookie)
    .set('X-CSRF-Token', input.csrf)
    .send(body)
}
async function issue(account: Awaited<ReturnType<typeof user>>) {
  time = Math.max(time, Date.now())
  expect((await post('password-resets', { email: account.emailNormalized })).status).toBe(200)
  const challenge = await models.challenges.findOne({
    userId: account._id,
    invalidatedAt: { $exists: false },
    consumedAt: { $exists: false },
  })
  if (!challenge?.deliveryNotificationId) throw new Error('Missing synthetic admin challenge')
  const message = await delivery.message({
    id: challenge.deliveryNotificationId,
    userId: account._id,
    challengeId: challenge._id,
    recipient: account.emailNormalized,
  })
  const token = message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('Missing synthetic proof')
  return { token, challenge }
}
function cli(environment: NodeJS.ProcessEnv, input: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/provision-admin.mjs'], {
      env: { ...process.env, ...environment },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Provision CLI timeout'))
    }, 15000)
    child.stdout.on('data', (data) => {
      output += String(data)
    })
    child.stderr.on('data', (data) => {
      output += String(data)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
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
      adminTtlSeconds: 1800,
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
      storefrontOrigin: 'https://shop.example.test',
      adminOrigin: origin,
    },
    clock,
  )
  credentials = createCustomerService(models, sessions, security, notifications, 'admin')
  recovery = createRecoveryService(
    fixture.connection,
    models,
    sessions,
    security,
    notifications,
    options,
    clock,
    'admin',
  )
  customerRecovery = createRecoveryService(
    fixture.connection,
    models,
    sessions,
    security,
    notifications,
    { ...options, storefrontOrigin: 'https://shop.example.test' },
    clock,
  )
  delivery = createAdminResetDelivery(models, options, clock)
  encoded = await hashPassword(password)
})
beforeEach(async () => {
  time = Date.now()
  await models.users.deleteMany({})
  await models.sessions.deleteMany({})
  await models.contexts.deleteMany({})
  await models.challenges.deleteMany({})
  await fixture.connection.db?.collection('notifications').deleteMany({})
  const router = Router()
  router.use(browserSecurityRoutes(security, sessions))
  router.use(adminRoutes(credentials, recovery, security, sessions))
  app = createApp({ apiRouter: router })
})
afterAll(async () => {
  await fixture?.close()
})
describe('private administrator credentials and recovery on real MongoDB/HTTP', () => {
  it('privately provisions once and never upgrades an existing customer or overwrites credentials', async () => {
    const address = email()
    expect(
      await provisionInitialAdmin(fixture.connection, models, {
        name: 'Synthetic owner',
        email: address,
        password,
      }),
    ).toEqual({ provisioned: true })
    const admin = await models.users.findById(initialAdminId()).select('+passwordHash')
    expect(admin?.role).toBe('admin')
    expect(await verifyPassword(password, admin?.passwordHash)).toBe(true)
    await expect(
      provisionInitialAdmin(fixture.connection, models, {
        name: 'Other',
        email: email(),
        password,
      }),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    expect(
      (await models.users.findById(initialAdminId()).select('+passwordHash'))?.passwordHash,
    ).toBe(admin?.passwordHash)
  })
  it('serializes concurrent different-email initial provisioning to one account', async () => {
    const outcomes = await Promise.allSettled(
      [0, 1].map(() =>
        provisionInitialAdmin(fixture.connection, models, {
          name: 'Synthetic',
          email: email(),
          password,
        }),
      ),
    )
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await models.users.countDocuments({ role: 'admin' })).toBe(1)
  })
  it('refuses occupied emails, weak credentials and client role injection without upgrading a customer', async () => {
    const customer = await user('customer')
    await expect(
      provisionInitialAdmin(fixture.connection, models, {
        name: 'Synthetic',
        email: customer.emailNormalized,
        password,
      }),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    await expect(
      provisionInitialAdmin(fixture.connection, models, {
        name: 'Synthetic',
        email: email(),
        password: 'short',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      provisionInitialAdmin(fixture.connection, models, {
        name: 'Synthetic',
        email: email(),
        password,
        role: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect((await models.users.findById(customer._id))?.role).toBe('customer')
    await expect(credentials.register({}, '', '')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect((await post('register', { name: 'Synthetic', email: email(), password })).status).toBe(
      404,
    )
  })
  it('logs in with an admin cookie, safely projects current account and rejects customer-cookie substitution', async () => {
    const account = await user(),
      res = await post('login', {
        email: ` ${account.emailNormalized.toUpperCase()} `,
        password,
      })
    expect(res.status).toBe(200)
    const cookie = String(res.headers['set-cookie']?.[0]).split(';')[0] ?? ''
    expect(cookie).toMatch(/^sz_admin_sid=/)
    expect(res.body.data.account.id).toBe(account._id.toHexString())
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
    expect(
      (await request(app).get('/api/v1/admin/auth/session').set('Cookie', cookie)).status,
    ).toBe(200)
    const customer = await user('customer'),
      issued = await sessions.issue('customer', customer._id)
    expect(
      (
        await request(app)
          .get('/api/v1/admin/auth/session')
          .set('Cookie', `sz_customer_sid=${issued.token}`)
      ).status,
    ).toBe(401)
    await expect(sessions.authenticate('customer', cookie.split('=')[1])).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
  })
  it('keeps wrong-password, missing, customer and suspended admin login failures ambiguous', async () => {
    const admin = await user(),
      customer = await user('customer'),
      suspended = await user()
    await models.users.updateOne({ _id: suspended._id }, { $set: { status: 'suspended' } })
    for (const address of [
      admin.emailNormalized,
      customer.emailNormalized,
      suspended.emailNormalized,
      email(),
    ]) {
      const res = await post('login', {
        email: address,
        password: 'Synthetic incorrect password',
      })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    }
    expect((await post('login', { email: customer.emailNormalized, password })).status).toBe(401)
  })
  it('serializes concurrent login/context reuse and rotates the predecessor session', async () => {
    const admin = await user(),
      ctx = await bootstrap(),
      old = await sessions.issue('admin', admin._id)
    const material = Promise.resolve({
      ...ctx,
      cookie: `${ctx.cookie}; sz_admin_sid=${old.token}`,
    })
    const outcomes = await Promise.all(
      [0, 1].map(() => post('login', { email: admin.emailNormalized, password }, material)),
    )
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 403])
    await expect(sessions.authenticate('admin', old.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
  })
  it('logs out and repeats logout with fresh admin context while preserving customer sessions', async () => {
    const admin = await user(),
      issued = await sessions.issue('admin', admin._id),
      customer = await user('customer'),
      other = await sessions.issue('customer', customer._id)
    const res = await post(
      'logout',
      {},
      Promise.resolve({
        cookie: `sz_admin_sid=${issued.token}`,
        csrf: issued.csrfToken,
      }),
    )
    expect(res.status).toBe(200)
    expect(res.body.data.revoked).toBe(true)
    await expect(sessions.authenticate('admin', issued.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect((await post('logout', {}, bootstrap())).status).toBe(200)
    expect((await sessions.authenticate('customer', other.token)).userId.toHexString()).toBe(
      customer._id.toHexString(),
    )
  })
  it('accepts admin recovery context despite an expired admin cookie, never customer context', async () => {
    const admin = await user(),
      issued = await sessions.issue('admin', admin._id)
    time += 1801000
    const ctx = await bootstrap()
    expect(
      (
        await post(
          'password-resets',
          { email: admin.emailNormalized },
          Promise.resolve({
            ...ctx,
            cookie: `${ctx.cookie}; sz_admin_sid=${issued.token}`,
          }),
        )
      ).status,
    ).toBe(200)
    const wrong = await security.issueContext('storefront')
    await expect(
      recovery.request({ email: admin.emailNormalized }, wrong.token, wrong.csrfToken),
    ).rejects.toMatchObject({ code: 'CSRF_INVALID' })
  })
  it('responds identically to admin/customer/missing recovery lookups and does not log in', async () => {
    const admin = await user(),
      customer = await user('customer')
    for (const address of [admin.emailNormalized, customer.emailNormalized, email()]) {
      const res = await post('password-resets', { email: address })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ accepted: true })
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    expect(await models.challenges.countDocuments()).toBe(1)
    expect(await models.sessions.countDocuments()).toBe(0)
  })
  it('resets once, removes envelope, revokes admin sessions and preserves unrelated customer identity', async () => {
    const admin = await user(),
      old = await sessions.issue('admin', admin._id),
      customer = await user('customer'),
      other = await sessions.issue('customer', customer._id),
      first = await issue(admin)
    expect(
      (
        await post('password-resets/confirm', {
          token: first.token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(200)
    const updated = await models.users.findById(admin._id).select('+passwordHash')
    expect(await verifyPassword(replacement, updated?.passwordHash)).toBe(true)
    await expect(sessions.authenticate('admin', old.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect((await sessions.authenticate('customer', other.token)).userId.toHexString()).toBe(
      customer._id.toHexString(),
    )
    expect(
      (
        await post('password-resets/confirm', {
          token: first.token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(400)
    expect(
      (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
  })
  it('never accepts a customer-issued reset as admin proof even after a private role change', async () => {
    const customer = await user('customer'),
      ctx = await security.issueContext('storefront')
    await customerRecovery.request({ email: customer.emailNormalized }, ctx.token, ctx.csrfToken)
    const challenge = await models.challenges.findOne({ userId: customer._id })
    if (!challenge?.deliveryNotificationId) throw new Error('Missing customer challenge')
    const message = await createResetDelivery(models, options, clock).message({
      id: challenge.deliveryNotificationId,
      userId: customer._id,
      challengeId: challenge._id,
      recipient: customer.emailNormalized,
    })
    const token = message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
    await models.users.updateOne({ _id: customer._id }, { $set: { role: 'admin' } })
    expect(
      (
        await post('password-resets/confirm', {
          token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(400)
    await expect(
      delivery.message({
        id: challenge.deliveryNotificationId,
        userId: customer._id,
        challengeId: challenge._id,
        recipient: customer.emailNormalized,
      }),
    ).rejects.toThrow()
    expect((await models.challenges.findById(challenge._id))?.consumedAt).toBeUndefined()
  })
  it('rejects admin proofs at customer confirmation, expired proofs and concurrent replay', async () => {
    const admin = await user(),
      first = await issue(admin),
      ctx = await security.issueContext('storefront')
    await expect(
      customerRecovery.confirm(
        { token: first.token, newPassword: replacement },
        ctx.token,
        ctx.csrfToken,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    const materials = [await bootstrap(), await bootstrap()]
    const results = await Promise.all(
      materials.map((c) =>
        post(
          'password-resets/confirm',
          { token: first.token, newPassword: replacement },
          Promise.resolve(c),
        ),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 400])
    const second = await issue(await user())
    time += 901000
    expect(
      (
        await post('password-resets/confirm', {
          token: second.token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(400)
  })
  it('serializes admin reissue, preserves cooldown and invalidates the old proof/envelope', async () => {
    const admin = await user(),
      first = await issue(admin)
    await post('password-resets', { email: admin.emailNormalized })
    expect(await models.challenges.countDocuments({ userId: admin._id })).toBe(1)
    time += 61000
    const contexts = [await bootstrap(), await bootstrap()]
    const results = await Promise.all(
      contexts.map((ctx) =>
        post('password-resets', { email: admin.emailNormalized }, Promise.resolve(ctx)),
      ),
    )
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(
      await models.challenges.countDocuments({
        userId: admin._id,
        invalidatedAt: { $exists: false },
      }),
    ).toBe(1)
    expect(
      (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
    expect(
      (
        await post('password-resets/confirm', {
          token: first.token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(400)
  })
  it('rolls failed login issuance back without consuming its admin context', async () => {
    const admin = await user(),
      old = await sessions.issue('admin', admin._id),
      ctx = await security.issueContext('admin')
    const broken = createCustomerService(
      models,
      {
        ...sessions,
        issue: async () => {
          throw new Error('Synthetic issuance failure')
        },
      },
      security,
      notifications,
      'admin',
    )
    await expect(
      broken.login({ email: admin.emailNormalized, password }, ctx.token, ctx.csrfToken, old.token),
    ).rejects.toThrow('Synthetic issuance failure')
    expect((await sessions.authenticate('admin', old.token)).userId.toHexString()).toBe(
      admin._id.toHexString(),
    )
    const result = await credentials.login(
      { email: admin.emailNormalized, password },
      ctx.token,
      ctx.csrfToken,
      old.token,
    )
    expect(result.issued.kind).toBe('admin')
  })
  it('rejects ineligible principals and never leaves an old-password login usable after a concurrent reset', async () => {
    const admin = await user(),
      first = await issue(admin),
      login = await security.issueContext('admin'),
      reset = await security.issueContext('admin')
    const results = await Promise.allSettled([
      credentials.login({ email: admin.emailNormalized, password }, login.token, login.csrfToken),
      recovery.confirm(
        { token: first.token, newPassword: replacement },
        reset.token,
        reset.csrfToken,
      ),
    ])
    expect(results[1]?.status).toBe('fulfilled')
    const attempt = results[0]
    if (attempt?.status === 'fulfilled')
      await expect(
        sessions.authenticate('admin', attempt.value.issued.token),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    const next = await issue(await user())
    await models.users.updateOne({ _id: next.challenge.userId }, { $set: { status: 'suspended' } })
    expect(
      (
        await post('password-resets/confirm', {
          token: next.token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(400)
  })
  it('rolls password/proof/context/session changes back on revocation failure', async () => {
    const admin = await user(),
      old = await sessions.issue('admin', admin._id),
      first = await issue(admin)
    const failure = vi.spyOn(models.sessions, 'updateMany').mockImplementationOnce(() => {
      throw new Error('Synthetic revocation failure')
    })
    try {
      expect(
        (
          await post('password-resets/confirm', {
            token: first.token,
            newPassword: replacement,
          })
        ).status,
      ).toBe(500)
    } finally {
      failure.mockRestore()
    }
    expect((await models.users.findById(admin._id).select('+passwordHash'))?.passwordHash).toBe(
      encoded,
    )
    expect(
      (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeDefined()
    expect((await sessions.authenticate('admin', old.token)).userId.toHexString()).toBe(
      admin._id.toHexString(),
    )
  })
  it('delivers only the admin template/origin and retries a stable reference-only intent', async () => {
    const admin = await user(),
      first = await issue(admin),
      messages: EmailMessage[] = []
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
      undefined,
      undefined,
      delivery,
    )
    await worker.runBatch()
    time += 101
    await worker.runBatch()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(messages[1])
    expect(messages[0]?.text).toContain(`${origin}/reset-password#token=`)
    const notificationId = first.challenge.deliveryNotificationId
    if (!notificationId) throw new Error('Missing notification')
    const row = await fixture.connection.db
      ?.collection('notifications')
      .findOne({ _id: notificationId })
    expect(row?.templateVersion).toBe('admin-password-reset-v1')
    expect(Object.keys(row?.payload ?? {})).toEqual(['challengeId'])
    expect(JSON.stringify(row)).not.toContain(first.token)
  })
  it('does not claim admin delivery in a customer-only worker and stops after uncertainty', async () => {
    await issue(await user())
    let sends = 0
    const adapter = {
      send: async () => {
        sends++
        return {
          kind: 'uncertain' as const,
          code: 'PROVIDER_UNCERTAIN' as const,
        }
      },
    }
    await createNotificationWorker(
      notifications,
      adapter,
      retry,
      clock,
      createResetDelivery(models, options, clock),
    ).runBatch()
    expect(sends).toBe(0)
    const worker = createNotificationWorker(
      notifications,
      adapter,
      retry,
      clock,
      undefined,
      undefined,
      delivery,
    )
    await worker.runBatch()
    time += 10001
    await worker.runBatch()
    expect(sends).toBe(1)
  })
  it('enforces Origin/CSRF, strict input/query and bounded admin abuse controls', async () => {
    expect((await request(app).post('/api/v1/admin/auth/login').send({})).status).toBe(403)
    expect((await post('login', { email: email(), password, role: 'admin' })).status).toBe(400)
    expect((await post('password-resets?x=1', { email: email() })).status).toBe(400)
    const statuses = []
    for (let i = 0; i < 11; i++)
      statuses.push((await post('password-resets', { email: email() })).status)
    expect(statuses).toContain(429)
  })
  it('activates admin credentials independently without exposing customer signup', async () => {
    const base = {
      ...testEnvironment(),
      ADMIN_AUTH_ENABLED: 'true',
      CUSTOMER_SESSION_TTL_SECONDS: '600',
      ADMIN_SESSION_TTL_SECONDS: '300',
      BROWSER_CONTEXT_TTL_SECONDS: '120',
      SESSION_COOKIE_SAME_SITE: 'lax',
      ADMIN_PASSWORD_RESET_TTL_SECONDS: '900',
      ADMIN_PASSWORD_RESET_COOLDOWN_SECONDS: '60',
      ADMIN_PASSWORD_RESET_RESPONSE_FLOOR_MS: '100',
      ADMIN_ORIGIN: origin,
      CORS_ALLOWED_ORIGINS: `http://localhost:3000,${origin}`,
      AUTH_PROOF_ACTIVE_KEY_VERSION: 'active',
      AUTH_PROOF_KEYS_JSON: JSON.stringify({
        active: randomBytes(32).toString('hex'),
      }),
    }
    app = createApp({
      apiRouter: await composeIdentityRoutes(fixture.connection, loadEnvironment(base)),
    })
    const admin = await user()
    expect((await post('login', { email: admin.emailNormalized, password })).status).toBe(200)
    expect((await request(app).post('/api/v1/auth/register').send({})).status).toBe(404)
    expect((await post('register', { email: email(), password })).status).toBe(404)
  })
  it('migrates exact prior email-change validator and preserves existing records', async () => {
    const customer = await user('customer')
    await inTransaction(fixture.connection, async (session) =>
      notifications.enqueue(
        {
          userId: customer._id,
          email: customer.emailNormalized,
          name: customer.name,
        },
        session,
      ),
    )
    await fixture.connection.db?.command({
      collMod: 'notifications',
      validator: emailChangeNotificationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
    await expect(notifications.verifyIndexes()).rejects.toThrow()
    await notifications.migrateFoundation()
    await notifications.migrateFoundation()
    expect(
      await fixture.connection.db
        ?.collection('notifications')
        .countDocuments({ status: 'queued', eventType: 'registration' }),
    ).toBe(1)
    expect(
      (
        await fixture.connection.db
          ?.listCollections({ name: 'notifications' }, { nameOnly: false })
          .next()
      )?.options?.validator,
    ).toEqual(registrationNotificationValidator)
    await issue(await user())
  })
  it('runs the bounded stdin-only compiled provisioning command and refuses replay/oversize/production', async () => {
    const config = {
      ...testEnvironment(),
      ADMIN_AUTH_ENABLED: 'false',
      CUSTOMER_AUTH_ENABLED: 'false',
      PASSWORD_RECOVERY_ENABLED: 'false',
      EMAIL_CHANGE_ENABLED: 'false',
      MONGODB_URI: fixture.replica.getUri(),
      MONGODB_DB_NAME: fixture.connection.name,
    }
    const input = { name: 'Synthetic owner', email: email(), password }
    const first = await cli(config, JSON.stringify(input))
    expect(first.code).toBe(0)
    expect(first.output.trim()).toBe('Initial administrator provisioned.')
    const again = await cli(config, JSON.stringify(input))
    expect(again.code).toBe(1)
    expect(again.output).not.toContain(input.email)
    expect(again.output).not.toContain(password)
    const large = await cli(config, 'x'.repeat(8193))
    expect(large.code).toBe(1)
    const production = await cli(
      {
        ...config,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        API_PUBLIC_ORIGIN: 'https://api.example.test',
        STOREFRONT_ORIGIN: 'https://shop.example.test',
        ADMIN_ORIGIN: origin,
        CORS_ALLOWED_ORIGINS: `https://shop.example.test,${origin}`,
      },
      JSON.stringify(input),
    )
    expect(production.code).toBe(1)
    expect(await models.users.countDocuments({ role: 'admin' })).toBe(1)
  })
})

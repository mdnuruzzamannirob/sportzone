import { createCustomerService } from '../../src/modules/auth/credentials/credentials.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import {
  createSessionService,
  loadSessionOptions,
} from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { browserSecurityRoutes } from '../../src/modules/auth/sessions/browser-security.routes.js'
import { createEmailChangeService } from '../../src/modules/auth/verification/email-change.service.js'
import { emailChangeRoutes } from '../../src/modules/auth/verification/email-change.routes.js'
import { composeIdentityRoutes } from '../../src/setup.js'
import { createRecoveryService } from '../../src/modules/auth/recovery/password-recovery.service.js'
import {
  createProofEncryption,
  proofHash,
} from '../../src/modules/auth/verification/proof.crypto.js'
import {
  createEmailChangeDelivery,
  createResetDelivery,
} from '../../src/modules/auth/verification/proof-delivery.service.js'
import { hashPassword } from '../../src/modules/auth/credentials/password.service.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import {
  passwordResetNotificationValidator,
  registrationNotificationValidator,
} from '../../src/modules/notifications/notification.persistence.js'
import { createNotificationWorker } from '../../src/jobs/send-notifications.job.js'
import type { EmailMessage } from '../../src/modules/notifications/notification.types.js'
import { testEnvironment } from '../helpers/environment.js'
import { isolatedDatabase } from '../helpers/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let notifications: ReturnType<typeof createRegistrationNotifications>
let service: ReturnType<typeof createEmailChangeService>
let recovery: ReturnType<typeof createRecoveryService>
let delivery: ReturnType<typeof createEmailChangeDelivery>
let app: ReturnType<typeof createApp>,
  time = Date.now(),
  passwordHash = ''
const clock = () => new Date(time),
  origin = 'https://shop.example.test',
  password = 'Synthetic initial password'
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
async function account(role: 'customer' | 'admin' = 'customer') {
  const user = await new models.users({
    name: 'Synthetic',
    emailNormalized: email(),
    passwordHash,
    role,
    status: 'active',
  }).save()
  const issued = await sessions.issue(role, user._id)
  return {
    user,
    issued,
    cookie: `${role === 'customer' ? 'sz_customer_sid' : 'sz_admin_sid'}=${issued.token}`,
    csrf: issued.csrfToken,
  }
}
type Account = Awaited<ReturnType<typeof account>>
async function post(path: string, body: object, owner: Account) {
  return request(app)
    .post(`/api/v1/me/email-changes${path}`)
    .set('Origin', origin)
    .set('Cookie', owner.cookie)
    .set('X-CSRF-Token', owner.csrf)
    .send(body)
}
async function issue(owner: Account, target = email()) {
  time = Math.max(time, Date.now())
  const res = await post('', { newEmail: target }, owner)
  expect(res.status).toBe(200)
  const challenge = await models.challenges
    .findOne({
      userId: owner.user._id,
      purpose: 'email_change',
      invalidatedAt: { $exists: false },
      consumedAt: { $exists: false },
    })
    .select('+deliveryEnvelope +scopeRevisionAtIssue')
  if (!challenge?.deliveryNotificationId) throw new Error('Missing synthetic challenge')
  const message = await delivery.message({
    id: challenge.deliveryNotificationId,
    userId: owner.user._id,
    challengeId: challenge._id,
    recipient: target,
  })
  const token = message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('Missing synthetic proof')
  return { target, challenge, token }
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
  service = createEmailChangeService(
    fixture.connection,
    models,
    sessions,
    notifications,
    options,
    clock,
  )
  recovery = createRecoveryService(
    fixture.connection,
    models,
    sessions,
    security,
    notifications,
    options,
    clock,
  )
  delivery = createEmailChangeDelivery(models, options, clock)
  passwordHash = await hashPassword(password)
})
beforeEach(async () => {
  time = Date.now()
  await models.users.deleteMany({})
  await models.sessions.deleteMany({})
  await models.challenges.deleteMany({})
  await models.contexts.deleteMany({})
  await fixture.connection.db?.collection('notifications').deleteMany({})
  const router = Router()
  router.use(browserSecurityRoutes(security, sessions))
  router.use(emailChangeRoutes(service, security, sessions))
  app = createApp({ apiRouter: router })
})
afterAll(async () => {
  await fixture?.close()
})
describe('verified customer email changes with real MongoDB and HTTP', () => {
  it('keeps the current identity until verified and stores only an encrypted challenge and outbox reference', async () => {
    const owner = await account(),
      target = email(),
      first = await issue(owner, target)
    expect((await models.users.findById(owner.user._id))?.emailNormalized).toBe(
      owner.user.emailNormalized,
    )
    const raw = await fixture.connection.db
      ?.collection('authChallenges')
      .findOne({ _id: first.challenge._id })
    const outbox = await fixture.connection.db?.collection('notifications').findOne({
      _id: first.challenge.deliveryNotificationId ?? new Types.ObjectId(),
    })
    expect(raw?.emailNormalized).toBe(owner.user.emailNormalized)
    expect(raw?.targetEmailNormalized).toBe(target)
    expect(raw?.secretHash).toBe(proofHash(first.token, 'email_change'))
    expect(Object.keys(outbox?.payload ?? {})).toEqual(['challengeId'])
    expect(outbox?.recipient.emailNormalized).toBe(target)
    expect(JSON.stringify(raw)).not.toContain(first.token)
    expect(JSON.stringify(outbox)).not.toContain(first.token)
    const safe = await models.challenges.findById(first.challenge._id)
    expect(safe?.deliveryEnvelope).toBeUndefined()
    expect(safe?.secretHash).toBeUndefined()
  })
  it('normalizes the requested target, confirms once, marks verified and revokes all own sessions while preserving account data', async () => {
    const owner = await account(),
      other = await sessions.issue('customer', owner.user._id),
      unrelated = await account(),
      target = email()
    expect((await post('', { newEmail: ` ${target.toUpperCase()} ` }, owner)).status).toBe(200)
    const challenge = await models.challenges.findOne({
      userId: owner.user._id,
      purpose: 'email_change',
    })
    if (!challenge?.deliveryNotificationId) throw new Error('Missing challenge')
    const message = await delivery.message({
      id: challenge.deliveryNotificationId,
      userId: owner.user._id,
      challengeId: challenge._id,
      recipient: target,
    })
    const token = message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
    const res = await post('/confirm', { token }, owner)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      id: owner.user._id.toHexString(),
      name: owner.user.name,
      email: target,
      emailVerified: true,
      status: 'active',
      addresses: [],
    })
    expect(String(res.headers['set-cookie']?.[0])).toMatch(/^sz_customer_sid=;/)
    for (const old of [owner.issued, other])
      await expect(sessions.authenticate('customer', old.token)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
    expect(
      (await sessions.authenticate('customer', unrelated.issued.token)).userId.toHexString(),
    ).toBe(unrelated.user._id.toHexString())
    expect(
      (await models.users.findById(owner.user._id).select('+passwordHash'))?.passwordHash,
    ).toBe(passwordHash)
    const renewed = await sessions.issue('customer', owner.user._id)
    await expect(service.confirm({ token }, renewed.token)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(
      (await models.challenges.findById(challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
  })
  it('returns the same issuance response for occupied destinations and cooldown suppression', async () => {
    const owner = await account(),
      occupied = await account()
    expect((await post('', { newEmail: occupied.user.emailNormalized }, owner)).body.data).toEqual({
      verificationSent: true,
    })
    expect(await models.challenges.countDocuments()).toBe(0)
    await issue(owner)
    expect((await post('', { newEmail: email() }, owner)).body.data).toEqual({
      verificationSent: true,
    })
    expect(await models.challenges.countDocuments()).toBe(1)
    expect((await post('', { newEmail: owner.user.emailNormalized }, owner)).status).toBe(409)
  })
  it('permits exactly one of two customers concurrently claiming the same verified target', async () => {
    const first = await account(),
      second = await account(),
      target = email()
    const a = await issue(first, target),
      b = await issue(second, target)
    const results = await Promise.all([
      post('/confirm', { token: a.token }, first),
      post('/confirm', { token: b.token }, second),
    ])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    expect(await models.users.countDocuments({ emailNormalized: target })).toBe(1)
    const loser =
      results[0]?.status === 409 ? { owner: first, proof: a } : { owner: second, proof: b }
    expect((await models.users.findById(loser.owner.user._id))?.emailNormalized).toBe(
      loser.owner.user.emailNormalized,
    )
    expect(
      (await models.challenges.findById(loser.proof.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeDefined()
    expect(
      (await sessions.authenticate('customer', loser.owner.issued.token)).userId.toHexString(),
    ).toBe(loser.owner.user._id.toHexString())
  })
  it('rolls back when a target is claimed after issuance, without consuming the proof or session', async () => {
    const owner = await account(),
      first = await issue(owner),
      other = await account()
    await models.users.updateOne(
      { _id: other.user._id },
      { $set: { emailNormalized: first.target } },
    )
    expect((await post('/confirm', { token: first.token }, owner)).status).toBe(409)
    const challenge = await models.challenges
      .findById(first.challenge._id)
      .select('+deliveryEnvelope')
    expect(challenge?.consumedAt).toBeUndefined()
    expect(challenge?.deliveryEnvelope).toBeDefined()
    expect((await models.users.findById(owner.user._id))?.emailNormalized).toBe(
      owner.user.emailNormalized,
    )
  })
  it('allows one concurrent consume and invalidates the earlier proof on reissue', async () => {
    const owner = await account(),
      first = await issue(owner)
    time += 61000
    const ctx = await service.request({ newEmail: email() }, owner.issued.token)
    expect(ctx).toEqual({ verificationSent: true })
    expect((await post('/confirm', { token: first.token }, owner)).status).toBe(400)
    expect(
      (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
    const current = await models.challenges.findOne({
      userId: owner.user._id,
      invalidatedAt: { $exists: false },
    })
    if (!current?.deliveryNotificationId || !current.targetEmailNormalized)
      throw new Error('Missing current challenge')
    const message = await delivery.message({
      id: current.deliveryNotificationId,
      userId: owner.user._id,
      challengeId: current._id,
      recipient: current.targetEmailNormalized,
    })
    const token = message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
    const results = await Promise.all(
      [0, 1].map(() =>
        service.confirm({ token }, owner.issued.token).then(
          () => 'ok',
          () => 'denied',
        ),
      ),
    )
    expect(results.sort()).toEqual(['denied', 'ok'])
  })
  it('serializes concurrent reissue to one live scope', async () => {
    const owner = await account()
    await issue(owner)
    time += 61000
    await Promise.all([0, 1].map(() => service.request({ newEmail: email() }, owner.issued.token)))
    expect(
      await models.challenges.countDocuments({
        userId: owner.user._id,
        invalidatedAt: { $exists: false },
      }),
    ).toBe(1)
    expect(await models.challenges.countDocuments({ userId: owner.user._id })).toBe(2)
  })
  it('rejects wrong owner, reset-purpose proof, expired proof and suspended sessions', async () => {
    const owner = await account(),
      other = await account(),
      first = await issue(owner)
    expect((await post('/confirm', { token: first.token }, other)).status).toBe(400)
    const ctx = await security.issueContext('storefront')
    await recovery.request({ email: owner.user.emailNormalized }, ctx.token, ctx.csrfToken)
    const reset = await models.challenges.findOne({
      userId: owner.user._id,
      purpose: 'password_reset',
    })
    if (!reset?.deliveryNotificationId) throw new Error('Missing reset')
    const message = await createResetDelivery(models, options, clock).message({
      id: reset.deliveryNotificationId,
      userId: owner.user._id,
      challengeId: reset._id,
      recipient: owner.user.emailNormalized,
    })
    expect(
      (
        await post(
          '/confirm',
          { token: message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1] },
          owner,
        )
      ).status,
    ).toBe(400)
    time += 901000
    expect((await post('/confirm', { token: first.token }, owner)).status).toBe(400)
    await delivery.cleanup(10)
    expect(
      (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
        ?.deliveryEnvelope,
    ).toBeUndefined()
    await models.users.updateOne({ _id: owner.user._id }, { $set: { status: 'suspended' } })
    expect((await post('', { newEmail: email() }, owner)).status).toBe(403)
  })
  it('rolls issuance back with its scope/envelope when the outbox insert fails', async () => {
    const owner = await account()
    const broken = createEmailChangeService(
      fixture.connection,
      models,
      sessions,
      {
        ...notifications,
        enqueueEmailChange: async () => {
          throw new Error('Synthetic outbox failure')
        },
      },
      options,
      clock,
    )
    await expect(broken.request({ newEmail: email() }, owner.issued.token)).rejects.toThrow(
      'Synthetic outbox failure',
    )
    expect(await models.challenges.countDocuments()).toBe(0)
    expect(await fixture.connection.db?.collection('notifications').countDocuments()).toBe(0)
    expect(
      (await models.users.findById(owner.user._id).select('+challengeRevisions'))
        ?.challengeRevisions.email_change,
    ).toBe(0)
  })
  it('retries confirmed rejection with the same new-address link and event key, without changing identity', async () => {
    const owner = await account(),
      first = await issue(owner),
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
      delivery,
    )
    await worker.runBatch()
    time += 101
    await worker.runBatch()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(messages[1])
    expect(messages[0]?.to).toBe(first.target)
    expect(messages[0]?.text).toContain(`${origin}/account/email-change#token=`)
    expect((await models.users.findById(owner.user._id))?.emailNormalized).toBe(
      owner.user.emailNormalized,
    )
  })
  it('does not resend uncertain email and refuses superseded delivery while accepting its replacement', async () => {
    const owner = await account(),
      first = await issue(owner)
    let calls = 0
    const worker = createNotificationWorker(
      notifications,
      {
        send: async () => {
          calls++
          return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
        },
      },
      retry,
      clock,
      undefined,
      delivery,
    )
    await worker.runBatch()
    time += 10001
    await worker.runBatch()
    expect(calls).toBe(1)
    time += 61000
    await issue(owner)
    await expect(
      delivery.message({
        id: first.challenge.deliveryNotificationId ?? new Types.ObjectId(),
        userId: owner.user._id,
        challengeId: first.challenge._id,
        recipient: first.target,
      }),
    ).rejects.toThrow()
  })
  for (const failure of [
    'target-tamper',
    'key-loss',
    'scope',
    'current-email',
    'expired',
    'consumed',
  ] as const)
    it(`does not send ${failure} email proof`, async () => {
      const owner = await account(),
        first = await issue(owner)
      let resolver = delivery
      if (failure === 'target-tamper')
        await models.challenges.updateOne(
          { _id: first.challenge._id },
          { $set: { targetEmailNormalized: email() } },
        )
      if (failure === 'key-loss')
        resolver = createEmailChangeDelivery(
          models,
          {
            ...options,
            encryption: createProofEncryption('missing', {
              missing: randomBytes(32).toString('hex'),
            }),
          },
          clock,
        )
      if (failure === 'scope')
        await models.users.updateOne(
          { _id: owner.user._id },
          { $inc: { 'challengeRevisions.email_change': 1 } },
        )
      if (failure === 'current-email')
        await models.users.updateOne(
          { _id: owner.user._id },
          { $set: { emailNormalized: email() } },
        )
      if (failure === 'expired') time += 901000
      if (failure === 'consumed')
        expect((await post('/confirm', { token: first.token }, owner)).status).toBe(200)
      let calls = 0
      await createNotificationWorker(
        notifications,
        {
          send: async () => {
            calls++
            return { kind: 'accepted', providerMessageId: 'synthetic' }
          },
        },
        retry,
        clock,
        undefined,
        resolver,
      ).runBatch()
      expect(calls).toBe(0)
      expect(
        (await notifications.status(first.challenge.deliveryNotificationId ?? new Types.ObjectId()))
          ?.status,
      ).toBe('failed')
    })
  it('password change and reset invalidate pending email-change proofs', async () => {
    for (const action of ['change', 'reset'] as const) {
      const owner = await account(),
        first = await issue(owner)
      if (action === 'change')
        await recovery.change(
          {
            currentPassword: password,
            newPassword: 'Synthetic replacement password',
          },
          owner.issued.token,
        )
      else {
        const ctx = await security.issueContext('storefront')
        await recovery.request({ email: owner.user.emailNormalized }, ctx.token, ctx.csrfToken)
        const reset = await models.challenges.findOne({
          userId: owner.user._id,
          purpose: 'password_reset',
        })
        if (!reset?.deliveryNotificationId) throw new Error('Missing reset')
        const message = await createResetDelivery(models, options, clock).message({
          id: reset.deliveryNotificationId,
          userId: owner.user._id,
          challengeId: reset._id,
          recipient: owner.user.emailNormalized,
        })
        const confirm = await security.issueContext('storefront')
        await recovery.confirm(
          {
            token: message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1],
            newPassword: 'Synthetic replacement password',
          },
          confirm.token,
          confirm.csrfToken,
        )
      }
      const renewed = await sessions.issue('customer', owner.user._id)
      await expect(service.confirm({ token: first.token }, renewed.token)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      })
      expect(
        (await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope'))
          ?.deliveryEnvelope,
      ).toBeUndefined()
    }
  })
  it('email confirmation invalidates earlier reset proof and leaves other customer account fields unchanged', async () => {
    const owner = await account(),
      first = await issue(owner),
      ctx = await security.issueContext('storefront')
    await recovery.request({ email: owner.user.emailNormalized }, ctx.token, ctx.csrfToken)
    const reset = await models.challenges.findOne({
      userId: owner.user._id,
      purpose: 'password_reset',
    })
    expect((await models.challenges.findById(first.challenge._id))?.invalidatedAt).toBeUndefined()
    expect((await post('/confirm', { token: first.token }, owner)).status).toBe(200)
    expect(
      (await models.challenges.findById(reset?._id).select('+deliveryEnvelope'))?.invalidatedAt,
    ).toBeInstanceOf(Date)
    expect((await models.users.findById(owner.user._id))?.addresses).toHaveLength(0)
  })
  it('rolls back email, proof and sessions when revocation fails after the identity write', async () => {
    const owner = await account(),
      first = await issue(owner)
    const failure = vi.spyOn(models.sessions, 'updateMany').mockImplementationOnce(() => {
      throw new Error('Synthetic revocation failure')
    })
    try {
      expect((await post('/confirm', { token: first.token }, owner)).status).toBe(500)
    } finally {
      failure.mockRestore()
    }
    expect((await models.users.findById(owner.user._id))?.emailNormalized).toBe(
      owner.user.emailNormalized,
    )
    const proof = await models.challenges.findById(first.challenge._id).select('+deliveryEnvelope')
    expect(proof?.consumedAt).toBeUndefined()
    expect(proof?.deliveryEnvelope).toBeDefined()
    expect((await sessions.authenticate('customer', owner.issued.token)).userId.toHexString()).toBe(
      owner.user._id.toHexString(),
    )
    expect((await post('/confirm', { token: first.token }, owner)).status).toBe(200)
  })
  it('switches login identity only after confirmation and preserves saved address snapshots', async () => {
    const owner = await account(),
      address = {
        id: new Types.ObjectId(),
        recipient: 'Synthetic recipient',
        phone: '01700000000',
        districtKey: 'synthetic',
        areaKey: 'synthetic',
        street: 'Synthetic street',
        isDefault: true,
      }
    await models.users.updateOne({ _id: owner.user._id }, { $push: { addresses: address } })
    const first = await issue(owner),
      before = (await models.users.findById(owner.user._id))?.addresses.toObject()
    expect((await post('/confirm', { token: first.token }, owner)).status).toBe(200)
    expect((await models.users.findById(owner.user._id))?.addresses.toObject()).toEqual(before)
    const auth = createCustomerService(models, sessions, security, notifications),
      ctx = await security.issueContext('storefront')
    await expect(
      auth.login({ email: owner.user.emailNormalized, password }, ctx.token, ctx.csrfToken),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    const next = await security.issueContext('storefront')
    const signedIn = await auth.login({ email: first.target, password }, next.token, next.csrfToken)
    expect(signedIn.account.id).toBe(owner.user._id.toHexString())
    expect(signedIn.account.email).toBe(first.target)
  })
  it('enforces customer-only Origin/session-CSRF and strict query/input limits', async () => {
    const owner = await account(),
      admin = await account('admin')
    expect(
      (await request(app).post('/api/v1/me/email-changes').send({ newEmail: email() })).status,
    ).toBe(403)
    expect((await post('', { newEmail: email() }, admin)).status).toBe(403)
    expect((await post('', { newEmail: email(), role: 'admin' }, owner)).status).toBe(400)
    expect((await post('?x=1', { newEmail: email() }, owner)).status).toBe(400)
    const statuses: number[] = []
    for (let i = 0; i < 11; i++)
      statuses.push((await post('', { newEmail: email() }, owner)).status)
    expect(statuses).toContain(429)
  })
  it('serializes email confirmation with concurrent logout', async () => {
    const owner = await account(),
      first = await issue(owner)
    const result = await Promise.all([
      service.confirm({ token: first.token }, owner.issued.token).then(
        () => 'changed',
        () => 'denied',
      ),
      sessions.logout('customer', owner.issued.token),
    ])
    await expect(sessions.authenticate('customer', owner.issued.token)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    })
    expect((await models.users.findById(owner.user._id))?.emailNormalized).toBe(
      result[0] === 'changed' ? first.target : owner.user.emailNormalized,
    )
  })
  it('serializes email confirmation with concurrent password reset', async () => {
    const owner = await account(),
      first = await issue(owner),
      ctx = await security.issueContext('storefront')
    await recovery.request({ email: owner.user.emailNormalized }, ctx.token, ctx.csrfToken)
    const reset = await models.challenges.findOne({
      userId: owner.user._id,
      purpose: 'password_reset',
    })
    if (!reset?.deliveryNotificationId) throw new Error('Missing reset')
    const message = await createResetDelivery(models, options, clock).message({
      id: reset.deliveryNotificationId,
      userId: owner.user._id,
      challengeId: reset._id,
      recipient: owner.user.emailNormalized,
    })
    const confirm = await security.issueContext('storefront')
    const outcomes = await Promise.all([
      service.confirm({ token: first.token }, owner.issued.token).then(
        () => 'email',
        () => 'denied',
      ),
      recovery
        .confirm(
          {
            token: message.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1],
            newPassword: 'Synthetic replacement password',
          },
          confirm.token,
          confirm.csrfToken,
        )
        .then(
          () => 'reset',
          () => 'denied',
        ),
    ])
    expect(outcomes.filter((value) => value !== 'denied')).toHaveLength(1)
    expect((await models.users.findById(owner.user._id))?.emailNormalized).toBe(
      outcomes.includes('email') ? first.target : owner.user.emailNormalized,
    )
  })
  it('serializes confirmation against reissue without retaining a usable predecessor', async () => {
    const owner = await account(),
      first = await issue(owner)
    time += 61000
    const results = await Promise.allSettled([
      service.confirm({ token: first.token }, owner.issued.token),
      service.request({ newEmail: email() }, owner.issued.token),
    ])
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
    const renewed = await sessions.issue('customer', owner.user._id)
    await expect(service.confirm({ token: first.token }, renewed.token)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(
      await models.challenges.countDocuments({
        userId: owner.user._id,
        purpose: 'email_change',
        invalidatedAt: { $exists: false },
        consumedAt: { $exists: false },
      }),
    ).toBeLessThanOrEqual(1)
  })
  it('supports explicit email-only activation through the customer composition', async () => {
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
    const owner = await account()
    const matching = createSessionService(
      fixture.connection,
      models,
      loadSessionOptions(base),
      clock,
    )
    const issued = await matching.issue('customer', owner.user._id)
    const client = {
      ...owner,
      issued,
      cookie: `sz_customer_sid=${issued.token}`,
      csrf: issued.csrfToken,
    }
    app = disabled
    expect((await post('', { newEmail: email() }, client)).status).toBe(404)
    app = createApp({
      apiRouter: await composeIdentityRoutes(
        fixture.connection,
        loadEnvironment({
          ...base,
          EMAIL_CHANGE_ENABLED: 'true',
          EMAIL_CHANGE_TTL_SECONDS: '900',
          EMAIL_CHANGE_COOLDOWN_SECONDS: '60',
          EMAIL_CHANGE_RESPONSE_FLOOR_MS: '100',
          AUTH_PROOF_ACTIVE_KEY_VERSION: 'active',
          AUTH_PROOF_KEYS_JSON: JSON.stringify({
            active: randomBytes(32).toString('hex'),
          }),
        }),
      ),
    })
    expect((await post('', { newEmail: email() }, client)).status).toBe(200)
    expect(await models.challenges.countDocuments()).toBe(1)
  })
  it('migrates exact password-reset predecessor and preserves its rows while allowing email-change intents', async () => {
    const owner = await account()
    await inTransaction(fixture.connection, async (session) =>
      notifications.enqueue(
        {
          userId: owner.user._id,
          email: owner.user.emailNormalized,
          name: owner.user.name,
        },
        session,
      ),
    )
    await fixture.connection.db?.command({
      collMod: 'notifications',
      validator: passwordResetNotificationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
    await expect(notifications.verifyIndexes()).rejects.toThrow()
    await notifications.migrateFoundation()
    await notifications.migrateFoundation()
    await notifications.verifyIndexes()
    expect(
      (
        await fixture.connection.db
          ?.listCollections({ name: 'notifications' }, { nameOnly: false })
          .next()
      )?.options?.validator,
    ).toEqual(registrationNotificationValidator)
    expect(
      await fixture.connection.db
        ?.collection('notifications')
        .countDocuments({ eventType: 'registration', status: 'queued' }),
    ).toBe(1)
    await issue(owner)
  })
})

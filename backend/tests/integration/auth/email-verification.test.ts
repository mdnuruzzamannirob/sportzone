import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { createIdentityModels } from '../../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../../src/modules/auth/identity.persistence.js'
import { proofHash } from '../../../src/modules/auth/verification/proof.crypto.js'
import {
  refundNotificationValidator,
  registrationNotificationValidator,
} from '../../../src/modules/notifications/notification.persistence.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import type { EmailMessage } from '../../../src/modules/notifications/notification.types.js'
import { composeApplication, composeNotificationWorker } from '../../../src/setup.js'
import { createLogger } from '../../../src/shared/logger.js'
import { isolatedDatabase } from '../../helpers/database.js'
import { identityEnvironment } from '../../helpers/environment.js'

const env = {
  ...identityEnvironment(),
  EMAIL_VERIFICATION_ENABLED: 'true',
  EMAIL_VERIFICATION_TTL_SECONDS: '600',
  EMAIL_VERIFICATION_COOLDOWN_SECONDS: '60',
  EMAIL_VERIFICATION_RESPONSE_FLOOR_MS: '100',
}
const config = loadEnvironment(env)
let database: Awaited<ReturnType<typeof isolatedDatabase>>,
  models: ReturnType<typeof createIdentityModels>,
  app: Awaited<ReturnType<typeof composeApplication>>
const lines: string[] = []
beforeAll(async () => {
  database = await isolatedDatabase()
  models = createIdentityModels(database.connection)
  await initializeIdentityPersistence(database.connection, models)
  await createNotificationService(database.connection).initialize()
  app = await composeApplication(
    database.connection,
    config,
    { isReady: async () => true },
    createLogger(config, (line) => lines.push(line)),
  )
})
beforeEach(async () => {
  lines.length = 0
  for (const collection of [
    'notifications',
    'users',
    'authChallenges',
    'sessions',
    'authRateLimits',
  ])
    await database.connection.db?.collection(collection).deleteMany({})
})
afterAll(async () => {
  await database?.close()
})
const user = (role: 'customer' | 'admin' = 'customer', status: 'active' | 'suspended' = 'active') =>
  models.users.create({
    name: 'Synthetic',
    emailNormalized: `${role}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
    status,
  })
async function context() {
  const result = await request(app)
    .get('/api/v1/auth/csrf?sessionKind=context')
    .set('Origin', config.STOREFRONT_ORIGIN)
    .expect(200)
  return {
    cookie: String(result.headers['set-cookie']?.[0]).split(';')[0] ?? '',
    csrf: result.body.data.csrfToken as string,
  }
}
async function post(path: string, input: object, browser?: Awaited<ReturnType<typeof context>>) {
  browser ??= await context()
  return request(app)
    .post(`/api/v1/auth/email-verifications${path}`)
    .set('Origin', config.STOREFRONT_ORIGIN)
    .set('Cookie', browser.cookie)
    .set('X-CSRF-Token', browser.csrf)
    .send(input)
}
async function deliver() {
  const sent: EmailMessage[] = []
  const worker = await composeNotificationWorker(database.connection, config, {
    adapter: {
      send: async (message) => {
        sent.push(message)
        return { kind: 'accepted', providerMessageId: 'synthetic-verification' }
      },
    },
    settings: {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      claimTtlMs: 10000,
      batchSize: 10,
    },
  })
  await worker.runBatch()
  return sent
}
async function issued() {
  const account = await user()
  expect((await post('', { email: account.emailNormalized })).status).toBe(200)
  const sent = await deliver(),
    token = sent[0]?.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('No verification proof delivered')
  return { account, token, sent }
}
it('delivers purpose-bound encrypted proof through the real worker; confirms once without creating a session or exposing proof in logs', async () => {
  const { account, token, sent } = await issued()
  expect(sent[0]?.subject).toBe('Verify your SportZone email')
  expect(sent[0]?.text).toContain('https://shop.example.test/verify-email#token=')
  expect(await deliver()).toHaveLength(0)
  const challenge = await models.challenges
    .findOne({ purpose: 'email_verify', userId: account._id })
    .select('+secretHash +deliveryEnvelope')
    .orFail()
  expect(challenge.secretHash).toBe(proofHash(token, 'email_verify'))
  expect(challenge.secretHash).not.toBe(proofHash(token, 'password_reset'))
  expect(JSON.stringify(challenge.toObject())).not.toContain(token)
  const result = await post('/confirm', { token })
  expect(result.status).toBe(200)
  expect(result.body.data).toEqual({ verified: true })
  expect(result.headers['set-cookie']).toBeUndefined()
  expect((await models.users.findById(account._id))?.emailVerifiedAt).toBeInstanceOf(Date)
  expect((await post('/confirm', { token })).status).toBe(400)
  expect(await models.sessions.countDocuments({ kind: 'customer' })).toBe(0)
  expect(lines.join('\n')).not.toContain(token)
  expect(
    (await models.challenges.findById(challenge._id).select('+deliveryEnvelope'))?.deliveryEnvelope,
  ).toBeUndefined()
})
it('returns the same ambiguous response for unknown, admin, suspended, verified and cooldown accounts; never resends or extends an existing proof', async () => {
  const account = await user()
  for (const email of ['unknown@example.test', 'customer@example.test', 'customer@example.test']) {
    const result = await post('', { email })
    expect(result.status).toBe(200)
    expect(result.body.data).toEqual({ accepted: true })
  }
  expect(await models.challenges.countDocuments({ purpose: 'email_verify' })).toBe(1)
  await user('admin')
  expect((await post('', { email: 'admin@example.test' })).body.data).toEqual({ accepted: true })
  await models.users.updateOne({ _id: account._id }, { $set: { status: 'suspended' } })
  expect((await post('', { email: 'customer@example.test' })).body.data).toEqual({ accepted: true })
  await models.users.updateOne(
    { _id: account._id },
    { $set: { status: 'active', emailVerifiedAt: new Date() } },
  )
  expect((await post('', { email: 'customer@example.test' })).body.data).toEqual({ accepted: true })
  expect(await models.challenges.countDocuments({ purpose: 'email_verify' })).toBe(1)
})
it('denies CSRF, unknown fields, expired proofs, changed email, suspended users and wrong-purpose tokens', async () => {
  const browser = await context()
  expect(
    (await post('', { email: 'customer@example.test' }, { ...browser, csrf: 'invalid' })).status,
  ).toBe(403)
  expect((await post('', { email: 'customer@example.test', role: 'admin' })).status).toBe(400)
  const { account, token } = await issued()
  const wrong = randomBytes(32).toString('base64url')
  await new models.challenges({
    purpose: 'password_reset',
    userId: account._id,
    emailNormalized: account.emailNormalized,
    secretHash: proofHash(wrong, 'password_reset'),
    scopeRevisionAtIssue: 0,
    expiresAt: new Date(Date.now() + 60000),
  }).save()
  expect((await post('/confirm', { token: wrong })).status).toBe(400)
  await models.users.updateOne(
    { _id: account._id },
    { $set: { emailNormalized: 'changed@example.test' } },
  )
  expect((await post('/confirm', { token })).status).toBe(400)
  await models.users.updateOne(
    { _id: account._id },
    { $set: { emailNormalized: 'customer@example.test', status: 'suspended' } },
  )
  expect((await post('/confirm', { token })).status).toBe(400)
  await models.users.updateOne({ _id: account._id }, { $set: { status: 'active' } })
  await models.challenges.collection.updateOne(
    { purpose: 'email_verify' },
    { $set: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 601000) } },
  )
  expect((await post('/confirm', { token })).status).toBe(400)
  expect((await models.users.findById(account._id))?.emailVerifiedAt).toBeUndefined()
})
it('serializes concurrent confirmation and consumes the exact proof once', async () => {
  const { token } = await issued(),
    a = await context(),
    b = await context()
  const results = await Promise.all([
    post('/confirm', { token }, a),
    post('/confirm', { token }, b),
  ])
  expect(results.map((result) => result.status).sort()).toEqual([200, 400])
  expect(
    await models.challenges.countDocuments({
      purpose: 'email_verify',
      consumedAt: { $exists: true },
    }),
  ).toBe(1)
})
it('upgrades only the exact preceding notification validator and preserves existing intents', async () => {
  const store = createNotificationService(database.connection)
  await database.connection.db?.command({
    collMod: 'notifications',
    validator: refundNotificationValidator,
  })
  await store.migrateFoundation()
  await store.verifyIndexes()
  const { token } = await issued()
  expect((await post('/confirm', { token })).status).toBe(200)
})
it('defaults verification admission off and refuses invalid independent proof configuration', async () => {
  const inactive = loadEnvironment({ ...env, EMAIL_VERIFICATION_ENABLED: 'false' })
  const other = await composeApplication(
    database.connection,
    inactive,
    { isReady: async () => true },
    createLogger(inactive, () => {}),
  )
  await request(other)
    .post('/api/v1/auth/email-verifications')
    .send({ email: 'customer@example.test' })
    .expect(404)
  expect(() => loadEnvironment({ ...env, EMAIL_VERIFICATION_TTL_SECONDS: '0' })).toThrow()
  expect(() => loadEnvironment({ ...env, CUSTOMER_AUTH_ENABLED: 'false' })).toThrow()
})

it('rolls issuance and browser-context consumption back if the durable notification write fails', async () => {
  const account = await user(),
    browser = await context()
  try {
    await database.connection.db?.command({
      collMod: 'notifications',
      validator: { $expr: { $eq: [1, 0] } },
    })
    expect((await post('', { email: account.emailNormalized }, browser)).status).toBe(500)
    expect(await models.challenges.countDocuments({ userId: account._id })).toBe(0)
    expect(
      (await models.users.findById(account._id).select('+challengeRevisions'))?.challengeRevisions
        .email_verify,
    ).toBe(0)
  } finally {
    await database.connection.db?.command({
      collMod: 'notifications',
      validator: registrationNotificationValidator,
    })
  }
  expect((await post('', { email: account.emailNormalized }, browser)).status).toBe(200)
  expect(await models.challenges.countDocuments({ userId: account._id })).toBe(1)
})

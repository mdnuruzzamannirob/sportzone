import { spawnSync } from 'node:child_process'
import request from 'supertest'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { loadEnvironment } from '../../src/config/environment.js'
import {
  composeApplication,
  composeNotificationWorker,
} from '../../src/composition.js'
import { createLogger } from '../../src/observability/logger.js'
import { createIdentityModels } from '../../src/modules/auth/models.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/collection-validators.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/registration.js'
import { hashPassword } from '../../src/modules/auth/passwords.js'
import type { EmailMessage } from '../../src/modules/notifications/email.js'
import { identityEnvironment } from '../support/environment.js'
import { isolatedDatabase } from '../support/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await initializeIdentityPersistence(
    fixture.connection,
    createIdentityModels(fixture.connection),
  )
  await createRegistrationNotifications(fixture.connection).initialize()
}, 120000)
afterAll(async () => {
  await fixture?.close()
})
it('shares typed proof policy across actual HTTP issuance and the notification worker without re-reading raw config', async () => {
  const validated = loadEnvironment(identityEnvironment())
  const config = {
    ...validated,
    AUTH_PROOF_KEYS_JSON: 'invalid',
    CUSTOMER_SESSION_TTL_SECONDS: 'invalid',
    BROWSER_CONTEXT_TTL_SECONDS: 'invalid',
  }
  const lines: string[] = []
  const app = await composeApplication(
    fixture.connection,
    config,
    { isReady: async () => true },
    createLogger(config, (line) => lines.push(line)),
  )
  const models = createIdentityModels(fixture.connection)
  await models.users.create({
    name: 'Synthetic',
    emailNormalized: 'customer@example.test',
    passwordHash: await hashPassword('Synthetic initial password'),
    role: 'customer',
  })
  const context = await request(app)
    .get('/api/v1/auth/csrf?sessionKind=context')
    .set('Origin', config.STOREFRONT_ORIGIN)
    .expect(200)
  await request(app)
    .post('/api/v1/auth/password-resets')
    .set('Origin', config.STOREFRONT_ORIGIN)
    .set(
      'Cookie',
      String(context.headers['set-cookie']?.[0]).split(';')[0] ?? '',
    )
    .set('X-CSRF-Token', context.body.data.csrfToken)
    .send({ email: 'customer@example.test' })
    .expect(200)
  const sent: EmailMessage[] = []
  const worker = await composeNotificationWorker(fixture.connection, config, {
    adapter: {
      send: async (message) => {
        sent.push(message)
        return { kind: 'accepted', providerMessageId: 'synthetic' }
      },
    },
    settings: {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      claimTtlMs: 10000,
      batchSize: 5,
    },
  })
  expect(await worker.runBatch()).toEqual({ processed: 1 })
  expect(await worker.runBatch()).toEqual({ processed: 0 })
  expect(sent).toHaveLength(1)
  const link = sent[0]?.text
    .split('\n')
    .find((line) => line.startsWith('https://'))
  expect(link).toBeDefined()
  if (!link) throw new Error('Missing synthetic proof')
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')
  const next = await request(app)
    .get('/api/v1/auth/csrf?sessionKind=context')
    .set('Origin', config.STOREFRONT_ORIGIN)
    .expect(200)
  await request(app)
    .post('/api/v1/auth/password-resets/confirm')
    .set('Origin', config.STOREFRONT_ORIGIN)
    .set('Cookie', String(next.headers['set-cookie']?.[0]).split(';')[0] ?? '')
    .set('X-CSRF-Token', next.body.data.csrfToken)
    .send({ token, newPassword: 'Synthetic changed password' })
    .expect(200)
  expect(lines.some((line) => line.includes(token ?? ''))).toBe(false)
  expect(lines.some((line) => line.includes(config.SESSION_SECRET))).toBe(false)
  expect((await request(app).get('/api/v1/health/live')).status).toBe(200)
  expect(
    (
      await request(app)
        .get('/api/v1/admin/auth/session')
        .set('Origin', config.ADMIN_ORIGIN)
    ).status,
  ).toBe(401)
})

it('preserves compiled bootstrap/migration entry points and safe worker preflight without external email', async () => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ...identityEnvironment(),
    MONGODB_URI: fixture.replica.getUri(),
    MONGODB_DB_NAME: fixture.connection.name,
    CUSTOMER_AUTH_ENABLED: 'false',
    ADMIN_AUTH_ENABLED: 'false',
    PASSWORD_RECOVERY_ENABLED: 'false',
    EMAIL_CHANGE_ENABLED: 'false',
    EMAIL_ENABLED: 'false',
  }
  const models = createIdentityModels(fixture.connection)
  const before = await models.users.countDocuments()
  for (const tool of ['bootstrap-identity', 'migrate-notifications']) {
    const result = spawnSync(process.execPath, [`tools/${tool}.mjs`], {
      env: environment,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 1048576,
    })
    expect(result.status).toBe(0)
    expect(result.error).toBeUndefined()
    expect(result.stdout.includes(environment.SESSION_SECRET ?? '')).toBe(false)
    expect(result.stderr).toBe('')
  }
  expect(await models.users.countDocuments()).toBe(before)
  const worker = spawnSync(
    process.execPath,
    ['tools/notification-worker.mjs'],
    { env: environment, encoding: 'utf8', timeout: 20000, maxBuffer: 1048576 },
  )
  expect(worker.status).toBe(1)
  expect(worker.stdout).toBe('')
  expect(worker.stderr.trim()).toBe(
    'Notification worker failed; inspect protected configuration and durable status.',
  )
})

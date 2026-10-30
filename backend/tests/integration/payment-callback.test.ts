import { spawnSync } from 'node:child_process'
import { createPaymentCallbackThrottle } from '../../src/modules/auth/sessions/auth-throttle.service.js'
import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
import { createApp } from '../../src/app.js'
import { composeApplication } from '../../src/setup.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createLogger } from '../../src/shared/logger.js'
import { createAuthQuotaStore } from '../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { paymentCallbackRoutes } from '../../src/modules/payments/payment-callback.routes.js'
import {
  paymentCallbackService,
  type PaymentCallbackProcessor,
} from '../../src/modules/payments/payment-callback.service.js'
import type { PaymentCallbackOptions } from '../../src/modules/payments/payment-callback.schema.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>, clock: number, logs: string[]
let app: ReturnType<typeof createApp>
const secret = randomBytes(32).toString('hex')
const options: PaymentCallbackOptions = {
  mode: 'sandbox',
  storeId: 'synthetic-store',
  storefrontOrigin: 'https://shop.example.test',
  rateLimit: 60,
  returns: {
    success: 'https://shop.example.test/payment/result',
    fail: 'https://shop.example.test/payment/result',
    cancel: 'https://shop.example.test/payment/result',
  },
}
const ipn = '/api/v1/webhooks/sslcommerz/ipn',
  browser = '/api/v1/payment-returns/sslcommerz'
const body = {
  status: 'VALID',
  tran_id: 'synthetic-paid-trans',
  val_id: 'synthetic-validation',
  amount: '10.00',
  currency: 'BDT',
  store_id: options.storeId,
  card_no: 'private-synthetic-card',
  card_issuer: 'private-synthetic-issuer',
  verify_sign: 'private-signature',
  verify_key: 'private-key',
  value_a: 'private-customer-data',
}
function rebuild(process?: PaymentCallbackProcessor, limit = 60) {
  const callback = paymentCallbackService(
    db.connection,
    { ...options, rateLimit: limit },
    secret,
    process,
    () => new Date(clock),
  )
  const normal = Router()
  normal.post('/normal-json', (_req, res) => res.status(204).end())
  app = createApp({
    apiRouter: normal,
    providerCallbacks: paymentCallbackRoutes(
      callback,
      createPaymentCallbackThrottle(db.connection, secret, limit, () => clock),
    ),
    logger: createLogger({ APP_ENV: 'test', RELEASE_ID: 'synthetic-callback' }, (line) =>
      logs.push(line),
    ),
  })
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeAuditPersistence(db.connection)
  await createAuthQuotaStore(db.connection).initialize()
})
beforeEach(async () => {
  clock = Date.now()
  logs = []
  await db.connection.db?.collection('auditLogs').deleteMany({})
  await db.connection.db?.collection('authRateLimits').deleteMany({})
  rebuild()
})
afterAll(async () => {
  await db?.close()
})
it('valid-looking IPN is untrusted, returns retryable 503 without a processor and persists only a redacted security fingerprint', async () => {
  const result = await request(app).post(ipn).type('form').send(body).expect(503)
  expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE')
  expect(result.headers['cache-control']).toContain('no-store')
  expect(result.headers['set-cookie']).toBeUndefined()
  const audit = await db.connection.db?.collection('auditLogs').find({}).toArray()
  expect(audit).toHaveLength(1)
  expect(audit?.[0]).toMatchObject({
    action: 'payment.callback.unverified',
    afterDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  const stored = JSON.stringify({
    audit,
    logs,
    quotas: await db.connection.db?.collection('authRateLimits').find({}).toArray(),
  })
  for (const sensitive of [
    body.tran_id,
    body.val_id,
    body.store_id,
    body.card_no,
    body.card_issuer,
    body.verify_sign,
    body.verify_key,
    body.value_a,
  ])
    expect(stored).not.toContain(sensitive)
  expect(stored).not.toContain('127.0.0.1')
  for (const name of [
    'payments',
    'paymentAttempts',
    'providerReceiptIntake',
    'paymentCollections',
    'orders',
    'sessions',
  ])
    expect(await db.connection.db?.collection(name).countDocuments()).toBe(0)
})
it.each(['success', 'fail', 'cancel'])(
  'browser GET/POST %s strips arbitrary provider parameters, issues no credentials and performs no financial transition',
  async (result) => {
    const processor = vi.fn<PaymentCallbackProcessor>().mockResolvedValue('committed')
    rebuild(processor)
    const get = await request(app)
      .get(`${browser}/${result}?next=https://attacker.test/&status=VALID&token=private-query`)
      .set('Cookie', 'sz_customer_sid=forged; sz_admin_sid=forged')
      .expect(303)
    const post = await request(app)
      .post(`${browser}/${result}?next=https://attacker.test/`)
      .type('form')
      .send({ ...body, next: 'https://attacker.test/' })
      .expect(303)
    for (const response of [get, post]) {
      expect(response.headers.location).toBe(
        options.returns[result as keyof typeof options.returns],
      )
      expect(response.text).toBe('')
      expect(response.headers['set-cookie']).toBeUndefined()
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
      expect(response.headers['access-control-allow-credentials']).toBeUndefined()
      expect(response.headers['referrer-policy']).toBe('no-referrer')
    }
    expect(processor).not.toHaveBeenCalled()
    expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(0)
    expect(JSON.stringify(logs)).not.toContain('private-query')
    expect(JSON.stringify(logs)).not.toContain('attacker.test')
    for (const name of [
      'payments',
      'paymentAttempts',
      'providerReceiptIntake',
      'paymentCollections',
      'sessions',
    ])
      expect(await db.connection.db?.collection(name).countDocuments()).toBe(0)
  },
)
it('acknowledges only after the independent processor promise and its synthetic durable result commit', async () => {
  let release: (() => void) | undefined,
    completed = false
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const processor = vi.fn<PaymentCallbackProcessor>().mockImplementation(async (claim) => {
    expect(Object.isFrozen(claim)).toBe(true)
    expect(claim).toMatchObject({
      tranId: body.tran_id,
      claimedStatus: 'VALID',
      claimedAmount: '10.00',
    })
    expect(claim).not.toHaveProperty('card_no')
    expect(claim).not.toHaveProperty('verify_sign')
    await ready
    // Synthetic outcome authority only; not independent provider verification or a funds writer.
    await inTransaction(db.connection, (session) =>
      createAuditWriter(db.connection)(session, {
        actorType: 'system',
        action: 'synthetic.callback.commit',
        targetType: 'payment_callback',
        operationKey: 'synthetic-durable-result',
        occurredAt: new Date(clock),
      }),
    )
    return 'committed'
  })
  rebuild(processor)
  const pending = request(app)
    .post(ipn)
    .type('form')
    .send(body)
    .then((result) => {
      completed = true
      return result
    })
  await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(1))
  expect(completed).toBe(false)
  release?.()
  const result = await pending
  expect(result.status).toBe(200)
  expect(result.text).toBe('OK')
  expect(result.headers['content-type']).toContain('text/plain')
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'synthetic.callback.commit' }),
  ).toBe(1)
})
it.each(['FAILED', 'CANCELLED', 'EXPIRED', 'UNATTEMPTED', 'PENDING'])(
  'does not treat %s as proof of terminal nonpayment or collection',
  async (status) => {
    await request(app)
      .post(ipn)
      .type('form')
      .send({ status, tran_id: 'synthetic-tran' })
      .expect(503)
    expect(await db.connection.db?.collection('paymentCollections').countDocuments()).toBe(0)
    expect(await db.connection.db?.collection('paymentAttempts').countDocuments()).toBe(0)
  },
)
it('repeated unverified notifications do not multiply security fingerprints or silently become payment acknowledgments', async () => {
  await Promise.all([
    request(app).post(ipn).type('form').send(body).expect(503),
    request(app).post(ipn).type('form').send(body).expect(503),
  ])
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('returns 503 for pending/failed processing and audit persistence outages without exposing errors', async () => {
  rebuild(async () => 'retry')
  await request(app).post(ipn).type('form').send(body).expect(503)
  rebuild(async () => {
    throw new Error('private-provider-password')
  })
  const failed = await request(app).post(ipn).type('form').send(body).expect(503)
  expect(JSON.stringify(failed.body)).not.toContain('private-provider-password')
  await db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
  try {
    await request(app).post(ipn).type('form').send(body).expect(503)
  } finally {
    await initializeAuditPersistence(db.connection)
  }
})
it('rejects unknown merchants and malformed/duplicate/injected fields before invoking the processor', async () => {
  const processor = vi.fn<PaymentCallbackProcessor>().mockResolvedValue('committed')
  rebuild(processor)
  await request(app)
    .post(ipn)
    .type('form')
    .send({ ...body, store_id: 'foreign-store' })
    .expect(403)
  await request(app)
    .post(ipn)
    .type('form')
    .send({ ...body, userId: 'forged-admin' })
    .expect(400)
  await request(app)
    .post(ipn)
    .type('form')
    .send('status=VALID&status=FAILED&tran_id=synthetic&val_id=v')
    .expect(400)
  await request(app).post(`${ipn}?status=VALID`).type('form').send(body).expect(400)
  expect(processor).not.toHaveBeenCalled()
})
it('bounds transport size/parameters/compression and does not permit JSON or other paths to inherit form admission', async () => {
  await request(app).post(ipn).send(body).expect(400)
  await request(app)
    .post(ipn)
    .type('form')
    .send({ ...body, value_a: 'x'.repeat(9000) })
    .expect(400)
  await request(app)
    .post(ipn)
    .type('form')
    .send(Array.from({ length: 65 }, (_, i) => `p${i}=x`).join('&'))
    .expect(400)
  await request(app)
    .post(ipn)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .set('Content-Encoding', 'gzip')
    .send(gzipSync('status=VALID&tran_id=x&val_id=v'))
    .expect(400)
  await request(app).post('/api/v1/normal-json').type('form').send({ status: 'VALID' }).expect(400)
  await request(app).post('/api/v1/normal-json').send({ example: true }).expect(204)
  await request(app).post(`${ipn}/extra`).type('form').send(body).expect(400)
})
it('rejects invalid return results, duplicate forms and GET bodies instead of forwarding attacker input', async () => {
  await request(app).get(`${browser}/paid?next=https://attacker.test`).expect(400)
  await request(app).post(`${browser}/success`).type('form').send('x=1&x=2').expect(400)
  await request(app).get(`${browser}/success`).send({ status: 'VALID' }).expect(400)
})
it('rate limits by the real peer, ignores forged forwarding headers and fails closed for missing quota protection', async () => {
  rebuild(undefined, 1)
  await request(app).get(`${browser}/success`).set('X-Forwarded-For', '1.1.1.1').expect(303)
  const limited = await request(app)
    .get(`${browser}/success`)
    .set('X-Forwarded-For', '2.2.2.2')
    .expect(429)
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
  clock += 60000
  await request(app).get(`${browser}/success`).expect(303)
  await db.connection.db?.collection('authRateLimits').dropIndex('auth_rate_limits_expiry')
  try {
    await request(app).get(`${browser}/success`).expect(503)
  } finally {
    await createAuthQuotaStore(db.connection).initialize()
  }
})
it('actual root composition defaults off, then exposes only untrusted callback behavior without identity activation', async () => {
  const config = loadEnvironment({
    ...testEnvironment(),
    API_PUBLIC_ORIGIN: 'https://api.example.test',
    STOREFRONT_ORIGIN: options.storefrontOrigin,
    ADMIN_ORIGIN: 'https://admin.example.test',
    CORS_ALLOWED_ORIGINS: `${options.storefrontOrigin},https://admin.example.test`,
  })
  const disabled = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
  )
  await request(disabled).get(`${browser}/success`).expect(404)
  const enabled = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
    undefined,
    [],
    undefined,
    [],
    undefined,
    { options },
  )
  await request(enabled).get(`${browser}/success?orderId=forged`).expect(303)
  await request(enabled).post(ipn).type('form').send(body).expect(503)
})
it('never invokes independent processing inside a retryable business transaction', async () => {
  const processor = vi.fn<PaymentCallbackProcessor>().mockResolvedValue('committed')
  const service = paymentCallbackService(db.connection, options, secret, processor)
  await expect(
    inTransaction(db.connection, async () => service.receive(body)),
  ).rejects.toMatchObject({ code: 'EXTERNAL_EFFECT_IN_TRANSACTION' })
  expect(processor).not.toHaveBeenCalled()
})

it('compiled local bootstrap preserves callback audit evidence and refuses a valid deployed environment', async () => {
  await request(app).post(ipn).type('form').send(body).expect(503)
  const env = {
    ...process.env,
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let run = 0; run < 2; run++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-payment-callbacks.mjs'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
  const production = {
    ...env,
    APP_ENV: 'production',
    NODE_ENV: 'production',
    API_PUBLIC_ORIGIN: 'https://api.example.test',
    STOREFRONT_ORIGIN: options.storefrontOrigin,
    ADMIN_ORIGIN: 'https://admin.example.test',
    CORS_ALLOWED_ORIGINS: `${options.storefrontOrigin},https://admin.example.test`,
    CUSTOMER_AUTH_ENABLED: 'false',
    ADMIN_AUTH_ENABLED: 'false',
    GUEST_ACCESS_ENABLED: 'false',
    PASSWORD_RECOVERY_ENABLED: 'false',
    EMAIL_CHANGE_ENABLED: 'false',
  }
  expect(() => loadEnvironment(production)).not.toThrow()
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-payment-callbacks.mjs'], {
    cwd: process.cwd(),
    env: production,
    encoding: 'utf8',
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).not.toContain(env.MONGODB_URI)
})

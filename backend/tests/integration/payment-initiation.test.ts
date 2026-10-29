import { loadEnvironment } from '../../src/config/env.js'
import { spawnSync } from 'node:child_process'
import { testEnvironment } from '../helpers/environment.js'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
import { initializeOrderPersistence } from '../../src/modules/orders/order.persistence.js'
import { orderService } from '../../src/modules/orders/order.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { checkoutPaymentAccess } from '../../src/modules/payments/payment.service.js'
import { paymentModel } from '../../src/modules/payments/payment.model.js'
import { paymentRecordModels } from '../../src/modules/payments/payment-record.model.js'
import { initializePaymentRecordPersistence } from '../../src/modules/payments/payment-record.persistence.js'
import { paymentInitiationModel } from '../../src/modules/payments/payment-initiation.model.js'
import {
  initializePaymentInitiationPersistence,
  verifyPaymentInitiationPersistence,
} from '../../src/modules/payments/payment-initiation.persistence.js'
import {
  paymentInitiationService,
  type PaymentInitiationAccess,
} from '../../src/modules/payments/payment-initiation.service.js'
import { initiationInput } from '../../src/providers/sslcommerz/sslcommerz.schema.js'
import { createSslcommerzAdapter } from '../../src/providers/sslcommerz/sslcommerz.client.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>,
  now: Date,
  hold: Date,
  orderId: string,
  allowed: boolean
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const merchant = hash('sandbox\0synthetic-store')
const input = { requestedChannel: 'bkash' },
  owner = 'synthetic-owner'
let expectedOrderTotal: number
let authority: PaymentInitiationAccess<string>
let transport: ReturnType<typeof vi.fn<typeof fetch>>
const address = {
  name: 'Synthetic',
  address: 'Synthetic road',
  city: 'Dhaka',
  postcode: '1000',
  country: 'Bangladesh',
} as const
const clock = () => now
function service(change: Partial<PaymentInitiationAccess<string>> = {}) {
  return paymentInitiationService(
    db.connection,
    { ...authority, ...change },
    createSslcommerzAdapter(
      {
        appEnv: 'test',
        mode: 'sandbox',
        storeId: 'synthetic-store',
        storePassword: 'synthetic-password',
        callbackOrigin: 'https://api.example.test',
        timeoutMs: 1000,
      },
      transport,
    ),
    (request) => initiationInput.safeParse(request).success,
    clock,
  )
}
function accepted() {
  return new Response(
    JSON.stringify({
      status: 'SUCCESS',
      sessionkey: 'synthetic-session',
      GatewayPageURL:
        'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=PAY&SESSIONKEY=synthetic-session',
    }),
  )
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeOrderPersistence(db.connection)
  await initializePaymentRecordPersistence(db.connection)
  await initializePaymentInitiationPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
})
beforeEach(async () => {
  now = new Date()
  hold = new Date(now)
  allowed = true
  for (const name of [
    'orders',
    'orderItemBalances',
    'payments',
    'paymentAttempts',
    'paymentInitiations',
    'auditLogs',
  ])
    await db.connection.db?.collection(name).deleteMany({})
  const proof = syntheticOrderProof({ online: true })
  orderId = proof.orderId
  expectedOrderTotal = proof.snapshot.pricing.finalTotalPoisha
  await inTransaction(db.connection, async (session) => {
    await orderService(
      db.connection,
      { authorize: async () => proof },
      createAuditWriter(db.connection),
      () => orderTestTime,
    ).create(session, {
      orderId,
      checkoutIntentId: proof.checkoutIntentId,
      operationKey: `synthetic:${orderId}`,
    })
    await checkoutPaymentAccess(db.connection).create(session, {
      orderId,
      method: 'online',
      expectedPoisha: proof.snapshot.pricing.finalTotalPoisha,
    })
  })
  // Deliberately synthetic auth/allocation/metadata authorities. These tests qualify only the private
  // durable dispatcher, not production order ownership, stock/coupon reacquisition or postal mapping.
  authority = {
    owned: async (credentials, requested, work) => {
      if (!allowed || credentials !== owner || requested !== orderId)
        throw new ApiError('FORBIDDEN')
      return inTransaction(db.connection, (session) => work(hash(owner), session))
    },
    authorize: async (_session, requested) => {
      if (requested !== orderId) throw new ApiError('FORBIDDEN')
      return expectedOrderTotal
    },
    allocation: async (_session, requested, channel) => ({
      orderId: requested,
      channel,
      heldAt: hold,
      expiresAt: new Date(hold.getTime() + 900000),
      minPoisha: 1000,
      maxPoisha: 50000,
    }),
    metadata: async () => ({
      customer: { ...address, email: 'buyer@example.test', phone: '+8801700000000' },
      shipping: address,
      itemCount: 3,
      productName: 'Synthetic sports goods',
      productCategory: 'Sports',
    }),
    channel: async () => ({
      gatewayKey: 'bkash',
      merchantAccountKey: merchant,
      validUntil: new Date(now.getTime() + 60000),
    }),
    shortfall: async () => {},
    redirectAllowed: async () => true,
  }
  transport = vi.fn<typeof fetch>().mockImplementation(async () => accepted())
})
afterAll(async () => {
  await db?.close()
})
it('commits operation, unique reference and uncertain attempt before provider I/O, then records accepted session without funds', async () => {
  transport.mockImplementationOnce(async () => {
    expect(
      await paymentInitiationModel(db.connection).countDocuments({ status: 'dispatching' }),
    ).toBe(1)
    expect(
      await paymentRecordModels(db.connection).attempts.countDocuments({ state: 'uncertain' }),
    ).toBe(1)
    return accepted()
  })
  const result = await service().initiate(owner, orderId, input, 'synthetic-key')
  expect(result).toMatchObject({
    state: 'initiated',
    attemptId: expect.any(String),
    redirectUrl: expect.stringContaining('https://sandbox.sslcommerz.com/'),
  })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await paymentInitiationModel(db.connection).countDocuments({ status: 'accepted' })).toBe(1)
  expect((await paymentModel(db.connection).findOne({ orderId }))?.verifiedCollectedPoisha).toBe(0)
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: /^payment.initiation/ }),
  ).toBe(2)
})
it('concurrent identical requests dispatch once and preserve one idempotent identity across new service instances', async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () => service().initiate(owner, orderId, input, 'same-key')),
  )
  expect(new Set(results.map((result) => result.attemptId)).size).toBe(1)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(1)
  const replay = await service().initiate(owner, orderId, input, 'same-key')
  expect(replay.state).toBe('initiated')
  expect(transport).toHaveBeenCalledTimes(1)
  const row = await paymentInitiationModel(db.connection).findOne().orFail()
  expect(row.idempotencyKeyHash).toBe(hash('same-key'))
  expect(JSON.stringify(row.toObject())).not.toContain('same-key')
  expect(row.toObject()).not.toHaveProperty('request')
})
it('concurrent distinct keys cannot bypass an unresolved attempt or create another order', async () => {
  const results = await Promise.allSettled([
    service().initiate(owner, orderId, input, 'a'),
    service().initiate(owner, orderId, input, 'b'),
  ])
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('orders').countDocuments()).toBe(1)
})
it('reauthorizes every replay, rejects body conflicts, and never falls back to another principal', async () => {
  await service().initiate(owner, orderId, input, 'same')
  await expect(
    service().initiate(owner, orderId, { requestedChannel: 'nagad' }, 'same'),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  allowed = false
  await expect(service().initiate(owner, orderId, input, 'same')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  allowed = true
  await expect(service().initiate('stranger', orderId, input, 'same')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  expect(transport).toHaveBeenCalledTimes(1)
})
it.each(['', 'x'.repeat(129), 'bad key'])(
  'rejects malformed durable key %j before authority or provider work',
  async (key) => {
    await expect(service().initiate(owner, orderId, input, key)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    expect(transport).not.toHaveBeenCalled()
  },
)
it('rejects client totals/URLs and invalid provider metadata without leaving an attempt or operation', async () => {
  await expect(
    service().initiate(owner, orderId, { ...input, amountPoisha: 1 }, 'a'),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  const metadata = await inTransaction(db.connection, (session) =>
    authority.metadata(session, orderId),
  )
  await expect(
    service({
      metadata: async () => ({
        ...metadata,
        customer: { ...metadata.customer, email: 'x'.repeat(51) },
      }),
    }).initiate(owner, orderId, input, 'b'),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})
it('never extends the hold clock on a replay and stops publishing the old URL after expiry', async () => {
  const first = await service().initiate(owner, orderId, input, 'key')
  now = new Date(hold.getTime() + 900000)
  const replay = await service().initiate(owner, orderId, input, 'key')
  expect(replay.expiresAt).toBe(first.expiresAt)
  expect(replay).not.toHaveProperty('redirectUrl')
  expect(transport).toHaveBeenCalledTimes(1)
})
it.each(['network', 'rejected', 'unknown'])(
  'preserves %s outcome as unresolved and never repeats external initiation',
  async (kind) => {
    transport.mockImplementationOnce(async () => {
      if (kind === 'network') throw new Error('Synthetic transport failure')
      return new Response(
        JSON.stringify(kind === 'rejected' ? { status: 'FAILED' } : { status: 'UNKNOWN' }),
      )
    })
    expect((await service().initiate(owner, orderId, input, 'key')).state).toBe('uncertain')
    expect((await service().initiate(owner, orderId, input, 'key')).state).toBe('uncertain')
    await expect(service().initiate(owner, orderId, input, 'new-key')).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    })
    expect(transport).toHaveBeenCalledTimes(1)
  },
)
it('an audit failure before dispatch rolls back the aggregate revision, operation and attempt', async () => {
  await db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
  try {
    await expect(service().initiate(owner, orderId, input, 'key')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(0)
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
  expect((await paymentModel(db.connection).findOne({ orderId }))?.revision).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})
it('a result-write failure after external acceptance leaves a replayable uncertainty tombstone without resending', async () => {
  transport.mockImplementationOnce(async () => {
    await db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
    return accepted()
  })
  try {
    await expect(service().initiate(owner, orderId, input, 'key')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect(
    await paymentInitiationModel(db.connection).countDocuments({ status: 'dispatching' }),
  ).toBe(1)
  expect((await service().initiate(owner, orderId, input, 'key')).state).toBe('uncertain')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('records an already authorized acceptance even when the browser scope is revoked during the provider call', async () => {
  transport.mockImplementationOnce(async () => {
    allowed = false
    return accepted()
  })
  await expect(service().initiate(owner, orderId, input, 'key')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  expect(await paymentInitiationModel(db.connection).countDocuments({ status: 'accepted' })).toBe(1)
  allowed = true
  expect((await service().initiate(owner, orderId, input, 'key')).state).toBe('initiated')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('persists allocation shortfall after an aborted allocation transaction, with no attempt or provider call', async () => {
  let recorded = 0
  const api = service({
    allocation: async () => {
      throw new ApiError('OUT_OF_STOCK')
    },
    shortfall: async (session) => {
      expect(session.inTransaction()).toBe(true)
      recorded++
    },
  })
  expect(await api.initiate(owner, orderId, input, 'key')).toEqual({
    state: 'allocation_shortfall',
  })
  expect(await api.initiate(owner, orderId, input, 'key')).toEqual({
    state: 'allocation_shortfall',
  })
  expect(recorded).toBe(1)
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
  expect((await paymentModel(db.connection).findOne({ orderId }))?.revision).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})
it('refuses expired allocation facts and expired merchant proof without creating an external session', async () => {
  hold = new Date(now.getTime() - 900000)
  await expect(service().initiate(owner, orderId, input, 'a')).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  hold = new Date(now)
  await expect(
    service({
      channel: async () => ({
        gatewayKey: 'bkash',
        merchantAccountKey: merchant,
        validUntil: new Date(now),
      }),
    }).initiate(owner, orderId, input, 'b'),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(transport).not.toHaveBeenCalled()
})
it('refuses calls inside a transaction and guards durable history/indexes without silent TTL or deletion', async () => {
  await expect(
    inTransaction(db.connection, async () => service().initiate(owner, orderId, input, 'key')),
  ).rejects.toMatchObject({ code: 'EXTERNAL_EFFECT_IN_TRANSACTION' })
  await service().initiate(owner, orderId, input, 'key')
  const row = await paymentInitiationModel(db.connection).findOne().orFail()
  await expect(
    paymentInitiationModel(db.connection).deleteOne({ _id: row._id }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    paymentInitiationModel(db.connection).updateOne(
      { _id: row._id, status: 'dispatching' },
      { $set: { scopeKeyHash: 'a'.repeat(64) } },
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    paymentInitiationModel(db.connection).findOneAndDelete({ _id: row._id }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await paymentInitiationModel(db.connection).collection.createIndex(
    { createdAt: 1 },
    { name: 'synthetic_ttl', expireAfterSeconds: 3600 },
  )
  try {
    await expect(verifyPaymentInitiationPersistence(db.connection)).rejects.toThrow(
      'must not expire',
    )
  } finally {
    await paymentInitiationModel(db.connection).collection.dropIndex('synthetic_ttl')
  }
  expect(transport).toHaveBeenCalledTimes(1)
})
it('does not downgrade a concurrent pending result or return a payment redirect for it', async () => {
  transport.mockImplementationOnce(async () => {
    const row = await paymentRecordModels(db.connection).attempts.findOne().orFail()
    await paymentRecordModels(db.connection).attempts.updateOne(
      { _id: row._id, state: 'uncertain' },
      { $set: { state: 'pending' } },
    )
    return accepted()
  })
  const result = await service().initiate(owner, orderId, input, 'key')
  expect(result.state).toBe('pending')
  expect(result).not.toHaveProperty('redirectUrl')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('fails replay on a corrupted parent payment without repeating the provider operation', async () => {
  await service().initiate(owner, orderId, input, 'key')
  await paymentModel(db.connection).collection.deleteMany({})
  await expect(service().initiate(owner, orderId, input, 'key')).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(transport).toHaveBeenCalledTimes(1)
})
it('enforces unique attempt links and strict BSON status/identity shapes', async () => {
  await service().initiate(owner, orderId, input, 'key')
  const row = await paymentInitiationModel(db.connection).findOne().orFail()
  const { _id, attemptId, redirectUrl, ...fields } = row.toObject()
  void _id
  void redirectUrl
  await expect(
    paymentInitiationModel(db.connection).collection.insertOne({
      ...fields,
      attemptId,
      redirectUrl,
      idempotencyKeyHash: 'b'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 11000 })
  await expect(
    db.connection.db
      ?.collection('paymentInitiations')
      .insertOne({ ...fields, idempotencyKeyHash: 'c'.repeat(64) }),
  ).rejects.toMatchObject({ code: 121 })
})

it('concurrent shortfall replays retain one durable result without a duplicate-key escape', async () => {
  const api = service({
    allocation: async () => {
      throw new ApiError('OUT_OF_STOCK')
    },
  })
  expect(
    await Promise.all([
      api.initiate(owner, orderId, input, 'key'),
      api.initiate(owner, orderId, input, 'key'),
    ]),
  ).toEqual([{ state: 'allocation_shortfall' }, { state: 'allocation_shortfall' }])
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(1)
  expect(transport).not.toHaveBeenCalled()
})
it('compiled local bootstrap preserves durable operations and refuses deployed provisioning', async () => {
  await service().initiate(owner, orderId, input, 'key')
  const env = {
    ...process.env,
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let run = 0; run < 2; run++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-payment-initiation.mjs'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(1)
  const production = {
    ...env,
    APP_ENV: 'production',
    NODE_ENV: 'production',
    API_PUBLIC_ORIGIN: 'https://api.example.test',
    STOREFRONT_ORIGIN: 'https://shop.example.test',
    ADMIN_ORIGIN: 'https://admin.example.test',
    CORS_ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test',
    CUSTOMER_AUTH_ENABLED: 'false',
    ADMIN_AUTH_ENABLED: 'false',
    GUEST_ACCESS_ENABLED: 'false',
    PASSWORD_RECOVERY_ENABLED: 'false',
    EMAIL_CHANGE_ENABLED: 'false',
  }
  expect(() => loadEnvironment(production)).not.toThrow()
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-payment-initiation.mjs'], {
    cwd: process.cwd(),
    env: production,
    encoding: 'utf8',
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).not.toContain(env.MONGODB_URI)
})
it('retains merchant/gateway snapshots and refuses to reissue an old session under a changed qualification', async () => {
  const first = await service().initiate(owner, orderId, input, 'key')
  expect(first.redirectUrl).toBeDefined()
  for (const patch of [
    { merchantAccountKey: 'c'.repeat(64) },
    { gatewayKey: 'synthetic_other_key' },
  ]) {
    const api = service({
      channel: async () => ({
        gatewayKey: 'bkash',
        merchantAccountKey: merchant,
        validUntil: new Date(now.getTime() + 60000),
        ...patch,
      }),
    })
    expect((await api.initiate(owner, orderId, input, 'key')).redirectUrl).toBeUndefined()
  }
  const row = await paymentInitiationModel(db.connection).findOne().orFail()
  expect(row.merchantAccountKey).toBe(merchant)
  expect(row.gatewayKey).toBe('bkash')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('rejects a canonical payment/order total mismatch before preparing or dispatching an attempt', async () => {
  const api = service({ authorize: async () => expectedOrderTotal + 1 })
  await expect(api.initiate(owner, orderId, input, 'key')).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})

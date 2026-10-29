import { spawnSync } from 'node:child_process'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import { initializeOrderPersistence } from '../../src/modules/orders/order.persistence.js'
import { orderService } from '../../src/modules/orders/order.service.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { checkoutPaymentAccess } from '../../src/modules/payments/payment.service.js'
import { paymentModel } from '../../src/modules/payments/payment.model.js'
import {
  paymentRecordModels,
  collectionAmounts,
} from '../../src/modules/payments/payment-record.model.js'
import {
  initializePaymentRecordPersistence,
  verifyPaymentRecordPersistence,
  paymentRecordValidators,
} from '../../src/modules/payments/payment-record.persistence.js'
import {
  paymentAttemptService,
  type PaymentAttemptAccess,
} from '../../src/modules/payments/payment-attempt.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>, now: Date
const id = () => new Types.ObjectId().toHexString()
const clock = () => now
const run = <T>(work: Parameters<typeof inTransaction<T>>[1]) => inTransaction(db.connection, work)
async function seed(online = true) {
  const proof = syntheticOrderProof({ online })
  await run(async (session) => {
    await orderService(
      db.connection,
      { authorize: async () => proof },
      createAuditWriter(db.connection),
      () => orderTestTime,
    ).create(session, {
      orderId: proof.orderId,
      checkoutIntentId: proof.checkoutIntentId,
      operationKey: `synthetic-order:${proof.orderId}`,
    })
    await checkoutPaymentAccess(db.connection).create(session, {
      orderId: proof.orderId,
      method: online ? 'online' : 'cod',
      expectedPoisha: proof.snapshot.pricing.finalTotalPoisha,
    })
  })
  const payment = await paymentModel(db.connection).findOne({ orderId: proof.orderId }).orFail()
  return { orderId: proof.orderId, payment }
}
function access(orderId: string, change: Partial<PaymentAttemptAccess> = {}): PaymentAttemptAccess {
  // Required synthetic scope/allocation authority only. Production auth/channel/allocation/provider
  // composition remains P07-001/003/004/013; this fixture enables no HTTP or external money effect.
  return {
    authorize: async (_session, requested) => {
      if (requested !== orderId) throw new ApiError('FORBIDDEN')
    },
    allocation: async (_session, requested, channel) => ({
      orderId: requested,
      channel,
      heldAt: now,
      expiresAt: new Date(now.getTime() + 900000),
      minPoisha: 1,
      maxPoisha: 1000000,
    }),
    ...change,
  }
}
function prepare(orderId: string, attemptId = id(), extra: object = {}, owned = access(orderId)) {
  return run((session) =>
    paymentAttemptService(db.connection, owned, clock).prepare(session, {
      orderId,
      attemptId,
      requestedChannel: 'bkash',
      ...extra,
    }),
  )
}
const verification = () => ({
  verifiedAt: now,
  verifiedStatus: 'SYNTHETIC_FAILED',
  merchantIdMatch: true,
  amountMatch: false,
  currencyMatch: true,
  referenceMatch: true,
  rawRecordDigest: 'a'.repeat(64),
})
function intake(ref = id()) {
  return {
    provider: 'sslcommerz',
    merchantAccountKey: 'synthetic-merchant',
    providerCollectionRef: ref,
    reportedTranId: 'unknown-local-attempt',
    amountPoisha: 100,
    currency: 'BDT',
    collectedAt: now,
    verifiedAt: now,
    validationDigest: 'b'.repeat(64),
    matchingStatus: 'unmatched',
  } as const
}
function collection(
  paymentId: Types.ObjectId,
  orderId: string,
  intakeId: Types.ObjectId,
  attemptId?: string,
  providerCollectionRef = intakeId.toHexString(),
) {
  return {
    paymentId,
    orderId: new Types.ObjectId(orderId),
    intakeId,
    ...(attemptId ? { attemptId: new Types.ObjectId(attemptId) } : {}),
    provider: 'sslcommerz',
    merchantAccountKey: 'synthetic-merchant',
    providerCollectionRef,
    amountPoisha: 100,
    currency: 'BDT',
    collectedAt: now,
    verifiedAt: now,
    evidenceDigest: 'c'.repeat(64),
    verifiedBy: { type: 'provider' },
    ...Object.fromEntries(collectionAmounts.map((field) => [field, 0])),
    unassignedAllocatedPoisha: 100,
    revision: 0,
  } as const
}
async function linkedFixture(
  paymentId: Types.ObjectId,
  orderId: string,
  source: { _id: Types.ObjectId; providerCollectionRef: string },
  attemptId?: string,
) {
  return run(async (session) => {
    const records = paymentRecordModels(db.connection)
    const [row] = await records.collections.create(
      [collection(paymentId, orderId, source._id, attemptId, source.providerCollectionRef)],
      { session },
    )
    if (!row) throw new Error('Missing synthetic linked receipt')
    await records.intake.updateOne(
      { _id: source._id, matchingStatus: 'unmatched' },
      { $set: { matchingStatus: 'linked', linkedCollectionId: row._id } },
      { session },
    )
    await paymentModel(db.connection).updateOne(
      { _id: paymentId },
      { $inc: { verifiedCollectedPoisha: 100, unassignedCollectedPoisha: 100, revision: 1 } },
      { session },
    )
    return row
  })
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeOrderPersistence(db.connection)
  await initializePaymentRecordPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
})
beforeEach(async () => {
  now = new Date()
  for (const name of [
    'orders',
    'orderItemBalances',
    'payments',
    'paymentAttempts',
    'providerReceiptIntake',
    'paymentCollections',
    'auditLogs',
  ])
    await db.connection.db?.collection(name).deleteMany({})
})
afterAll(async () => {
  await db?.close()
})
it('prepares one immutable exact outstanding request and audit without receipt, financial success or provider calls', async () => {
  const { orderId, payment } = await seed(),
    result = await prepare(orderId)
  expect(result).toMatchObject({
    orderId,
    expectedAmountPoisha: payment.expectedPoisha,
    currency: 'BDT',
    state: 'created',
  })
  expect(result.tranId).toMatch(/^SZ[a-f0-9]{28}$/)
  const row = await paymentRecordModels(db.connection).attempts.findById(result.id).orFail()
  expect(row.initiatedOutstandingPoisha).toBe(payment.expectedPoisha)
  expect(row.providerSessionId).toBeUndefined()
  expect(await paymentModel(db.connection).findById(payment._id)).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'payment.attempt.prepare' }),
  ).toBe(1)
})
it('concurrent identical operation IDs replay one attempt and every replay reauthorizes scope', async () => {
  const { orderId } = await seed(),
    attemptId = id(),
    authorized = vi.fn(access(orderId).authorize),
    owned = access(orderId, { authorize: authorized })
  const results = await Promise.all([
    prepare(orderId, attemptId, {}, owned),
    prepare(orderId, attemptId, {}, owned),
  ])
  expect(results[0]).toEqual(results[1])
  expect(authorized.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
  await expect(prepare(orderId, attemptId, {}, access('a'.repeat(24)))).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  await expect(prepare(orderId, attemptId, { requestedChannel: 'nagad' })).rejects.toMatchObject({
    code: 'IDEMPOTENCY_CONFLICT',
  })
})
it('two distinct identities cannot concurrently start unresolved attempts on the same order', async () => {
  const { orderId } = await seed(),
    results = await Promise.allSettled([prepare(orderId), prepare(orderId)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
})
it('retains unresolved/expired attempts and replays their original outcome without extending expiry', async () => {
  const { orderId } = await seed(),
    attemptId = id(),
    result = await prepare(orderId, attemptId),
    models = paymentRecordModels(db.connection)
  await models.attempts.updateOne(
    { _id: attemptId, state: 'created' },
    { $set: { state: 'uncertain' } },
  )
  now = new Date(now.getTime() + 900001)
  const replayed = await prepare(orderId, attemptId)
  expect(replayed).toMatchObject({ id: attemptId, state: 'uncertain', expiresAt: result.expiresAt })
  await expect(prepare(orderId, id(), { retryOfAttemptId: attemptId })).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
})
it('terminal retries use fresh references, preserve history and snapshot only remaining merchandise funding', async () => {
  const { orderId, payment } = await seed(),
    first = await prepare(orderId),
    records = paymentRecordModels(db.connection)
  await records.attempts.updateOne(
    { _id: first.id, state: 'created' },
    { $set: { state: 'verified_failed', verification: verification() } },
  )
  // Synthetic prior verified-allocation projection; independent receipt ingestion is a later task.
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    { $set: { verifiedCollectedPoisha: 500, merchandiseFundedPoisha: 500 }, $inc: { revision: 1 } },
  )
  const second = await prepare(orderId, id(), { retryOfAttemptId: first.id })
  expect(second.tranId).not.toBe(first.tranId)
  expect(second.expectedAmountPoisha).toBe(payment.expectedPoisha - 500)
  expect((await records.attempts.findById(first.id))?.expectedAmountPoisha).toBe(
    payment.expectedPoisha,
  )
  expect(await records.attempts.countDocuments()).toBe(2)
})
it('denies missing/wrong retry lineage, COD, fully funded/risk/unassigned balances and out-of-range channels', async () => {
  const cod = await seed(false)
  await expect(prepare(cod.orderId)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const { orderId, payment } = await seed()
  await expect(prepare(orderId, id(), { retryOfAttemptId: id() })).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await expect(
    prepare(
      orderId,
      id(),
      {},
      access(orderId, {
        allocation: async () => ({
          orderId,
          channel: 'bkash',
          heldAt: now,
          expiresAt: new Date(now.getTime() + 900000),
          minPoisha: 1,
          maxPoisha: 1,
        }),
      }),
    ),
  ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_UNSUPPORTED' })
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    { $set: { riskStatus: 'review' } },
  )
  await expect(prepare(orderId)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    { $set: { riskStatus: 'clear', verifiedCollectedPoisha: 1, unassignedCollectedPoisha: 1 } },
  )
  await expect(prepare(orderId)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    {
      $set: {
        verifiedCollectedPoisha: payment.expectedPoisha,
        merchandiseFundedPoisha: payment.expectedPoisha,
        unassignedCollectedPoisha: 0,
        paymentStatus: 'paid',
      },
    },
  )
  await expect(prepare(orderId)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
})
it('audit failure rolls back attempt and aggregate fence; retry can safely create the same operation', async () => {
  const { orderId, payment } = await seed(),
    attemptId = id()
  await db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
  try {
    await expect(prepare(orderId, attemptId)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
    expect((await paymentModel(db.connection).findById(payment._id))?.revision).toBe(0)
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect((await prepare(orderId, attemptId)).id).toBe(attemptId)
})
it('refuses creation outside a transaction and corrupted replay parents', async () => {
  const { orderId, payment } = await seed(),
    attemptId = id(),
    session = await db.connection.startSession()
  try {
    await expect(
      paymentAttemptService(db.connection, access(orderId), clock).prepare(session, {
        orderId,
        attemptId,
        requestedChannel: 'bkash',
      }),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  } finally {
    await session.endSession()
  }
  await prepare(orderId, attemptId)
  await paymentModel(db.connection).collection.deleteOne({ _id: payment._id })
  await expect(prepare(orderId, attemptId)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
})
it('enforces provider transaction uniqueness while validation/bank references remain nonunique', async () => {
  const { orderId } = await seed(),
    first = await prepare(orderId),
    attempts = paymentRecordModels(db.connection).attempts
  const row = await attempts.findById(first.id).lean().orFail()
  await expect(
    attempts.collection.insertOne({ ...row, _id: new Types.ObjectId() }),
  ).rejects.toMatchObject({ code: 11000 })
  await attempts.collection.insertOne({
    ...row,
    _id: new Types.ObjectId(),
    tranId: 'distinct-source',
    providerValidationId: 'shared-validation',
    bankTranId: 'shared-bank',
  })
  await attempts.collection.updateOne(
    { _id: row._id },
    { $set: { providerValidationId: 'shared-validation', bankTranId: 'shared-bank' } },
  )
  const indexes = await attempts.collection.indexes()
  expect(
    indexes.find((index) => index.name === 'payment_attempt_validation_lookup')?.unique,
  ).not.toBe(true)
  expect(indexes.find((index) => index.name === 'payment_attempt_bank_lookup')?.unique).not.toBe(
    true,
  )
})
it('preserves independently distinct receipts on one attempt without inventing unmatched order ownership', async () => {
  const { orderId, payment } = await seed(),
    attempt = await prepare(orderId),
    models = paymentRecordModels(db.connection)
  const a = await models.intake.create(intake()),
    b = await models.intake.create(intake())
  expect(a.matchingStatus).toBe('unmatched')
  expect(a.toObject()).not.toHaveProperty('orderId')
  await linkedFixture(payment._id, orderId, a, attempt.id)
  await linkedFixture(payment._id, orderId, b, attempt.id)
  expect(await models.collections.countDocuments({ attemptId: attempt.id })).toBe(2)
  expect(
    (await models.collections.collection.indexes()).find(
      (index) => index.name === 'collection_attempt_history',
    )?.unique,
  ).not.toBe(true)
  await expect(
    models.intake.collection.updateOne(
      { _id: a._id },
      { $set: { orderId: new Types.ObjectId(orderId) } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(models.intake.create(intake(a.providerCollectionRef))).rejects.toMatchObject({
    code: 11000,
  })
})
it('strict receipt schemas enforce positive poisha, source evidence, linking shape and accounting/refund caps', async () => {
  const { orderId, payment } = await seed(),
    records = paymentRecordModels(db.connection),
    source = await records.intake.create(intake()),
    row = await linkedFixture(payment._id, orderId, source)
  for (const update of [
    { amountPoisha: 0 },
    { amountPoisha: 1.5 },
    { currency: 'USD' },
    { merchandiseAllocatedPoisha: 101 },
    { merchandiseRefundHeldPoisha: 1 },
    { rawProviderResponse: { secret: 'synthetic-only' } },
  ])
    await expect(
      records.collections.collection.updateOne({ _id: row._id }, { $set: update }),
    ).rejects.toMatchObject({ code: 121 })
  await expect(
    records.intake.collection.updateOne(
      { _id: source._id },
      { $set: { matchingStatus: 'linked' }, $unset: { linkedCollectionId: 1 } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    records.collections.collection.updateOne({ _id: row._id }, { $unset: { intakeId: 1 } }),
  ).rejects.toMatchObject({ code: 121 })
  const cod = {
    ...collection(payment._id, orderId, new Types.ObjectId()),
    provider: 'cod_manual' as const,
    merchantAccountKey: 'internal',
    verifiedBy: { type: 'admin' as const, actorId: new Types.ObjectId() },
  }
  const { intakeId, ...codOnly } = cod
  void intakeId
  await records.collections.create(codOnly)
  await expect(
    records.collections.create({
      ...codOnly,
      providerCollectionRef: id(),
      verifiedBy: { type: 'admin' },
    }),
  ).rejects.toMatchObject({ code: 121 })
})
it('rejects fake verified attempt outcomes and retains actual mismatched receipt amounts independently of requested amount', async () => {
  const { orderId } = await seed(),
    result = await prepare(orderId),
    model = paymentRecordModels(db.connection).attempts
  await expect(
    model.collection.updateOne(
      { _id: new Types.ObjectId(result.id) },
      { $set: { state: 'verified_paid' } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await model.updateOne(
    { _id: result.id, state: 'created' },
    {
      $set: {
        state: 'verified_paid',
        amountDisposition: 'under_collected',
        verifiedReceiptAmountPoisha: 1,
        verification: { ...verification(), verifiedStatus: 'SYNTHETIC_PAID' },
      },
    },
  )
  expect(await model.findById(result.id)).toMatchObject({
    expectedAmountPoisha: result.expectedAmountPoisha,
    verifiedReceiptAmountPoisha: 1,
    amountDisposition: 'under_collected',
  })
  await expect(
    model.collection.updateOne(
      { _id: new Types.ObjectId(result.id) },
      { $set: { amountDisposition: 'matched' } },
    ),
  ).rejects.toMatchObject({ code: 121 })
})
it('protects evidence identity, disallows replacement/deletion and requires revision guards for mutable source accounting', async () => {
  const { orderId, payment } = await seed(),
    result = await prepare(orderId),
    records = paymentRecordModels(db.connection),
    source = await records.intake.create(intake()),
    row = await linkedFixture(payment._id, orderId, source, result.id)
  await expect(
    records.attempts.updateOne(
      { _id: result.id, state: 'created' },
      { $set: { expectedAmountPoisha: 1 } },
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    records.intake.updateOne(
      { _id: source._id, matchingStatus: 'unmatched' },
      { $set: { validationDigest: 'd'.repeat(64) } },
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    records.collections.updateOne({ _id: row._id }, { $set: { merchandiseAllocatedPoisha: 1 } }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    records.collections.replaceOne({ _id: row._id }, row.toObject()),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(row.deleteOne()).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  row.set('unassignedAllocatedPoisha', 100)
  await expect(row.save()).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await records.collections.updateOne(
    { _id: row._id, revision: 0 },
    {
      $set: { merchandiseAllocatedPoisha: 40, unassignedAllocatedPoisha: 60 },
      $inc: { revision: 1 },
    },
  )
  expect((await records.collections.findById(row._id))?.revision).toBe(1)
})
it('fails missing indexes/validator drift/TTL readiness without silently repairing history', async () => {
  const { orderId } = await seed(),
    model = paymentRecordModels(db.connection).attempts
  await model.collection.dropIndex('payment_attempt_tran_unique')
  try {
    await expect(prepare(orderId)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  } finally {
    await initializePaymentRecordPersistence(db.connection)
  }
  await db.connection.db?.command({ collMod: 'paymentAttempts', validator: {} })
  try {
    await expect(initializePaymentRecordPersistence(db.connection)).rejects.toThrow(
      'reviewed provisioning',
    )
  } finally {
    await db.connection.db?.command({
      collMod: 'paymentAttempts',
      validator: paymentRecordValidators.paymentAttempts,
    })
  }
  await model.collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'synthetic_ttl' },
  )
  try {
    await expect(verifyPaymentRecordPersistence(db.connection)).rejects.toThrow('TTL')
  } finally {
    await model.collection.dropIndex('synthetic_ttl')
  }
})
it('compiled additive bootstrap preserves existing attempts and refuses production provisioning', async () => {
  const { orderId } = await seed()
  await prepare(orderId)
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let count = 0; count < 2; count++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-payment-records.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-payment-records.mjs'], {
    env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).not.toContain(env.MONGODB_URI)
})

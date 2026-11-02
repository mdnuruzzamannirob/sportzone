import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { spawnSync } from 'node:child_process'
import { identityEnvironment } from '../helpers/environment.js'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import {
  initializePaymentPersistence,
  verifyPaymentPersistence,
  paymentValidator,
  precedingPaymentValidator,
  migratePaymentCorrectionProjection,
} from '../../src/modules/payments/payment.persistence.js'
import { checkoutPaymentAccess } from '../../src/modules/payments/payment.service.js'
import { paymentModel } from '../../src/modules/payments/payment.model.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import {
  initializeCorrectionPersistence,
  verifyCorrectionPersistence,
  refundValidator,
  precedingRefundValidator,
  migrateRefundPersistence,
} from '../../src/modules/refunds/refund.persistence.js'
import { refundAttemptModel } from '../../src/modules/refunds/refund-attempt.model.js'
import { initializeRefundAttemptPersistence } from '../../src/modules/refunds/refund-attempt.persistence.js'
import { correctionObligationService } from '../../src/modules/refunds/correction-obligation.service.js'
import { refundModel } from '../../src/modules/refunds/refund.model.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeAuditPersistence(db.connection)
  await initializePaymentPersistence(db.connection)
  await initializeCorrectionPersistence(db.connection)
})
beforeEach(async () => {
  await db.connection.collection('payments').deleteMany({})
  await db.connection.collection('refunds').deleteMany({})
  await db.connection.collection('auditLogs').deleteMany({})
})
afterAll(async () => db?.close())
it('migrates only exact predecessor, preserves money/documents, repeats safely and rejects unknown drift', async () => {
  const orderId = new Types.ObjectId().toHexString()
  await inTransaction(db.connection, (session) =>
    checkoutPaymentAccess(db.connection).create(session, {
      orderId,
      method: 'online',
      expectedPoisha: 100,
    }),
  )
  const before = await db.connection.collection('payments').findOne({})
  await db.connection.db?.command({
    collMod: 'payments',
    validator: precedingPaymentValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await expect(verifyPaymentPersistence(db.connection)).rejects.toThrow()
  await migratePaymentCorrectionProjection(db.connection)
  await migratePaymentCorrectionProjection(db.connection)
  expect(await db.connection.collection('payments').findOne({})).toEqual(before)
  await paymentModel(db.connection).updateOne(
    { orderId },
    {
      $set: { paymentStatus: 'paid', verifiedCollectedPoisha: 100, correctionCollectedPoisha: 100 },
    },
  )
  await db.connection.db?.command({
    collMod: 'payments',
    validator: { $jsonSchema: { bsonType: 'object' } },
  })
  await expect(migratePaymentCorrectionProjection(db.connection)).rejects.toThrow(
    'Unknown payment validator',
  )
  await db.connection.db?.command({
    collMod: 'payments',
    validator: paymentValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await verifyPaymentPersistence(db.connection)
})
it('creates only immutable unreserved correction intents and never invents method, policy or payout authority', async () => {
  const input = {
    orderId: new Types.ObjectId().toHexString(),
    paymentId: new Types.ObjectId().toHexString(),
    sourceCollectionId: new Types.ObjectId().toHexString(),
    amountPoisha: 100,
    decisionKey: 'a'.repeat(64),
  }
  const service = correctionObligationService(db.connection)
  const first = await inTransaction(db.connection, (session) => service.create(session, input))
  expect(await inTransaction(db.connection, (session) => service.create(session, input))).toBe(
    first,
  )
  const row = await refundModel(db.connection).findById(first).orFail()
  expect(row.status).toBe('under_review')
  expect(row.capacityStatus).toBe('not_reserved')
  expect(row.toObject()).not.toHaveProperty('method')
  expect(row.toObject()).not.toHaveProperty('policyVersion')
  await expect(row.deleteOne()).rejects.toThrow()
  await expect(
    refundModel(db.connection).updateOne({ _id: first }, { $set: { status: 'approved' } }),
  ).rejects.toThrow()
  await expect(
    db.connection
      .collection('refunds')
      .updateOne({ _id: row._id }, { $set: { status: 'approved' } }),
  ).rejects.toThrow()
  await expect(
    db.connection
      .collection('refunds')
      .updateOne({ _id: row._id }, { $set: { amountPoisha: 200 } }),
  ).rejects.toThrow()
  await verifyCorrectionPersistence(db.connection)
})
it('refuses refund validator drift without overwriting history', async () => {
  const validator = (
    await db.connection.db?.listCollections({ name: 'refunds' }, { nameOnly: false }).next()
  )?.options?.validator
  await db.connection.db?.command({
    collMod: 'refunds',
    validator: { $jsonSchema: { bsonType: 'object' } },
  })
  await expect(initializeCorrectionPersistence(db.connection)).rejects.toThrow()
  await db.connection.db?.command({ collMod: 'refunds', validator })
})
it('upgrades only the exact correction predecessor and preserves intent history across repeated refund provisioning', async () => {
  const input = {
    orderId: new Types.ObjectId().toHexString(),
    paymentId: new Types.ObjectId().toHexString(),
    sourceCollectionId: new Types.ObjectId().toHexString(),
    amountPoisha: 100,
    decisionKey: 'b'.repeat(64),
  }
  await inTransaction(db.connection, (session) =>
    correctionObligationService(db.connection).create(session, input),
  )
  const before = await db.connection.collection('refunds').findOne({})
  await db.connection.db?.command({
    collMod: 'refunds',
    validator: precedingRefundValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await expect(verifyCorrectionPersistence(db.connection)).rejects.toThrow()
  await migrateRefundPersistence(db.connection)
  await migrateRefundPersistence(db.connection)
  expect(await db.connection.collection('refunds').findOne({})).toEqual(before)
  await db.connection.db?.command({
    collMod: 'refunds',
    validator: { $jsonSchema: { bsonType: 'object' } },
  })
  await expect(migrateRefundPersistence(db.connection)).rejects.toThrow('Unknown refund schema')
  await db.connection.db?.command({ collMod: 'refunds', validator: refundValidator })
})
it('enforces durable attempt identity, one open attempt, proof requirements and no TTL deletion', async () => {
  await initializeRefundAttemptPersistence(db.connection)
  const now = new Date(),
    refundId = new Types.ObjectId()
  const input = {
    refundId,
    attemptNumber: 1,
    idempotencyKey: 'synthetic',
    provider: 'sslcommerz',
    originalBankTranId: 'synthetic-bank',
    refundTransId: 'synthetic-refund',
    status: 'created',
    amountPoisha: 100,
    initiatedAt: now,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }
  const row = await new (refundAttemptModel(db.connection))(input).save({ timestamps: false })
  await expect(
    new (refundAttemptModel(db.connection))({
      ...input,
      attemptNumber: 2,
      idempotencyKey: 'different',
      refundTransId: 'different',
    }).save({ timestamps: false }),
  ).rejects.toThrow()
  await expect(
    refundAttemptModel(db.connection).updateOne(
      { _id: row._id },
      { $set: { status: 'confirmed' } },
    ),
  ).rejects.toThrow()
  await expect(
    db.connection
      .collection('refundAttempts')
      .updateOne({ _id: row._id }, { $set: { status: 'confirmed', confirmedAt: now } }),
  ).rejects.toThrow()
  expect(
    (await refundAttemptModel(db.connection).collection.indexes()).some(
      (i) => i.expireAfterSeconds !== undefined,
    ),
  ).toBe(false)
})
it('runs refund bootstrap additively against local/test history and refuses deployed configuration', async () => {
  const input = {
    orderId: new Types.ObjectId().toHexString(),
    paymentId: new Types.ObjectId().toHexString(),
    sourceCollectionId: new Types.ObjectId().toHexString(),
    amountPoisha: 100,
    decisionKey: 'c'.repeat(64),
  }
  await inTransaction(db.connection, (session) =>
    correctionObligationService(db.connection).create(session, input),
  )
  const before = await db.connection.collection('refunds').findOne({})
  const env = {
    ...identityEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-refunds.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect(await db.connection.collection('refunds').findOne({})).toEqual(before)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-refunds.mjs'], {
    env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(refused.status).not.toBe(0)
})

it('Package D migration: exact return notification predecessor upgrades additively and manual-reference index is provisioned', async () => {
  const { createRegistrationNotifications } = await import(
    '../../src/modules/notifications/notification.service.js'
  )
  const { returnNotificationValidator, registrationNotificationValidator } = await import(
    '../../src/modules/notifications/notification.persistence.js'
  )
  const store = createRegistrationNotifications(db.connection)
  await store.initialize()
  await db.connection.db?.command({
    collMod: 'notifications',
    validator: returnNotificationValidator,
  })
  await expect(store.verifyIndexes()).rejects.toThrow('Notification validator')
  await store.migrateFoundation()
  await store.migrateFoundation()
  await store.verifyIndexes()
  const collection = await db.connection.db
    ?.listCollections({ name: 'notifications' }, { nameOnly: false })
    .next()
  expect(collection?.options?.validator).toEqual(registrationNotificationValidator)
  await initializeRefundAttemptPersistence(db.connection)
  expect(
    (await refundAttemptModel(db.connection).collection.indexes()).find(
      (i) => i.name === 'refund_manual_transfer_unique',
    )?.unique,
  ).toBe(true)
})
it('Package D runner: compiled reconciliation refuses deployed configuration without provider effects', () => {
  const result = spawnSync(process.execPath, ['scripts/reconcile-refunds.mjs'], {
    env: {
      ...identityEnvironment(),
      APP_ENV: 'production',
      NODE_ENV: 'production',
      REFUND_RECONCILIATION_ENABLED: 'true',
    },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Refund reconciliation failed')
})

it('Package D runner: compiled local worker acquires and releases its durable lease with an empty due queue', async () => {
  const { initializeJobLeases } = await import('../../src/shared/jobs/job-lease.model.js')
  await initializeJobLeases(db.connection)
  await initializeRefundAttemptPersistence(db.connection)
  const result = spawnSync(process.execPath, ['scripts/reconcile-refunds.mjs'], {
    env: {
      ...identityEnvironment(),
      MONGODB_URI: db.replica.getUri(),
      MONGODB_DB_NAME: db.connection.name,
      REFUND_RECONCILIATION_ENABLED: 'true',
      REFUND_RECONCILIATION_BATCH_SIZE: '10',
      REFUND_RECONCILIATION_LEASE_MS: '60000',
      REFUND_RECONCILIATION_POLL_MS: '60000',
      SSLCOMMERZ_ADAPTER_ENABLED: 'true',
      SSLCOMMERZ_MODE: 'sandbox',
      SSLCOMMERZ_STORE_ID: 'synthetic-store',
      SSLCOMMERZ_STORE_PASSWORD: 'synthetic-password',
      SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test',
      SSLCOMMERZ_TIMEOUT_MS: '1000',
    },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    event: 'refund_reconciliation',
    acquired: true,
    scanned: 0,
  })
  expect(
    (await db.connection.collection('jobLeases').findOne({ jobKey: 'refund-reconciliation' }))
      ?.leaseOwner,
  ).toBeUndefined()
})

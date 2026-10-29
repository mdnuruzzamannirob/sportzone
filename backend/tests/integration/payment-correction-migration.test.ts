import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
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
} from '../../src/modules/refunds/refund.persistence.js'
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

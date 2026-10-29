import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { paymentInitiationModel, initiationStatuses } from './payment-initiation.model.js'
const hash = { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }
export const paymentInitiationValidator = {
  $and: [
    {
      $jsonSchema: {
        bsonType: 'object',
        additionalProperties: false,
        required: [
          '_id',
          'orderId',
          'scopeKeyHash',
          'idempotencyKeyHash',
          'requestFingerprint',
          'status',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          _id: { bsonType: 'objectId' },
          orderId: { bsonType: 'objectId' },
          merchantAccountKey: hash,
          gatewayKey: { bsonType: 'string', pattern: '^[A-Za-z0-9_]{1,30}$' },
          scopeKeyHash: hash,
          idempotencyKeyHash: hash,
          requestFingerprint: hash,
          attemptId: { bsonType: 'objectId' },
          status: { enum: [...initiationStatuses] },
          redirectUrl: { bsonType: 'string', minLength: 1, maxLength: 255, pattern: '^https://' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        },
      },
    },
    {
      $or: [
        {
          status: 'allocation_shortfall',
          merchantAccountKey: { $exists: false },
          gatewayKey: { $exists: false },
          attemptId: { $exists: false },
          redirectUrl: { $exists: false },
        },
        {
          status: { $in: ['dispatching', 'uncertain', 'rejected'] },
          attemptId: { $type: 'objectId' },
          merchantAccountKey: { $type: 'string' },
          gatewayKey: { $type: 'string' },
          redirectUrl: { $exists: false },
        },
        {
          status: 'accepted',
          attemptId: { $type: 'objectId' },
          merchantAccountKey: { $type: 'string' },
          gatewayKey: { $type: 'string' },
          redirectUrl: { $type: 'string' },
        },
      ],
    },
  ],
}
async function verifyValidator(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'paymentInitiations' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, paymentInitiationValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Payment initiation requires reviewed persistence')
}
export async function verifyPaymentInitiationPersistence(connection: Connection) {
  await verifyValidator(connection)
  const model = paymentInitiationModel(connection)
  await verifyDeclaredIndexes(model)
  if ((await model.collection.indexes()).some((index) => index.expireAfterSeconds !== undefined))
    throw new Error('Payment initiation identities must not expire')
}
export async function initializePaymentInitiationPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Payment database unavailable')
  if (!(await connection.db.listCollections({ name: 'paymentInitiations' }).hasNext()))
    await connection.db.createCollection('paymentInitiations', {
      validator: paymentInitiationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyValidator(connection)
  await createDeclaredIndexes(paymentInitiationModel(connection))
  await verifyPaymentInitiationPersistence(connection)
}

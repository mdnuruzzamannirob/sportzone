import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { refundModel } from './refund.model.js'
const id = { bsonType: 'objectId' },
  integer = {
    bsonType: ['int', 'long', 'double'],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    multipleOf: 1,
  }
// Canonical refunds, initially only the nonpaying correction-intent capability. Full approval/payout
// remains owned by refunds. An unreserved review intent is not a reservation or permission to pay.
const refundShape = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'orderId',
      'paymentId',
      'sourceCollectionId',
      'basis',
      'classification',
      'items',
      'merchandiseAmountPoisha',
      'deliveryAmountPoisha',
      'correctionAmountPoisha',
      'amountPoisha',
      'status',
      'capacityStatus',
      'decisionKey',
      'revision',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: id,
      orderId: id,
      paymentId: id,
      sourceCollectionId: id,
      basis: { enum: ['payment_correction'] },
      classification: { enum: ['payment_correction'] },
      items: { bsonType: 'array', maxItems: 0 },
      merchandiseAmountPoisha: { enum: [0] },
      deliveryAmountPoisha: { enum: [0] },
      correctionAmountPoisha: { ...integer, minimum: 1 },
      amountPoisha: { ...integer, minimum: 1 },
      status: { enum: ['under_review'] },
      capacityStatus: { enum: ['not_reserved'] },
      decisionKey: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
      revision: integer,
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
}
export const refundValidator = {
  $and: [refundShape, { $expr: { $eq: ['$amountPoisha', '$correctionAmountPoisha'] } }],
}
export async function verifyCorrectionPersistence(connection: Connection) {
  const collection = await connection.db
    ?.listCollections({ name: 'refunds' }, { nameOnly: false })
    .next()
  if (
    !collection ||
    !isDeepStrictEqual(collection.options?.validator, refundValidator) ||
    collection.options?.validationLevel !== 'strict' ||
    collection.options?.validationAction !== 'error'
  )
    throw new Error('Refund intent requires reviewed provisioning')
  await verifyDeclaredIndexes(refundModel(connection))
  if (
    (await refundModel(connection).collection.indexes()).some(
      (index) => index.expireAfterSeconds !== undefined,
    )
  )
    throw new Error('Refund intents cannot expire')
}
export async function initializeCorrectionPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'refunds' }).hasNext()))
    await connection.db.createCollection('refunds', {
      validator: refundValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  const collection = await connection.db
    .listCollections({ name: 'refunds' }, { nameOnly: false })
    .next()
  if (!isDeepStrictEqual(collection?.options?.validator, refundValidator))
    throw new Error('Unknown refund schema')
  await createDeclaredIndexes(refundModel(connection))
  await verifyCorrectionPersistence(connection)
}

import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { checkoutIntentModel } from './checkout-intent.model.js'
const hash = { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }
export const checkoutIntentValidator = {
  $and: [
    {
      $jsonSchema: {
        bsonType: 'object',
        additionalProperties: false,
        required: [
          '_id',
          'scopeType',
          'scopeKeyHash',
          'idempotencyKeyHash',
          'requestFingerprint',
          'quoteId',
          'status',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          _id: { bsonType: 'objectId' },
          scopeType: { enum: ['customer', 'guest_context'] },
          scopeKeyHash: hash,
          idempotencyKeyHash: hash,
          requestFingerprint: hash,
          quoteId: { bsonType: 'objectId' },
          orderId: { bsonType: 'objectId' },
          status: { enum: ['preparing', 'order_created', 'resolved'] },
          resultSnapshot: {
            bsonType: 'object',
            additionalProperties: false,
            required: ['orderId'],
            properties: { orderId: { bsonType: 'objectId' } },
          },
          replayUntil: { bsonType: 'date' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        },
      },
    },
    {
      $or: [
        { status: 'preparing', orderId: { $exists: false }, resultSnapshot: { $exists: false } },
        {
          status: { $in: ['order_created', 'resolved'] },
          orderId: { $type: 'objectId' },
          'resultSnapshot.orderId': { $type: 'objectId' },
          $expr: { $eq: ['$orderId', '$resultSnapshot.orderId'] },
        },
      ],
    },
  ],
}
async function verifyValidator(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'checkoutIntents' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, checkoutIntentValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Checkout intent persistence requires reviewed bootstrap/migration.')
}
export async function initializeCheckoutIntentPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Checkout database unavailable')
  if (!(await connection.db.listCollections({ name: 'checkoutIntents' }).hasNext()))
    await connection.db.createCollection('checkoutIntents', {
      validator: checkoutIntentValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyValidator(connection)
  await createDeclaredIndexes(checkoutIntentModel(connection))
  await verifyCheckoutIntentPersistence(connection)
}
export async function verifyCheckoutIntentPersistence(connection: Connection) {
  await verifyValidator(connection)
  await verifyDeclaredIndexes(checkoutIntentModel(connection))
  const indexes = await checkoutIntentModel(connection).collection.indexes()
  if (indexes.some((index) => index.expireAfterSeconds !== undefined))
    throw new Error('Checkout identity registry must not expire.')
}

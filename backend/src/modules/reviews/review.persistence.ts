import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { reviewModel } from './review.model.js'
const id = { bsonType: 'objectId' },
  date = { bsonType: 'date' }
export const reviewValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'userId',
      'productId',
      'orderId',
      'qualifyingOrderItemId',
      'rating',
      'comment',
      'status',
      'isActive',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: id,
      userId: id,
      productId: id,
      orderId: id,
      qualifyingOrderItemId: id,
      rating: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 5, multipleOf: 1 },
      comment: { bsonType: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
      status: { enum: ['pending', 'approved', 'rejected', 'hidden'] },
      isActive: { bsonType: 'bool' },
      moderatedAt: date,
      moderationReason: { bsonType: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' },
      createdAt: date,
      updatedAt: date,
    },
  },
  $expr: {
    $and: [
      { $eq: ['$comment', { $trim: { input: '$comment' } }] },
      {
        $or: [
          { $eq: ['$status', 'pending'] },
          {
            $and: [
              { $eq: [{ $type: '$moderatedAt' }, 'date'] },
              { $eq: [{ $type: '$moderationReason' }, 'string'] },
            ],
          },
        ],
      },
    ],
  },
}
async function verify(connection: Connection) {
  const row = await connection.db?.listCollections({ name: 'reviews' }, { nameOnly: false }).next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, reviewValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Review persistence requires reviewed bootstrap/migration.')
}
export async function initializeReviewPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'reviews' }).hasNext()))
    await connection.db.createCollection('reviews', {
      validator: reviewValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verify(connection)
  await createDeclaredIndexes(reviewModel(connection))
}
export async function verifyReviewPersistence(connection: Connection) {
  await verify(connection)
  await verifyDeclaredIndexes(reviewModel(connection))
}

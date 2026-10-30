import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { cancellationModel } from './cancellation.model.js'
const oid = { bsonType: 'objectId' },
  date = { bsonType: 'date' },
  text = { bsonType: 'string', minLength: 1, maxLength: 2000 },
  integer = {
    bsonType: ['int', 'long', 'double'],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    multipleOf: 1,
  }
export const cancellationValidator = {
  $and: [
    {
      $jsonSchema: {
        bsonType: 'object',
        additionalProperties: false,
        required: [
          '_id',
          'orderId',
          'requestedBy',
          'reason',
          'status',
          'operationKey',
          'revision',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          _id: oid,
          orderId: oid,
          requestedBy: {
            bsonType: 'object',
            additionalProperties: false,
            required: ['kind'],
            properties: {
              kind: { enum: ['customer', 'guest_order'] },
              userId: oid,
              guestSessionId: oid,
            },
            oneOf: [
              {
                properties: { kind: { enum: ['customer'] } },
                required: ['userId'],
                not: { required: ['guestSessionId'] },
              },
              {
                properties: { kind: { enum: ['guest_order'] } },
                required: ['guestSessionId'],
                not: { required: ['userId'] },
              },
            ],
          },
          reason: text,
          status: { enum: ['requested', 'approved', 'rejected'] },
          operationKey: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
          revision: integer,
          reviewedBy: oid,
          reviewedAt: date,
          decisionReason: text,
          createdAt: date,
          updatedAt: date,
        },
      },
    },
    {
      $or: [
        {
          status: 'requested',
          reviewedAt: { $exists: false },
          reviewedBy: { $exists: false },
          decisionReason: { $exists: false },
        },
        {
          status: { $in: ['approved', 'rejected'] },
          reviewedAt: { $type: 'date' },
          reviewedBy: { $type: 'objectId' },
          decisionReason: { $type: 'string' },
        },
      ],
    },
  ],
}
async function shape(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'cancellationRequests' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, cancellationValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Cancellation persistence requires reviewed bootstrap')
}
export async function verifyCancellationPersistence(connection: Connection) {
  await shape(connection)
  await verifyDeclaredIndexes(cancellationModel(connection))
  if (
    (await cancellationModel(connection).collection.indexes()).some(
      (i) => i.expireAfterSeconds !== undefined,
    )
  )
    throw new Error('Cancellation history cannot expire')
}
export async function initializeCancellationPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'cancellationRequests' }).hasNext()))
    await connection.db.createCollection('cancellationRequests', {
      validator: cancellationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await shape(connection)
  await createDeclaredIndexes(cancellationModel(connection))
  await verifyCancellationPersistence(connection)
}

import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { deliveryExceptionModel } from './delivery-exception.model.js'
const oid = { bsonType: 'objectId' },
  date = { bsonType: 'date' },
  text = { bsonType: 'string', minLength: 1, maxLength: 2000 },
  digest = { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
  integer = {
    bsonType: ['int', 'long', 'double'],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    multipleOf: 1,
  }
const object = (properties: Record<string, unknown>, required: string[]) => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
export const deliveryExceptionValidator = {
  $and: [
    {
      $expr: {
        $allElementsTrue: [
          {
            $map: {
              input: '$disposition',
              as: 'd',
              in: {
                $and: [
                  { $lte: ['$$d.inspectedResellableQty', '$$d.quantity'] },
                  {
                    $or: [
                      { $eq: ['$$d.custody', 'recovered'] },
                      { $eq: ['$$d.inspectedResellableQty', 0] },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    },
    {
      $or: [
        { status: 'open', dispositionDigest: { $exists: false } },
        {
          status: 'resolved',
          type: { $ne: 'final_non_delivery' },
          disposition: { $size: 0 },
          dispositionDigest: { $exists: false },
        },
        {
          status: 'resolved',
          type: 'final_non_delivery',
          'disposition.0': { $exists: true },
          dispositionDigest: { $type: 'string' },
        },
      ],
    },
    {
      $jsonSchema: object(
        {
          _id: oid,
          orderId: oid,
          type: { enum: ['delay', 'failed_attempt', 'final_non_delivery'] },
          reason: text,
          status: { enum: ['open', 'resolved'] },
          operationKey: digest,
          requestDigest: digest,
          revision: integer,
          createdAt: date,
          updatedAt: date,
          resolvedAt: date,
          resolution: text,
          dispositionDigest: digest,
          contactHistory: {
            bsonType: 'array',
            maxItems: 40,
            items: object(
              {
                at: date,
                channel: { enum: ['phone', 'email', 'sms', 'in_person', 'admin_record'] },
                outcome: text,
              },
              ['at', 'channel', 'outcome'],
            ),
          },
          disposition: {
            bsonType: 'array',
            maxItems: 200,
            items: object(
              {
                orderItemId: oid,
                quantity: { ...integer, minimum: 1, maximum: 50 },
                custody: { enum: ['recovered', 'lost', 'damaged', 'other'] },
                inspectedResellableQty: { ...integer, maximum: 50 },
              },
              ['orderItemId', 'quantity', 'custody', 'inspectedResellableQty'],
            ),
          },
        },
        [
          '_id',
          'orderId',
          'type',
          'reason',
          'status',
          'operationKey',
          'requestDigest',
          'revision',
          'createdAt',
          'updatedAt',
          'contactHistory',
          'disposition',
        ],
      ),
    },
    {
      $or: [
        {
          status: 'open',
          resolvedAt: { $exists: false },
          resolution: { $exists: false },
          disposition: { $size: 0 },
        },
        { status: 'resolved', resolvedAt: { $type: 'date' }, resolution: { $type: 'string' } },
      ],
    },
  ],
}
async function shape(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'deliveryExceptions' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, deliveryExceptionValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Delivery exception persistence requires reviewed bootstrap')
}
export async function verifyDeliveryExceptionPersistence(connection: Connection) {
  await shape(connection)
  await verifyDeclaredIndexes(deliveryExceptionModel(connection))
  if (
    (await deliveryExceptionModel(connection).collection.indexes()).some(
      (i) => i.expireAfterSeconds !== undefined,
    )
  )
    throw new Error('Exception evidence cannot expire')
}
export async function initializeDeliveryExceptionPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'deliveryExceptions' }).hasNext()))
    await connection.db.createCollection('deliveryExceptions', {
      validator: deliveryExceptionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await shape(connection)
  await createDeclaredIndexes(deliveryExceptionModel(connection))
  await verifyDeliveryExceptionPersistence(connection)
}

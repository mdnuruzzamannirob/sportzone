import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { returnModel } from './return.model.js'
const oid = { bsonType: 'objectId' },
  date = { bsonType: 'date' }
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const text = (maxLength: number) => ({
  bsonType: 'string',
  minLength: 1,
  maxLength,
})
const object = (properties: Record<string, unknown>, required: string[]) => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
const ordinals = {
  bsonType: 'array',
  maxItems: 50,
  uniqueItems: true,
  items: { ...integer, minimum: 1, maximum: 50 },
}
export const returnValidator = {
  $expr: {
    $and: [
      {
        $eq: [
          { $size: '$items' },
          {
            $size: {
              $setUnion: [{ $map: { input: '$items', as: 'i', in: '$$i.orderItemId' } }, []],
            },
          },
        ],
      },
      {
        $eq: [
          { $size: '$items' },
          { $size: { $setUnion: [{ $map: { input: '$items', as: 'i', in: '$$i.id' } }, []] } },
        ],
      },
      {
        $allElementsTrue: [
          {
            $map: {
              input: '$items',
              as: 'i',
              in: { $eq: ['$$i.requestedQty', { $size: '$$i.protectedUnitOrdinals' }] },
            },
          },
        ],
      },
    ],
  },
  $jsonSchema: object(
    {
      _id: oid,
      orderId: oid,
      requestedBy: object({ type: { enum: ['customer', 'guest'] }, id: oid }, ['type', 'id']),
      claimType: { enum: ['physical_return', 'shortage'] },
      items: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 50,
        items: object(
          {
            id: oid,
            orderItemId: oid,
            requestedQty: { ...integer, minimum: 1, maximum: 50 },
            protectedUnitOrdinals: { ...ordinals, minItems: 1 },
            approvedUnitOrdinals: { ...ordinals, maxItems: 0 },
            reason: text(2000),
            evidenceRefs: { bsonType: 'array', maxItems: 0 },
          },
          [
            'id',
            'orderItemId',
            'requestedQty',
            'protectedUnitOrdinals',
            'approvedUnitOrdinals',
            'reason',
            'evidenceRefs',
          ],
        ),
      },
      status: { enum: ['requested'] },
      requestedAt: date,
      eligibilitySnapshot: object(
        {
          policyVersion: text(100),
          deliveredAt: date,
          requestDeadlineAt: date,
          exceptionBasis: text(2000),
        },
        ['policyVersion'],
      ),
      revision: integer,
      createdAt: date,
      updatedAt: date,
    },
    [
      '_id',
      'orderId',
      'requestedBy',
      'claimType',
      'items',
      'status',
      'requestedAt',
      'eligibilitySnapshot',
      'revision',
      'createdAt',
      'updatedAt',
    ],
  ),
}
export async function verifyReturnPersistence(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'returnRequests' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, returnValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Return persistence requires reviewed bootstrap')
  await verifyDeclaredIndexes(returnModel(connection))
}
export async function initializeReturnPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'returnRequests' }).hasNext()))
    await connection.db.createCollection('returnRequests', {
      validator: returnValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  const row = await connection.db
    .listCollections({ name: 'returnRequests' }, { nameOnly: false })
    .next()
  if (
    !isDeepStrictEqual(row?.options?.validator, returnValidator) ||
    row?.options?.validationLevel !== 'strict' ||
    row?.options?.validationAction !== 'error'
  )
    throw new Error('Unknown return validator')
  await createDeclaredIndexes(returnModel(connection))
  await verifyReturnPersistence(connection)
}

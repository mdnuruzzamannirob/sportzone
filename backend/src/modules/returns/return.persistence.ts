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
function validator(lifecycle: boolean, physical = false) {
  return {
    $expr: {
      $and: [
        ...(lifecycle
          ? [
              {
                $allElementsTrue: [
                  {
                    $map: {
                      input: '$items',
                      as: 'i',
                      in: {
                        $setIsSubset: ['$$i.approvedUnitOrdinals', '$$i.protectedUnitOrdinals'],
                      },
                    },
                  },
                ],
              },
              {
                $or: [
                  { $ne: ['$status', 'completed'] },
                  { $eq: ['$claimType', 'shortage'] },
                  ...(physical
                    ? [
                        {
                          $and: [
                            { $eq: ['$claimType', 'physical_return'] },
                            { $eq: [{ $type: '$receivedAt' }, 'date'] },
                            { $eq: [{ $type: '$inspectedAt' }, 'date'] },
                            { $eq: [{ $type: '$receiptReference' }, 'string'] },
                            { $gte: ['$inspectedAt', '$receivedAt'] },
                            { $gte: ['$completedAt', '$inspectedAt'] },
                            {
                              $allElementsTrue: [
                                {
                                  $map: {
                                    input: '$items',
                                    as: 'i',
                                    in: {
                                      $setEquals: [
                                        '$$i.approvedUnitOrdinals',
                                        { $ifNull: ['$$i.acceptedUnitOrdinals', []] },
                                      ],
                                    },
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
              {
                $or: [
                  { $ne: ['$status', 'awaiting_return'] },
                  { $eq: ['$claimType', 'physical_return'] },
                ],
              },
              ...(physical
                ? [
                    {
                      $or: [
                        { $not: [{ $in: ['$status', ['received', 'inspected']] }] },
                        { $eq: ['$claimType', 'physical_return'] },
                      ],
                    },
                    {
                      $or: [
                        { $not: [{ $in: ['$status', ['received', 'inspected']] }] },
                        {
                          $and: [
                            { $eq: [{ $type: '$receivedAt' }, 'date'] },
                            { $gte: ['$receivedAt', '$approvedAt'] },
                            { $eq: [{ $type: '$receiptReference' }, 'string'] },
                          ],
                        },
                      ],
                    },
                    {
                      $or: [
                        { $ne: ['$status', 'inspected'] },
                        {
                          $and: [
                            { $eq: [{ $type: '$inspectedAt' }, 'date'] },
                            { $gte: ['$inspectedAt', '$receivedAt'] },
                          ],
                        },
                      ],
                    },
                    {
                      $allElementsTrue: [
                        {
                          $map: {
                            input: '$items',
                            as: 'i',
                            in: {
                              $and: [
                                {
                                  $setIsSubset: [
                                    { $ifNull: ['$$i.receivedUnitOrdinals', []] },
                                    '$$i.approvedUnitOrdinals',
                                  ],
                                },
                                {
                                  $setIsSubset: [
                                    { $ifNull: ['$$i.inspectedUnitOrdinals', []] },
                                    { $ifNull: ['$$i.receivedUnitOrdinals', []] },
                                  ],
                                },
                                {
                                  $setIsSubset: [
                                    { $ifNull: ['$$i.acceptedUnitOrdinals', []] },
                                    { $ifNull: ['$$i.inspectedUnitOrdinals', []] },
                                  ],
                                },
                                {
                                  $setIsSubset: [
                                    { $ifNull: ['$$i.resellableUnitOrdinals', []] },
                                    { $ifNull: ['$$i.acceptedUnitOrdinals', []] },
                                  ],
                                },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  ]
                : []),
              {
                $or: [
                  { $eq: ['$status', 'requested'] },
                  {
                    $and: [
                      { $eq: [{ $type: '$reviewedBy' }, 'objectId'] },
                      { $eq: [{ $type: '$decisionReason' }, 'string'] },
                    ],
                  },
                ],
              },
              {
                $or: [
                  {
                    $not: [
                      {
                        $in: [
                          '$status',
                          physical
                            ? ['approved', 'awaiting_return', 'received', 'inspected', 'completed']
                            : ['approved', 'awaiting_return', 'completed'],
                        ],
                      },
                    ],
                  },
                  {
                    $and: [
                      { $eq: [{ $type: '$approvedAt' }, 'date'] },
                      { $gte: ['$approvedAt', '$requestedAt'] },
                      {
                        $anyElementTrue: [
                          {
                            $map: {
                              input: '$items',
                              as: 'i',
                              in: { $gt: [{ $size: '$$i.approvedUnitOrdinals' }, 0] },
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                $or: [
                  { $ne: ['$status', 'completed'] },
                  {
                    $and: [
                      { $eq: [{ $type: '$completedAt' }, 'date'] },
                      { $gte: ['$completedAt', '$approvedAt'] },
                    ],
                  },
                ],
              },
            ]
          : []),
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
              approvedUnitOrdinals: { ...ordinals, maxItems: lifecycle ? 50 : 0 },
              ...(physical
                ? {
                    receivedUnitOrdinals: ordinals,
                    inspectedUnitOrdinals: ordinals,
                    acceptedUnitOrdinals: ordinals,
                    resellableUnitOrdinals: ordinals,
                    inspectionReason: text(2000),
                  }
                : {}),
              reason: text(2000),
              evidenceRefs: {
                bsonType: 'array',
                maxItems: lifecycle ? 5 : 0,
                uniqueItems: true,
                items: oid,
              },
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
        status: {
          enum: lifecycle
            ? physical
              ? [
                  'requested',
                  'under_review',
                  'approved',
                  'awaiting_return',
                  'received',
                  'inspected',
                  'completed',
                  'rejected',
                ]
              : [
                  'requested',
                  'under_review',
                  'approved',
                  'awaiting_return',
                  'completed',
                  'rejected',
                ]
            : ['requested'],
        },
        ...(lifecycle
          ? {
              approvedAt: date,
              completedAt: date,
              reviewedBy: oid,
              decisionReason: text(2000),
              ...(physical
                ? { receivedAt: date, inspectedAt: date, receiptReference: text(2000) }
                : {}),
            }
          : {}),
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
}
export const foundationReturnValidator = validator(false)
export const reviewReturnValidator = validator(true)
export const returnValidator = validator(true, true)
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

// Explicit local/test script owns this additive upgrade; ordinary startup never repairs drift.
export async function upgradeReturnLifecyclePersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  const row = await connection.db
    .listCollections({ name: 'returnRequests' }, { nameOnly: false })
    .next()
  if (row?.options?.validationLevel !== 'strict' || row.options?.validationAction !== 'error')
    throw new Error('Unknown return validator')
  if (isDeepStrictEqual(row.options?.validator, returnValidator)) {
    await verifyReturnPersistence(connection)
    return
  }
  if (
    !isDeepStrictEqual(row.options?.validator, foundationReturnValidator) &&
    !isDeepStrictEqual(row.options?.validator, reviewReturnValidator)
  )
    throw new Error('Unknown return validator')
  await verifyDeclaredIndexes(returnModel(connection))
  await connection.db.command({
    collMod: 'returnRequests',
    validator: returnValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await verifyReturnPersistence(connection)
}

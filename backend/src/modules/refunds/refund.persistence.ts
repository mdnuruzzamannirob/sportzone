import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
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

const precedingRefundValidator = {
  $and: [refundShape, { $expr: { $eq: ['$amountPoisha', '$correctionAmountPoisha'] } }],
}

const text = (maxLength: number) => ({ bsonType: 'string', minLength: 1, maxLength })

const date = { bsonType: 'date' }

const currentShape = {
  $jsonSchema: {
    ...refundShape.$jsonSchema,
    properties: {
      ...refundShape.$jsonSchema.properties,
      basis: {
        enum: [
          'cancellation',
          'physical_return',
          'shortage',
          'delivery_exception',
          'payment_correction',
        ],
      },
      basisRefId: id,
      refundGroupKey: { ...text(64), pattern: '^[a-f0-9]{64}$' },
      classification: { enum: ['merchandise', 'payment_correction'] },
      items: {
        bsonType: 'array',
        maxItems: 50,
        items: {
          bsonType: 'object',
          additionalProperties: false,
          required: ['orderItemId', 'unitAmounts', 'amountPoisha'],
          properties: {
            orderItemId: id,
            amountPoisha: { ...integer, minimum: 1 },
            unitAmounts: {
              bsonType: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                bsonType: 'object',
                additionalProperties: false,
                required: ['ordinal', 'amountPoisha'],
                properties: {
                  ordinal: { ...integer, minimum: 1, maximum: 50 },
                  amountPoisha: { ...integer, minimum: 1 },
                },
              },
            },
          },
        },
      },
      merchandiseAmountPoisha: integer,
      deliveryAmountPoisha: integer,
      correctionAmountPoisha: integer,
      method: { enum: ['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank'] },
      policyVersion: text(100),
      consentEvidenceRef: text(256),
      approvedBy: id,
      approvedAt: date,
      completedAt: date,
      timingSnapshot: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['policyVersion', 'timezone', 'targetBusinessDays', 'status'],
        properties: {
          policyVersion: text(100),
          timezone: { enum: ['Asia/Dhaka'] },
          targetBusinessDays: { ...integer, minimum: 1, maximum: 7 },
          calendarVersion: text(100),
          legalRuleRef: text(256),
          targetAt: date,
          status: { enum: ['calculated', 'under_review'] },
        },
      },
      status: {
        enum: [
          'requested',
          'under_review',
          'approved',
          'processing',
          'completed',
          'failed',
          'rejected',
        ],
      },
      capacityStatus: { enum: ['not_reserved', 'reserved', 'completed', 'released'] },
    },
  },
}

const refundValidator = {
  $and: [
    currentShape,
    {
      $expr: {
        $and: [
          {
            $eq: [
              '$amountPoisha',
              {
                $add: [
                  '$merchandiseAmountPoisha',
                  '$deliveryAmountPoisha',
                  '$correctionAmountPoisha',
                ],
              },
            ],
          },
          { $eq: ['$merchandiseAmountPoisha', { $sum: '$items.amountPoisha' }] },
          { $eq: [{ $size: '$items' }, { $size: { $setUnion: ['$items.orderItemId', []] } }] },
          {
            $allElementsTrue: [
              {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: {
                    $and: [
                      { $eq: ['$$item.amountPoisha', { $sum: '$$item.unitAmounts.amountPoisha' }] },
                      {
                        $eq: [
                          { $size: '$$item.unitAmounts' },
                          { $size: { $setUnion: ['$$item.unitAmounts.ordinal', []] } },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
          {
            $cond: [
              { $eq: ['$classification', 'payment_correction'] },
              {
                $and: [
                  { $eq: ['$basis', 'payment_correction'] },
                  { $eq: [{ $size: '$items' }, 0] },
                  { $eq: ['$merchandiseAmountPoisha', 0] },
                  { $eq: ['$deliveryAmountPoisha', 0] },
                ],
              },
              {
                $and: [
                  { $ne: ['$basis', 'payment_correction'] },
                  { $eq: ['$correctionAmountPoisha', 0] },
                  { $eq: [{ $type: '$basisRefId' }, 'objectId'] },
                ],
              },
            ],
          },
          {
            $or: [
              {
                $and: [
                  { $eq: ['$classification', 'payment_correction'] },
                  { $eq: ['$status', 'under_review'] },
                  { $eq: ['$capacityStatus', 'not_reserved'] },
                ],
              },
              {
                $and: [
                  { $eq: [{ $type: '$method' }, 'string'] },
                  { $eq: [{ $type: '$policyVersion' }, 'string'] },
                ],
              },
            ],
          },
          {
            $or: [
              { $not: [{ $in: ['$status', ['approved', 'processing', 'completed']] }] },
              {
                $and: [
                  { $eq: [{ $type: '$approvedBy' }, 'objectId'] },
                  { $eq: [{ $type: '$approvedAt' }, 'date'] },
                  { $gte: ['$approvedAt', '$createdAt'] },
                  { $eq: [{ $type: '$timingSnapshot' }, 'object'] },
                  { $eq: ['$timingSnapshot.policyVersion', '$policyVersion'] },
                  { $in: ['$capacityStatus', ['reserved', 'completed']] },
                ],
              },
            ],
          },
          {
            $or: [
              { $ne: ['$status', 'completed'] },
              {
                $and: [
                  { $eq: ['$capacityStatus', 'completed'] },
                  { $eq: [{ $type: '$completedAt' }, 'date'] },
                  { $gte: ['$completedAt', '$approvedAt'] },
                ],
              },
            ],
          },
          { $or: [{ $ne: ['$capacityStatus', 'completed'] }, { $eq: ['$status', 'completed'] }] },
          {
            $or: [
              { $ne: ['$timingSnapshot.status', 'calculated'] },
              {
                $and: [
                  { $eq: [{ $type: '$timingSnapshot.targetAt' }, 'date'] },
                  { $eq: [{ $type: '$timingSnapshot.calendarVersion' }, 'string'] },
                  { $gte: ['$timingSnapshot.targetAt', '$approvedAt'] },
                ],
              },
            ],
          },
          {
            $or: [
              { $ne: ['$timingSnapshot.status', 'under_review'] },
              { $eq: [{ $type: '$timingSnapshot.targetAt' }, 'missing'] },
            ],
          },
          {
            $or: [
              { $not: [{ $in: ['$capacityStatus', ['reserved', 'completed']] }] },
              {
                $and: [
                  { $eq: [{ $type: '$approvedAt' }, 'date'] },
                  { $eq: [{ $type: '$approvedBy' }, 'objectId'] },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
}

async function verifyCorrectionPersistence(connection: Connection) {
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

async function initializeCorrectionPersistence(connection: Connection) {
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

// Explicit additive migration only. Existing immutable correction intents remain byte-for-byte.
async function migrateRefundPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  const row = await connection.db.listCollections({ name: 'refunds' }, { nameOnly: false }).next()
  if (!row) return initializeCorrectionPersistence(connection)
  if (isDeepStrictEqual(row.options?.validator, refundValidator)) {
    await createDeclaredIndexes(refundModel(connection))
    return verifyCorrectionPersistence(connection)
  }
  if (
    !isDeepStrictEqual(row.options?.validator, precedingRefundValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Unknown refund schema')
  await createDeclaredIndexes(refundModel(connection))
  if (await connection.db.collection('refunds').findOne({ $nor: [refundValidator] }))
    throw new Error('Existing refund does not satisfy upgraded schema')
  await connection.db.command({
    collMod: 'refunds',
    validator: refundValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  })
  await verifyCorrectionPersistence(connection)
}

export {
  initializeCorrectionPersistence,
  migrateRefundPersistence,
  precedingRefundValidator,
  refundValidator,
  verifyCorrectionPersistence,
}

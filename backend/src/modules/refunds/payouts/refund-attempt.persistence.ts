import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../../shared/database/indexes.js'
import { refundAttemptModel } from './refund-attempt.model.js'

const money = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}

const text = (maxLength: number) => ({ bsonType: 'string', minLength: 1, maxLength })

const date = { bsonType: 'date' },
  oid = { bsonType: 'objectId' }

const refundAttemptValidator = {
  $and: [
    {
      $jsonSchema: {
        bsonType: 'object',
        additionalProperties: false,
        required: [
          '_id',
          'refundId',
          'attemptNumber',
          'idempotencyKey',
          'provider',
          'status',
          'amountPoisha',
          'initiatedAt',
          'revision',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          _id: oid,
          refundId: oid,
          attemptNumber: { ...money, minimum: 1 },
          idempotencyKey: text(128),
          provider: { enum: ['sslcommerz', 'manual'] },
          originalBankTranId: text(256),
          refundTransId: text(30),
          refundRefId: text(50),
          status: { enum: ['created', 'submitted', 'uncertain', 'confirmed', 'failed'] },
          amountPoisha: { ...money, minimum: 1 },
          initiatedAt: date,
          lastCheckedAt: date,
          confirmedAt: date,
          manualEvidence: {
            bsonType: 'object',
            additionalProperties: false,
            required: [
              'destinationMasked',
              'transferReference',
              'evidenceDigest',
              'confirmedBy',
              'confirmedAt',
            ],
            properties: {
              destinationMasked: { ...text(200), pattern: '[*•]' },
              transferReference: text(256),
              evidenceDigest: { ...text(64), pattern: '^[a-f0-9]{64}$' },
              confirmedBy: oid,
              confirmedAt: date,
            },
          },
          failureCode: text(128),
          lastOperationKey: text(128),
          revision: money,
          createdAt: date,
          updatedAt: date,
        },
      },
    },
    {
      $expr: {
        $and: [
          { $gte: ['$initiatedAt', '$createdAt'] },
          {
            $or: [
              { $eq: [{ $type: '$lastCheckedAt' }, 'missing'] },
              { $gte: ['$lastCheckedAt', '$initiatedAt'] },
            ],
          },
          {
            $cond: [
              { $eq: ['$provider', 'sslcommerz'] },
              {
                $and: [
                  { $eq: [{ $type: '$originalBankTranId' }, 'string'] },
                  { $eq: [{ $type: '$refundTransId' }, 'string'] },
                  { $eq: [{ $type: '$manualEvidence' }, 'missing'] },
                ],
              },
              {
                $and: [
                  { $eq: [{ $type: '$originalBankTranId' }, 'missing'] },
                  { $eq: [{ $type: '$refundTransId' }, 'missing'] },
                  { $eq: [{ $type: '$refundRefId' }, 'missing'] },
                ],
              },
            ],
          },
          {
            $cond: [
              { $eq: ['$status', 'confirmed'] },
              {
                $and: [
                  { $eq: [{ $type: '$confirmedAt' }, 'date'] },
                  { $gte: ['$confirmedAt', '$initiatedAt'] },
                  {
                    $cond: [
                      { $eq: ['$provider', 'sslcommerz'] },
                      { $eq: [{ $type: '$refundRefId' }, 'string'] },
                      {
                        $and: [
                          { $eq: [{ $type: '$manualEvidence' }, 'object'] },
                          { $eq: ['$manualEvidence.confirmedAt', '$confirmedAt'] },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                $and: [
                  { $eq: [{ $type: '$confirmedAt' }, 'missing'] },
                  { $eq: [{ $type: '$manualEvidence' }, 'missing'] },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
}

async function verifyRefundAttemptPersistence(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'refundAttempts' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, refundAttemptValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Refund attempt persistence requires reviewed provisioning')
  await verifyDeclaredIndexes(refundAttemptModel(connection))
  if (
    (await refundAttemptModel(connection).collection.indexes()).some(
      (index) => index.expireAfterSeconds !== undefined,
    )
  )
    throw new Error('Refund attempts cannot expire')
}

async function initializeRefundAttemptPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'refundAttempts' }).hasNext()))
    await connection.db.createCollection('refundAttempts', {
      validator: refundAttemptValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  const row = await connection.db
    .listCollections({ name: 'refundAttempts' }, { nameOnly: false })
    .next()
  if (!isDeepStrictEqual(row?.options?.validator, refundAttemptValidator))
    throw new Error('Unknown refund attempt schema')
  await createDeclaredIndexes(refundAttemptModel(connection))
  await verifyRefundAttemptPersistence(connection)
}

export {
  initializeRefundAttemptPersistence,
  refundAttemptValidator,
  verifyRefundAttemptPersistence,
}

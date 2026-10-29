import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import {
  paymentRecordModels,
  attemptStates,
  amountDispositions,
  collectionAmounts,
} from './payment-record.model.js'
import { initializePaymentPersistence, verifyPaymentPersistence } from './payment.persistence.js'
import { paymentModel } from './payment.model.js'
const id = { bsonType: 'objectId' },
  date = { bsonType: 'date' },
  integer = {
    bsonType: ['int', 'long', 'double'],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    multipleOf: 1,
  }
const positive = { ...integer, minimum: 1 },
  text = (max = 256) => ({
    bsonType: 'string',
    minLength: 1,
    maxLength: max,
    pattern: '^[^\\x00-\\x1f\\x7f]+$',
  }),
  digest = { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }
const object = (properties: Record<string, unknown>, required: string[]) => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
const base = { _id: id, createdAt: date, updatedAt: date }
export const paymentRecordValidators = {
  paymentAttempts: {
    $and: [
      {
        $jsonSchema: object(
          {
            ...base,
            paymentId: id,
            orderId: id,
            provider: { enum: ['sslcommerz'] },
            tranId: text(30),
            expectedAmountPoisha: positive,
            initiatedOutstandingPoisha: positive,
            currency: { enum: ['BDT'] },
            verifiedReceiptAmountPoisha: integer,
            amountDisposition: { enum: [...amountDispositions] },
            requestedChannel: { enum: ['bkash', 'nagad', 'rocket', 'provider_other'] },
            state: { enum: [...attemptStates] },
            providerSessionId: text(),
            providerValidationId: text(),
            bankTranId: text(),
            riskLevel: integer,
            riskTitle: text(200),
            initiatedAt: date,
            expiresAt: date,
            lastCheckedAt: date,
            retryOfAttemptId: id,
            verification: object(
              {
                verifiedAt: date,
                verifiedStatus: text(64),
                merchantIdMatch: { bsonType: 'bool' },
                amountMatch: { bsonType: 'bool' },
                currencyMatch: { bsonType: 'bool' },
                referenceMatch: { bsonType: 'bool' },
                rawRecordDigest: digest,
              },
              [
                'verifiedAt',
                'verifiedStatus',
                'merchantIdMatch',
                'amountMatch',
                'currencyMatch',
                'referenceMatch',
                'rawRecordDigest',
              ],
            ),
          },
          [
            ...Object.keys(base),
            'paymentId',
            'orderId',
            'provider',
            'tranId',
            'expectedAmountPoisha',
            'initiatedOutstandingPoisha',
            'currency',
            'amountDisposition',
            'state',
          ],
        ),
      },
      { $expr: { $eq: ['$expectedAmountPoisha', '$initiatedOutstandingPoisha'] } },
      {
        $or: [
          { state: { $nin: ['verified_failed', 'verified_cancelled', 'verified_paid'] } },
          { verification: { $type: 'object' } },
        ],
      },
      {
        $or: [
          { state: { $ne: 'verified_paid' } },
          {
            verifiedReceiptAmountPoisha: { $gt: 0 },
            amountDisposition: { $ne: 'not_checked' },
            'verification.merchantIdMatch': true,
            'verification.currencyMatch': true,
            'verification.referenceMatch': true,
          },
        ],
      },
      {
        $or: [
          { amountDisposition: { $nin: ['matched', 'under_collected', 'over_collected'] } },
          { verifiedReceiptAmountPoisha: { $type: 'number' }, verification: { $type: 'object' } },
        ],
      },
      {
        $expr: {
          $and: [
            {
              $or: [
                { $ne: ['$amountDisposition', 'matched'] },
                {
                  $and: [
                    { $eq: ['$verifiedReceiptAmountPoisha', '$expectedAmountPoisha'] },
                    { $eq: ['$verification.amountMatch', true] },
                  ],
                },
              ],
            },
            {
              $or: [
                { $ne: ['$amountDisposition', 'under_collected'] },
                { $lt: ['$verifiedReceiptAmountPoisha', '$expectedAmountPoisha'] },
              ],
            },
            {
              $or: [
                { $ne: ['$amountDisposition', 'over_collected'] },
                { $gt: ['$verifiedReceiptAmountPoisha', '$expectedAmountPoisha'] },
              ],
            },
          ],
        },
      },
    ],
  },
  providerReceiptIntake: {
    $and: [
      {
        $jsonSchema: object(
          {
            ...base,
            provider: { enum: ['sslcommerz'] },
            merchantAccountKey: text(128),
            providerCollectionRef: text(),
            bankTranId: text(),
            validationId: text(),
            reportedTranId: text(),
            amountPoisha: positive,
            currency: { enum: ['BDT'] },
            collectedAt: date,
            verifiedAt: date,
            validationDigest: digest,
            matchingStatus: { enum: ['unmatched', 'linked', 'quarantined'] },
            linkedCollectionId: id,
            resolutionKey: text(128),
            resolvedBy: id,
            resolvedAt: date,
          },
          [
            ...Object.keys(base),
            'provider',
            'merchantAccountKey',
            'providerCollectionRef',
            'amountPoisha',
            'currency',
            'collectedAt',
            'verifiedAt',
            'validationDigest',
            'matchingStatus',
          ],
        ),
      },
      {
        $or: [
          { matchingStatus: 'linked', linkedCollectionId: { $type: 'objectId' } },
          { matchingStatus: { $ne: 'linked' }, linkedCollectionId: { $exists: false } },
        ],
      },
    ],
  },
  paymentCollections: {
    $and: [
      {
        $jsonSchema: object(
          {
            ...base,
            paymentId: id,
            orderId: id,
            intakeId: id,
            attemptId: id,
            provider: { enum: ['sslcommerz', 'cod_manual'] },
            merchantAccountKey: text(128),
            providerCollectionRef: text(),
            bankTranId: text(),
            validationId: text(),
            amountPoisha: positive,
            currency: { enum: ['BDT'] },
            collectedAt: date,
            verifiedAt: date,
            evidenceDigest: digest,
            verifiedBy: object({ type: { enum: ['provider', 'admin'] }, actorId: id }, ['type']),
            ...Object.fromEntries(collectionAmounts.map((name) => [name, integer])),
            revision: integer,
          },
          [
            ...Object.keys(base),
            'paymentId',
            'orderId',
            'provider',
            'merchantAccountKey',
            'providerCollectionRef',
            'amountPoisha',
            'currency',
            'collectedAt',
            'verifiedAt',
            'evidenceDigest',
            'verifiedBy',
            ...collectionAmounts,
            'revision',
          ],
        ),
      },
      {
        $or: [
          {
            provider: 'sslcommerz',
            intakeId: { $type: 'objectId' },
            'verifiedBy.type': 'provider',
            'verifiedBy.actorId': { $exists: false },
          },
          {
            provider: 'cod_manual',
            merchantAccountKey: 'internal',
            intakeId: { $exists: false },
            attemptId: { $exists: false },
            'verifiedBy.type': 'admin',
            'verifiedBy.actorId': { $type: 'objectId' },
          },
        ],
      },
      {
        $expr: {
          $and: [
            {
              $eq: [
                '$amountPoisha',
                {
                  $add: [
                    '$merchandiseAllocatedPoisha',
                    '$correctionAllocatedPoisha',
                    '$unassignedAllocatedPoisha',
                  ],
                },
              ],
            },
            {
              $lte: [
                { $add: ['$merchandiseRefundHeldPoisha', '$merchandiseRefundCompletedPoisha'] },
                '$merchandiseAllocatedPoisha',
              ],
            },
            {
              $lte: [
                { $add: ['$correctionRefundHeldPoisha', '$correctionRefundCompletedPoisha'] },
                '$correctionAllocatedPoisha',
              ],
            },
          ],
        },
      },
    ],
  },
}
async function verifyValidator(connection: Connection, name: keyof typeof paymentRecordValidators) {
  const row = await connection.db?.listCollections({ name }, { nameOnly: false }).next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, paymentRecordValidators[name]) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Payment records require reviewed provisioning.')
}
export async function initializePaymentRecordPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Payment database unavailable')
  await initializePaymentPersistence(connection)
  for (const name of Object.keys(
    paymentRecordValidators,
  ) as (keyof typeof paymentRecordValidators)[]) {
    if (!(await connection.db.listCollections({ name }).hasNext()))
      await connection.db.createCollection(name, {
        validator: paymentRecordValidators[name],
        validationLevel: 'strict',
        validationAction: 'error',
      })
    await verifyValidator(connection, name)
  }
  const models = paymentRecordModels(connection)
  await createDeclaredIndexes(models.attempts)
  await createDeclaredIndexes(models.intake)
  await createDeclaredIndexes(models.collections)
  await verifyPaymentRecordPersistence(connection)
}
export async function verifyPaymentRecordPersistence(connection: Connection) {
  await verifyPaymentPersistence(connection)
  const models = paymentRecordModels(connection)
  for (const name of Object.keys(
    paymentRecordValidators,
  ) as (keyof typeof paymentRecordValidators)[])
    await verifyValidator(connection, name)
  for (const model of [
    models.attempts,
    models.intake,
    models.collections,
    paymentModel(connection),
  ]) {
    await verifyDeclaredIndexes(model)
    if ((await model.collection.indexes()).some((index) => index.expireAfterSeconds !== undefined))
      throw new Error('Payment history must not use TTL.')
  }
}

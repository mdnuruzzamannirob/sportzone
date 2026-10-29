import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { paymentAmounts, paymentModel, paymentStates } from './payment.model.js'
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
export const paymentValidator = {
  $and: [
    {
      $jsonSchema: {
        bsonType: 'object',
        additionalProperties: false,
        required: [
          '_id',
          'orderId',
          'method',
          'expectedPoisha',
          'currency',
          'paymentStatus',
          'riskStatus',
          'revision',
          'createdAt',
          'updatedAt',
          ...paymentAmounts,
        ],
        properties: {
          _id: { bsonType: 'objectId' },
          orderId: { bsonType: 'objectId' },
          method: { enum: ['cod', 'online'] },
          expectedPoisha: integer,
          currency: { enum: ['BDT'] },
          paymentStatus: { enum: [...paymentStates] },
          riskStatus: { enum: ['clear', 'review', 'rejected'] },
          revision: integer,
          ...Object.fromEntries(paymentAmounts.map((name) => [name, integer])),
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          lastReconciledAt: { bsonType: 'date' },
        },
      },
    },
    {
      $expr: {
        $and: [
          {
            $or: [
              { $ne: ['$paymentStatus', 'paid'] },
              {
                $and: [
                  { $eq: ['$merchandiseFundedPoisha', '$expectedPoisha'] },
                  { $gt: ['$verifiedCollectedPoisha', 0] },
                ],
              },
            ],
          },
          {
            $eq: [
              '$verifiedCollectedPoisha',
              {
                $add: [
                  '$merchandiseFundedPoisha',
                  '$correctionCollectedPoisha',
                  '$unassignedCollectedPoisha',
                ],
              },
            ],
          },
          { $lte: ['$merchandiseFundedPoisha', '$expectedPoisha'] },
          {
            $lte: [
              {
                $add: ['$merchandiseRefundHeldPoisha', '$merchandiseRefundCompletedPoisha'],
              },
              '$merchandiseFundedPoisha',
            ],
          },
          {
            $lte: [
              {
                $add: ['$correctionRefundHeldPoisha', '$correctionRefundCompletedPoisha'],
              },
              '$correctionCollectedPoisha',
            ],
          },
          {
            $lte: ['$deliveryRefundHeldPoisha', '$merchandiseRefundHeldPoisha'],
          },
          {
            $lte: ['$deliveryRefundCompletedPoisha', '$merchandiseRefundCompletedPoisha'],
          },
        ],
      },
    },
  ],
}
async function verify(connection: Connection) {
  const row = await connection.db?.listCollections({ name: 'payments' }, { nameOnly: false }).next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, paymentValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Payment persistence requires reviewed bootstrap/migration.')
}
export async function initializePaymentPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Payment database unavailable')
  if (!(await connection.db.listCollections({ name: 'payments' }).hasNext()))
    await connection.db.createCollection('payments', {
      validator: paymentValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verify(connection)
  await createDeclaredIndexes(paymentModel(connection))
}
export async function verifyPaymentPersistence(connection: Connection) {
  await verify(connection)
  await verifyDeclaredIndexes(paymentModel(connection))
}

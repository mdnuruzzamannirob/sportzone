import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { couponModels } from './coupon.model.js'

const id = { bsonType: 'objectId' },
  date = { bsonType: 'date' }
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const positive = { ...integer, minimum: 1 }
const base = { _id: id, createdAt: date, updatedAt: date }
const object = (properties: Record<string, unknown>, required: string[]) => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
const list = (max: number) => ({ bsonType: 'array', maxItems: max, uniqueItems: true, items: id })
const terms = object(
  {
    code: { bsonType: 'string', minLength: 1, maxLength: 64 },
    type: { enum: ['fixed', 'percentage'] },
    value: positive,
    version: integer,
    discountPoisha: integer,
    eligibleLineIds: { ...list(40), minItems: 1 },
  },
  ['code', 'type', 'value', 'version', 'discountPoisha', 'eligibleLineIds'],
)
export const couponValidators = {
  coupons: {
    $jsonSchema: object(
      {
        ...base,
        codeNormalized: { bsonType: 'string', minLength: 1, maxLength: 64 },
        type: { enum: ['fixed', 'percentage'] },
        value: positive,
        minEligibleSubtotalPoisha: integer,
        startsAt: date,
        expiresAt: date,
        status: { enum: ['active', 'inactive'] },
        overallLimit: positive,
        perCustomerLimit: positive,
        heldCount: integer,
        redeemedCount: integer,
        termsVersion: integer,
        revision: integer,
        eligibleProductIds: list(200),
        eligibleCategoryIds: list(200),
      },
      [
        ...Object.keys(base),
        'codeNormalized',
        'type',
        'value',
        'minEligibleSubtotalPoisha',
        'startsAt',
        'expiresAt',
        'status',
        'heldCount',
        'redeemedCount',
        'termsVersion',
        'revision',
      ],
    ),
    $expr: {
      $and: [
        { $lt: ['$startsAt', '$expiresAt'] },
        { $or: [{ $ne: ['$type', 'percentage'] }, { $lte: ['$value', 10000] }] },
        { $eq: ['$codeNormalized', { $toUpper: { $trim: { input: '$codeNormalized' } } }] },
        {
          $or: [
            { $eq: [{ $type: '$overallLimit' }, 'missing'] },
            { $lte: [{ $add: ['$heldCount', '$redeemedCount'] }, '$overallLimit'] },
          ],
        },
      ],
    },
  },
  couponCustomerCounters: {
    $jsonSchema: object(
      {
        ...base,
        couponId: id,
        userId: id,
        heldCount: integer,
        redeemedCount: integer,
        revision: integer,
      },
      [...Object.keys(base), 'couponId', 'userId', 'heldCount', 'redeemedCount', 'revision'],
    ),
  },
  couponRedemptions: {
    $jsonSchema: object(
      {
        ...base,
        couponId: id,
        orderId: id,
        userId: id,
        generation: positive,
        status: { enum: ['held', 'redeemed', 'released'] },
        activeKey: { enum: ['active'] },
        termsSnapshot: terms,
        heldAt: date,
        expiresAt: date,
        redeemedAt: date,
        releasedAt: date,
        lastOperationKey: { bsonType: 'string', minLength: 1, maxLength: 128 },
      },
      [...Object.keys(base), 'couponId', 'orderId', 'generation', 'status', 'termsSnapshot'],
    ),
    $expr: {
      $and: [
        {
          $or: [
            { $ne: ['$termsSnapshot.type', 'percentage'] },
            { $lte: ['$termsSnapshot.value', 10000] },
          ],
        },
        {
          $or: [
            {
              $and: [
                { $eq: ['$status', 'held'] },
                { $eq: ['$activeKey', 'active'] },
                { $eq: [{ $type: '$heldAt' }, 'date'] },
                { $eq: [{ $type: '$expiresAt' }, 'date'] },
                { $eq: [{ $subtract: ['$expiresAt', '$heldAt'] }, 900000] },
              ],
            },
            {
              $and: [
                { $eq: ['$status', 'redeemed'] },
                { $eq: ['$activeKey', 'active'] },
                { $eq: [{ $type: '$redeemedAt' }, 'date'] },
                { $eq: [{ $type: '$expiresAt' }, 'missing'] },
              ],
            },
            {
              $and: [
                { $eq: ['$status', 'released'] },
                { $eq: [{ $type: '$activeKey' }, 'missing'] },
                { $eq: [{ $type: '$expiresAt' }, 'missing'] },
                { $eq: [{ $type: '$releasedAt' }, 'date'] },
              ],
            },
          ],
        },
      ],
    },
  },
}
async function verify(connection: Connection, name: keyof typeof couponValidators) {
  const row = await connection.db?.listCollections({ name }, { nameOnly: false }).next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, couponValidators[name]) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Coupon persistence requires reviewed bootstrap/migration.')
}
export async function initializeCouponPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  for (const name of Object.keys(couponValidators) as (keyof typeof couponValidators)[]) {
    if (!(await connection.db.listCollections({ name }).hasNext()))
      await connection.db.createCollection(name, {
        validator: couponValidators[name],
        validationLevel: 'strict',
        validationAction: 'error',
      })
    await verify(connection, name)
  }
  const models = couponModels(connection)
  await createDeclaredIndexes(models.coupons)
  await createDeclaredIndexes(models.redemptions)
  await createDeclaredIndexes(models.customers)
}
export async function verifyCouponPersistence(connection: Connection) {
  for (const name of Object.keys(couponValidators) as (keyof typeof couponValidators)[])
    await verify(connection, name)
  const models = couponModels(connection)
  await verifyDeclaredIndexes(models.coupons)
  await verifyDeclaredIndexes(models.redemptions)
  await verifyDeclaredIndexes(models.customers)
}

import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { orderModels } from './order.model.js'
import { fulfillmentStatus, fulfillmentHold } from './order.schema.js'
type Shape = Record<string, unknown>
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const oid = { bsonType: 'objectId' },
  date = { bsonType: 'date' }
const text = (maxLength: number): Shape => ({ bsonType: 'string', minLength: 1, maxLength })
const object = (properties: Shape, required: string[]): Shape => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
})
const base = { _id: oid, createdAt: date, updatedAt: date }
const timing = object(
  {
    startEvent: { enum: ['placedAt', 'confirmedAt'] },
    calendarDays: { ...integer, minimum: 1, maximum: 3660 },
  },
  ['startEvent', 'calendarDays'],
)
const deadlineBasis = object(
  {
    rule: object(
      {
        version: text(100),
        timezone: { enum: ['Asia/Dhaka'] },
        effectiveFrom: text(100),
        effectiveTo: text(100),
        target: timing,
        estimate: timing,
        legalCaps: {
          bsonType: 'array',
          maxItems: 10,
          items: object(
            {
              ruleRef: text(2000),
              startEvent: { enum: ['placedAt', 'confirmedAt'] },
              calendarDays: { ...integer, minimum: 1, maximum: 3660 },
            },
            ['ruleRef', 'startEvent', 'calendarDays'],
          ),
        },
      },
      ['version', 'timezone', 'effectiveFrom', 'target', 'legalCaps'],
    ),
    review: object(
      {
        evidenceRef: text(2000),
        approvedAt: text(100),
        approvedBy: text(120),
        ruleDigest: { ...text(64), pattern: '^[a-f0-9]{64}$' },
      },
      ['evidenceRef', 'approvedAt', 'approvedBy', 'ruleDigest'],
    ),
    capturedAt: text(100),
  },
  ['rule', 'review', 'capturedAt'],
)
const itemFields = {
  id: oid,
  productId: oid,
  variantId: oid,
  productName: text(120),
  sku: text(64),
  variantAttributes: { bsonType: 'object', additionalProperties: { ...text(120) } },
  quantity: { ...integer, minimum: 1, maximum: 50 },
  regularUnitPoisha: integer,
  effectiveUnitPoisha: integer,
  regularLinePoisha: integer,
  productDiscountPoisha: integer,
  couponAllocatedPoisha: integer,
  netMerchandisePoisha: integer,
  couponEligible: { bsonType: 'bool' },
  unitRefundBasePoisha: integer,
  unitRefundRemainderQty: { ...integer, maximum: 49 },
}
const pricing = {
  regularSubtotalPoisha: integer,
  productDiscountPoisha: integer,
  saleSubtotalPoisha: integer,
  couponDiscountPoisha: integer,
  deliveryChargePoisha: integer,
  finalTotalPoisha: integer,
  currency: { enum: ['BDT'] },
}
const orderValidator = {
  $jsonSchema: object(
    {
      ...base,
      orderNumber: text(64),
      userId: { bsonType: ['objectId', 'null'] },
      checkoutIntentId: oid,
      items: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 40,
        items: object(itemFields, Object.keys(itemFields)),
      },
      customerSnapshot: object({ name: text(120), emailNormalized: text(254), phone: text(64) }, [
        'name',
        'emailNormalized',
        'phone',
      ]),
      deliverySnapshot: object(
        {
          recipient: text(120),
          phone: text(64),
          districtKey: text(64),
          areaKey: text(64),
          street: text(300),
          addressLine2: text(300),
          zoneId: oid,
          chargeRuleId: oid,
          chargePoisha: integer,
          estimateAtCheckout: date,
          deadlineRuleVersion: text(100),
          deadlineBasis,
        },
        [
          'recipient',
          'phone',
          'districtKey',
          'areaKey',
          'street',
          'zoneId',
          'chargeRuleId',
          'chargePoisha',
          'deadlineRuleVersion',
          'deadlineBasis',
        ],
      ),
      deliveryCommitment: object(
        {
          status: { enum: ['awaiting_start', 'calculated', 'under_review'] },
          startEventAt: date,
          targetDeadlineAt: date,
          legalDeadlineAt: date,
          effectiveDeadlineAt: date,
          calculatedAt: date,
          revision: integer,
        },
        ['status', 'revision'],
      ),
      pricingSnapshot: object(pricing, Object.keys(pricing)),
      couponSnapshot: object(
        {
          couponId: oid,
          code: text(64),
          type: { enum: ['fixed', 'percentage'] },
          value: { ...integer, minimum: 1 },
          eligibleSubtotalPoisha: integer,
          discountPoisha: integer,
          termsVersion: integer,
        },
        [
          'couponId',
          'code',
          'type',
          'value',
          'eligibleSubtotalPoisha',
          'discountPoisha',
          'termsVersion',
        ],
      ),
      paymentMethod: { enum: ['online', 'cod'] },
      fulfillmentStatus: { enum: fulfillmentStatus.options },
      fulfillmentHold: { enum: fulfillmentHold.options },
      guestAccessChallengeRevision: integer,
      termsSnapshot: object(
        {
          acceptedAt: date,
          policyVersionIds: {
            bsonType: 'array',
            minItems: 1,
            maxItems: 7,
            uniqueItems: true,
            items: text(100),
          },
          termsVersion: text(100),
          quoteId: oid,
          commercialDigest: { ...text(64), pattern: '^[a-f0-9]{64}$' },
        },
        ['acceptedAt', 'policyVersionIds', 'termsVersion', 'quoteId', 'commercialDigest'],
      ),
      notes: { bsonType: 'string', maxLength: 2000 },
      placedAt: date,
      confirmedAt: date,
      shippedAt: date,
      deliveredAt: date,
      cancelledAt: date,
      shipment: object(
        {
          dispatchReference: text(2000),
          carrierLabel: text(120),
          trackingText: text(2000),
          statusUpdatedBy: oid,
        },
        [],
      ),
      statusHistory: {
        bsonType: 'array',
        maxItems: 40,
        items: object(
          {
            from: { enum: fulfillmentStatus.options },
            to: { enum: fulfillmentStatus.options },
            actorType: { enum: ['customer', 'admin', 'guest_order', 'system'] },
            actorId: oid,
            reason: text(2000),
            at: date,
            operationKey: text(128),
          },
          ['from', 'to', 'actorType', 'at', 'operationKey'],
        ),
      },
      schemaVersion: { ...integer, minimum: 1 },
      revision: integer,
    },
    [
      '_id',
      'createdAt',
      'updatedAt',
      'orderNumber',
      'userId',
      'checkoutIntentId',
      'items',
      'customerSnapshot',
      'deliverySnapshot',
      'deliveryCommitment',
      'pricingSnapshot',
      'paymentMethod',
      'fulfillmentStatus',
      'guestAccessChallengeRevision',
      'termsSnapshot',
      'placedAt',
      'statusHistory',
      'schemaVersion',
      'revision',
    ],
  ),
}
const unit = {
  ordinal: { ...integer, minimum: 1, maximum: 50 },
  netEntitlementPoisha: integer,
  claimState: { enum: ['available', 'protected', 'resolved'] },
  claimId: oid,
  refundHeldPoisha: integer,
  refundCompletedPoisha: integer,
  restockOperationKey: text(128),
}
const balanceValidator = {
  $and: [
    {
      $jsonSchema: object(
        {
          ...base,
          orderId: oid,
          orderItemId: oid,
          purchasedQty: { ...integer, minimum: 1, maximum: 50 },
          unitCoverage: {
            bsonType: 'array',
            minItems: 1,
            maxItems: 50,
            items: object(unit, [
              'ordinal',
              'netEntitlementPoisha',
              'claimState',
              'refundHeldPoisha',
              'refundCompletedPoisha',
            ]),
          },
          activeClaimQty: integer,
          resolvedClaimQty: integer,
          refundedMerchandiseQty: integer,
          revision: integer,
        },
        [
          '_id',
          'createdAt',
          'updatedAt',
          'orderId',
          'orderItemId',
          'purchasedQty',
          'unitCoverage',
          'activeClaimQty',
          'resolvedClaimQty',
          'refundedMerchandiseQty',
          'revision',
        ],
      ),
    },
    {
      $expr: {
        $cond: [
          { $isArray: '$unitCoverage' },
          {
            $and: [
              { $eq: [{ $size: '$unitCoverage' }, '$purchasedQty'] },
              {
                $eq: [
                  { $size: '$unitCoverage' },
                  { $size: { $setUnion: ['$unitCoverage.ordinal', []] } },
                ],
              },
              { $lte: ['$activeClaimQty', '$purchasedQty'] },
              { $lte: ['$resolvedClaimQty', '$purchasedQty'] },
              { $lte: ['$refundedMerchandiseQty', '$purchasedQty'] },
              {
                $allElementsTrue: [
                  {
                    $map: {
                      input: '$unitCoverage',
                      as: 'u',
                      in: {
                        $and: [
                          { $lte: ['$$u.ordinal', '$purchasedQty'] },
                          {
                            $lte: [
                              { $add: ['$$u.refundHeldPoisha', '$$u.refundCompletedPoisha'] },
                              '$$u.netEntitlementPoisha',
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
          false,
        ],
      },
    },
  ],
}
export const orderValidators = { orders: orderValidator, orderItemBalances: balanceValidator }
async function verify(connection: Connection, name: keyof typeof orderValidators) {
  const row = await connection.db?.listCollections({ name }, { nameOnly: false }).next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, orderValidators[name]) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Order persistence requires reviewed bootstrap/migration.')
}
export async function initializeOrderPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Order database unavailable')
  for (const name of Object.keys(orderValidators) as (keyof typeof orderValidators)[]) {
    if (!(await connection.db.listCollections({ name }).hasNext()))
      await connection.db.createCollection(name, {
        validator: orderValidators[name],
        validationLevel: 'strict',
        validationAction: 'error',
      })
    await verify(connection, name)
  }
  const models = orderModels(connection)
  await createDeclaredIndexes(models.orders)
  await createDeclaredIndexes(models.balances)
}
export async function verifyOrderPersistence(connection: Connection) {
  for (const name of Object.keys(orderValidators) as (keyof typeof orderValidators)[])
    await verify(connection, name)
  const models = orderModels(connection)
  await verifyDeclaredIndexes(models.orders)
  await verifyDeclaredIndexes(models.balances)
}

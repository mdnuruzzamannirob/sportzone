import { ApiError } from '../../shared/errors/app-error.js'
import { Schema, type Types, type Connection } from 'mongoose'
import type { z } from 'zod'
import type { quoteLine, quoteTotals, quoteCouponSnapshot } from '../checkout/checkout.schema.js'
import type { deliveryDeadlineBasis } from './delivery-deadline.schema.js'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'
import { fulfillmentStatus, fulfillmentHold, assertFulfillmentTransition } from './order.schema.js'
const embedded = {
  _id: false,
  id: false,
  strict: 'throw',
  versionKey: false,
  minimize: false,
} as const
const text = (max: number) => ({
  type: String,
  required: true,
  validate: (value: string) => [...value].length <= max,
})
const number = { ...integerField(), required: true }
const oid = { type: Schema.Types.ObjectId, required: true, immutable: true }
const instant = { type: Date, default: undefined }
export type OrderItem = Omit<
  z.output<typeof quoteLine>,
  'id' | 'productId' | 'variantId' | 'variantAttributes'
> & {
  id: Types.ObjectId
  productId: Types.ObjectId
  variantId: Types.ObjectId
  variantAttributes: Map<string, string>
  unitRefundBasePoisha: number
  unitRefundRemainderQty: number
}
export type Order = {
  orderNumber: string
  userId: Types.ObjectId | null
  checkoutIntentId: Types.ObjectId
  items: OrderItem[]
  customerSnapshot: { name: string; emailNormalized: string; phone: string }
  deliverySnapshot: {
    recipient: string
    phone: string
    districtKey: string
    areaKey: string
    street: string
    addressLine2?: string
    zoneId: Types.ObjectId
    chargeRuleId: Types.ObjectId
    chargePoisha: number
    estimateAtCheckout?: Date
    deadlineRuleVersion: string
    deadlineBasis: z.output<typeof deliveryDeadlineBasis>
  }
  deliveryCommitment: {
    status: 'awaiting_start' | 'calculated' | 'under_review'
    startEventAt?: Date
    targetDeadlineAt?: Date
    legalDeadlineAt?: Date
    effectiveDeadlineAt?: Date
    calculatedAt?: Date
    revision: number
  }
  pricingSnapshot: z.output<typeof quoteTotals>
  couponSnapshot?: Omit<z.output<typeof quoteCouponSnapshot>, 'couponId'> & {
    couponId: Types.ObjectId
  }
  paymentMethod: 'online' | 'cod'
  fulfillmentStatus: z.infer<typeof fulfillmentStatus>
  fulfillmentHold?: z.infer<typeof fulfillmentHold>
  guestAccessChallengeRevision: number
  termsSnapshot: {
    acceptedAt: Date
    policyVersionIds: string[]
    termsVersion: string
    quoteId: Types.ObjectId
    commercialDigest: string
  }
  notes?: string
  placedAt: Date
  confirmedAt?: Date
  shippedAt?: Date
  deliveredAt?: Date
  cancelledAt?: Date
  shipment?: {
    dispatchReference?: string
    carrierLabel?: string
    trackingText?: string
    statusUpdatedBy?: Types.ObjectId
  }
  statusHistory: {
    from: z.infer<typeof fulfillmentStatus>
    to: z.infer<typeof fulfillmentStatus>
    actorType: 'customer' | 'admin' | 'guest_order' | 'system'
    actorId?: Types.ObjectId
    reason?: string
    at: Date
    operationKey: string
  }[]
  schemaVersion: number
  revision: number
  createdAt?: Date
  updatedAt?: Date
}
const line = new Schema(
  {
    id: oid,
    productId: oid,
    variantId: oid,
    productName: text(120),
    sku: text(64),
    variantAttributes: { type: Map, of: String, required: true },
    quantity: { ...integerField(1), required: true, max: 50 },
    regularUnitPoisha: number,
    effectiveUnitPoisha: number,
    regularLinePoisha: number,
    productDiscountPoisha: number,
    couponAllocatedPoisha: number,
    netMerchandisePoisha: number,
    couponEligible: { type: Boolean, required: true },
    unitRefundBasePoisha: number,
    unitRefundRemainderQty: number,
  },
  embedded,
)
const timing = new Schema(
  {
    startEvent: { type: String, enum: ['placedAt', 'confirmedAt'], required: true },
    calendarDays: { ...integerField(1), required: true, max: 3660 },
  },
  embedded,
)
const basis = new Schema(
  {
    rule: {
      type: new Schema(
        {
          version: text(100),
          timezone: { type: String, enum: ['Asia/Dhaka'], required: true },
          effectiveFrom: text(100),
          effectiveTo: String,
          target: { type: timing, required: true },
          estimate: { type: timing, default: undefined },
          legalCaps: {
            type: [
              new Schema(
                {
                  ruleRef: text(2000),
                  startEvent: text(100),
                  calendarDays: { ...integerField(1), required: true },
                },
                embedded,
              ),
            ],
            required: true,
            default: undefined,
          },
        },
        embedded,
      ),
      required: true,
    },
    review: {
      type: new Schema(
        {
          evidenceRef: text(2000),
          approvedAt: text(100),
          approvedBy: text(120),
          ruleDigest: text(64),
        },
        embedded,
      ),
      required: true,
    },
    capturedAt: text(100),
  },
  embedded,
)
const orderSchema = new Schema<Order>(
  {
    orderNumber: { ...text(64), immutable: true },
    userId: {
      type: Schema.Types.ObjectId,
      default: undefined,
      immutable: true,
      required(this: { userId?: Types.ObjectId | null }) {
        return this.userId !== null
      },
    },
    checkoutIntentId: oid,
    items: {
      type: [line],
      required: true,
      default: undefined,
      immutable: true,
      validate: (rows: OrderItem[]) =>
        rows.length >= 1 &&
        rows.length <= 40 &&
        new Set(rows.map((row) => String(row.id))).size === rows.length &&
        new Set(rows.map((row) => String(row.variantId))).size === rows.length,
    },
    customerSnapshot: {
      type: new Schema({ name: text(120), emailNormalized: text(254), phone: text(64) }, embedded),
      required: true,
      immutable: true,
    },
    deliverySnapshot: {
      type: new Schema(
        {
          recipient: text(120),
          phone: text(64),
          districtKey: text(64),
          areaKey: text(64),
          street: text(300),
          addressLine2: {
            type: String,
            default: undefined,
            validate: (value: string | undefined) =>
              value === undefined || [...value].length <= 300,
          },
          zoneId: oid,
          chargeRuleId: oid,
          chargePoisha: number,
          estimateAtCheckout: instant,
          deadlineRuleVersion: text(100),
          deadlineBasis: { type: basis, required: true },
        },
        embedded,
      ),
      required: true,
      immutable: true,
    },
    deliveryCommitment: {
      type: new Schema(
        {
          status: {
            type: String,
            enum: ['awaiting_start', 'calculated', 'under_review'],
            required: true,
          },
          startEventAt: instant,
          targetDeadlineAt: instant,
          legalDeadlineAt: instant,
          effectiveDeadlineAt: instant,
          calculatedAt: instant,
          revision: number,
        },
        embedded,
      ),
      required: true,
    },
    pricingSnapshot: {
      type: new Schema(
        {
          regularSubtotalPoisha: number,
          productDiscountPoisha: number,
          saleSubtotalPoisha: number,
          couponDiscountPoisha: number,
          deliveryChargePoisha: number,
          finalTotalPoisha: number,
          currency: { type: String, enum: ['BDT'], required: true },
        },
        embedded,
      ),
      required: true,
      immutable: true,
    },
    couponSnapshot: {
      type: new Schema(
        {
          couponId: oid,
          code: text(64),
          type: { type: String, enum: ['fixed', 'percentage'], required: true },
          value: { ...integerField(1), required: true },
          eligibleSubtotalPoisha: number,
          discountPoisha: number,
          termsVersion: number,
        },
        embedded,
      ),
      default: undefined,
      immutable: true,
    },
    paymentMethod: { type: String, enum: ['online', 'cod'], required: true, immutable: true },
    fulfillmentStatus: {
      type: String,
      enum: fulfillmentStatus.options,
      required: true,
      default: 'pending',
    },
    fulfillmentHold: { type: String, enum: fulfillmentHold.options, default: undefined },
    guestAccessChallengeRevision: { ...integerField(), required: true, default: 0 },
    termsSnapshot: {
      type: new Schema(
        {
          acceptedAt: { type: Date, required: true },
          policyVersionIds: { type: [String], required: true, default: undefined },
          termsVersion: text(100),
          quoteId: oid,
          commercialDigest: text(64),
        },
        embedded,
      ),
      required: true,
      immutable: true,
    },
    notes: { type: String, maxlength: 2000, default: undefined, immutable: true },
    placedAt: { type: Date, required: true, immutable: true },
    confirmedAt: instant,
    shippedAt: instant,
    deliveredAt: instant,
    cancelledAt: instant,
    shipment: {
      type: new Schema(
        {
          dispatchReference: String,
          carrierLabel: String,
          trackingText: String,
          statusUpdatedBy: optionalObjectIdField(),
        },
        embedded,
      ),
      default: undefined,
    },
    statusHistory: {
      type: [
        new Schema(
          {
            from: { type: String, enum: fulfillmentStatus.options, required: true },
            to: { type: String, enum: fulfillmentStatus.options, required: true },
            actorType: {
              type: String,
              enum: ['customer', 'admin', 'guest_order', 'system'],
              required: true,
            },
            actorId: optionalObjectIdField(),
            reason: { type: String, maxlength: 2000, default: undefined },
            at: { type: Date, required: true },
            operationKey: text(128),
          },
          embedded,
        ),
      ],
      default: [],
      validate: (rows: unknown[]) => rows.length <= 40,
    },
    schemaVersion: { ...integerField(1), required: true, immutable: true },
    revision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
const historicalPaths = [
  'orderNumber',
  'userId',
  'checkoutIntentId',
  'items',
  'customerSnapshot',
  'deliverySnapshot',
  'pricingSnapshot',
  'couponSnapshot',
  'paymentMethod',
  'termsSnapshot',
  'notes',
  'placedAt',
  'schemaVersion',
  'createdAt',
]
orderSchema.post('init', (row) => {
  row.$locals.fulfillmentAtLoad = row.fulfillmentStatus
})
orderSchema.post('save', (row) => {
  row.$locals.fulfillmentAtLoad = row.fulfillmentStatus
})
orderSchema.pre('validate', function () {
  if (
    this.isNew &&
    (this.fulfillmentStatus !== 'pending' ||
      this.confirmedAt ||
      this.shippedAt ||
      this.deliveredAt ||
      this.cancelledAt)
  )
    throw new ApiError('STATE_CONFLICT')
  if (!this.isNew && this.isModified('fulfillmentStatus'))
    assertFulfillmentTransition({
      from: this.$locals.fulfillmentAtLoad,
      to: this.fulfillmentStatus,
    })
})
orderSchema.pre('save', function () {
  if (!this.isNew && historicalPaths.some((path) => this.isModified(path)))
    throw new ApiError('STATE_CONFLICT')
})
orderSchema.pre(['replaceOne', 'findOneAndReplace'], () => {
  throw new ApiError('STATE_CONFLICT')
})
orderSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const update = this.getUpdate()
  if (this.getOptions().upsert || !update || Array.isArray(update))
    throw new ApiError('STATE_CONFLICT')
  for (const [operator, fields] of Object.entries(update)) {
    if (
      !['$set', '$unset', '$inc', '$push', '$setOnInsert'].includes(operator) ||
      !fields ||
      typeof fields !== 'object' ||
      Array.isArray(fields)
    )
      throw new ApiError('STATE_CONFLICT')
    for (const path of Object.keys(fields)) {
      if (operator === '$setOnInsert' && path === 'createdAt') continue
      if (historicalPaths.some((root) => path === root || path.startsWith(`${root}.`)))
        throw new ApiError('STATE_CONFLICT')
      if (path === 'fulfillmentStatus') {
        if (operator !== '$set') throw new ApiError('STATE_CONFLICT')
        const from = fulfillmentStatus.safeParse(this.getFilter().fulfillmentStatus)
        const to = fulfillmentStatus.safeParse(Reflect.get(fields, path))
        if (!from.success || !to.success) throw new ApiError('STATE_CONFLICT')
        assertFulfillmentTransition({ from: from.data, to: to.data })
      }
    }
  }
})
orderSchema.index({ orderNumber: 1 }, { unique: true, name: 'order_number_unique' })
orderSchema.index({ checkoutIntentId: 1 }, { unique: true, name: 'order_intent_unique' })
orderSchema.index({ userId: 1, placedAt: -1 }, { name: 'order_customer_history' })
orderSchema.index({ fulfillmentStatus: 1, placedAt: -1 }, { name: 'order_fulfillment_history' })
orderSchema.index(
  { 'customerSnapshot.emailNormalized': 1, orderNumber: 1 },
  { name: 'order_internal_guest_lookup' },
)
export type OrderItemBalance = {
  orderId: Types.ObjectId
  orderItemId: Types.ObjectId
  purchasedQty: number
  unitCoverage: {
    ordinal: number
    netEntitlementPoisha: number
    claimState: 'available' | 'protected' | 'resolved'
    claimId?: Types.ObjectId
    refundHeldPoisha: number
    refundCompletedPoisha: number
    restockOperationKey?: string
  }[]
  activeClaimQty: number
  resolvedClaimQty: number
  refundedMerchandiseQty: number
  revision: number
  createdAt?: Date
  updatedAt?: Date
}
const balanceSchema = new Schema<OrderItemBalance>(
  {
    orderId: oid,
    orderItemId: oid,
    purchasedQty: { ...integerField(1), required: true, max: 50, immutable: true },
    unitCoverage: {
      type: [
        new Schema(
          {
            ordinal: { ...integerField(1), required: true, max: 50 },
            netEntitlementPoisha: number,
            claimState: {
              type: String,
              enum: ['available', 'protected', 'resolved'],
              required: true,
            },
            claimId: optionalObjectIdField(),
            refundHeldPoisha: number,
            refundCompletedPoisha: number,
            restockOperationKey: { type: String, maxlength: 128, default: undefined },
          },
          embedded,
        ),
      ],
      required: true,
      default: undefined,
    },
    activeClaimQty: number,
    resolvedClaimQty: number,
    refundedMerchandiseQty: number,
    revision: number,
  },
  mutableSchemaOptions,
)
const unitIdentity = (row: OrderItemBalance) =>
  JSON.stringify([
    row.orderId,
    row.orderItemId,
    row.purchasedQty,
    row.unitCoverage.map((unit) => [unit.ordinal, unit.netEntitlementPoisha]),
  ])
balanceSchema.post('init', (row) => {
  row.$locals.unitIdentity = unitIdentity(row)
})
balanceSchema.post('save', (row) => {
  row.$locals.unitIdentity = unitIdentity(row)
})
balanceSchema.pre('validate', function () {
  if (!this.isNew && this.$locals.unitIdentity !== unitIdentity(this))
    throw new ApiError('STATE_CONFLICT')
  if (
    !Array.isArray(this.unitCoverage) ||
    this.unitCoverage.length !== this.purchasedQty ||
    this.unitCoverage.some(
      (unit, index) =>
        unit.ordinal !== index + 1 ||
        ![unit.refundHeldPoisha, unit.refundCompletedPoisha, unit.netEntitlementPoisha].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ) ||
        BigInt(unit.refundHeldPoisha) + BigInt(unit.refundCompletedPoisha) >
          BigInt(unit.netEntitlementPoisha),
    )
  )
    this.invalidate('unitCoverage', 'Invalid unit coverage')
})
balanceSchema.pre(['replaceOne', 'findOneAndReplace'], () => {
  throw new ApiError('STATE_CONFLICT')
})
balanceSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const update = this.getUpdate()
  if (!update || Array.isArray(update) || this.getOptions().upsert)
    throw new ApiError('STATE_CONFLICT')
  for (const [operator, fields] of Object.entries(update)) {
    if (
      !['$set', '$inc', '$unset', '$setOnInsert'].includes(operator) ||
      !fields ||
      typeof fields !== 'object' ||
      Array.isArray(fields)
    )
      throw new ApiError('STATE_CONFLICT')
    for (const path of Object.keys(fields)) {
      if (operator === '$setOnInsert' && path === 'createdAt') continue
      if (
        ['orderId', 'orderItemId', 'purchasedQty', 'createdAt'].includes(path) ||
        path === 'unitCoverage' ||
        (path.startsWith('unitCoverage.') &&
          (path.split('.').length < 3 || /\.(?:ordinal|netEntitlementPoisha)(?:\.|$)/.test(path)))
      )
        throw new ApiError('STATE_CONFLICT')
    }
  }
})
balanceSchema.index(
  { orderId: 1, orderItemId: 1 },
  { unique: true, name: 'order_item_balance_unique' },
)
export function orderModels(connection: Connection) {
  return {
    orders: connection.models.Order
      ? connection.model<Order>('Order')
      : connection.model<Order>('Order', orderSchema, 'orders'),
    balances: connection.models.OrderItemBalance
      ? connection.model<OrderItemBalance>('OrderItemBalance')
      : connection.model<OrderItemBalance>('OrderItemBalance', balanceSchema, 'orderItemBalances'),
  }
}

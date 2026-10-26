import { Schema, type Connection, type Types } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'
import type { z } from 'zod'
import type { checkoutCommercialSnapshot } from './checkout.schema.js'
const embedded = { _id: false, strict: 'throw', versionKey: false, minimize: false } as const
const text = { type: String, required: true } as const
const money = { ...integerField(), required: true }
const address = new Schema(
  {
    recipient: text,
    phone: text,
    districtKey: text,
    areaKey: text,
    street: text,
    addressLine2: String,
  },
  embedded,
)
const selection = new Schema(
  { variantId: text, quantity: { ...integerField(1), required: true } },
  embedded,
)
const line = new Schema(
  {
    id: text,
    productId: text,
    variantId: text,
    productName: text,
    sku: text,
    variantAttributes: { type: Map, of: String, required: true },
    quantity: { ...integerField(1), required: true },
    regularUnitPoisha: money,
    effectiveUnitPoisha: money,
    regularLinePoisha: money,
    productDiscountPoisha: money,
    couponAllocatedPoisha: money,
    netMerchandisePoisha: money,
    couponEligible: { type: Boolean, required: true },
  },
  embedded,
)
const deadline = new Schema(
  {
    status: text,
    startEvent: text,
    ruleVersion: text,
    startEventAt: String,
    targetDeadlineAt: String,
    legalCapAt: String,
    effectiveAt: String,
  },
  embedded,
)
const timingRule = new Schema(
  { startEvent: text, calendarDays: { ...integerField(1), required: true } },
  embedded,
)
const basis = new Schema(
  {
    rule: {
      type: new Schema(
        {
          version: text,
          timezone: text,
          effectiveFrom: text,
          effectiveTo: String,
          target: { type: timingRule, required: true },
          estimate: { type: timingRule, default: undefined },
          legalCaps: {
            type: [
              new Schema(
                {
                  ruleRef: text,
                  startEvent: text,
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
        { evidenceRef: text, approvedAt: text, approvedBy: text, ruleDigest: text },
        embedded,
      ),
      required: true,
    },
    capturedAt: text,
  },
  embedded,
)
const method = new Schema(
  {
    channel: text,
    active: { type: Boolean, required: true },
    eligible: { type: Boolean, required: true },
    reasonCode: String,
    minPoisha: Number,
    maxPoisha: Number,
  },
  embedded,
)
const snapshot = new Schema<z.output<typeof checkoutCommercialSnapshot>>(
  {
    draft: {
      type: new Schema(
        {
          items: { type: [selection], required: true, default: undefined },
          recipient: { type: address, required: true },
          customer: {
            type: new Schema({ name: text, email: text, phone: text }, embedded),
            required: true,
          },
          couponCode: String,
          method: text,
        },
        embedded,
      ),
      required: true,
    },
    items: { type: [line], required: true, default: undefined },
    coupon: {
      type: new Schema(
        {
          couponId: text,
          code: text,
          type: text,
          value: { ...integerField(1), required: true },
          termsVersion: money,
          eligibleSubtotalPoisha: money,
          discountPoisha: money,
        },
        embedded,
      ),
      default: undefined,
    },
    pricing: {
      type: new Schema(
        {
          regularSubtotalPoisha: money,
          productDiscountPoisha: money,
          saleSubtotalPoisha: money,
          couponDiscountPoisha: money,
          deliveryChargePoisha: money,
          finalTotalPoisha: money,
          currency: text,
        },
        embedded,
      ),
      required: true,
    },
    delivery: {
      type: new Schema(
        {
          zoneId: text,
          chargeRuleId: text,
          coverageKey: text,
          amountPoisha: money,
          ruleVersion: money,
        },
        embedded,
      ),
      required: true,
    },
    deadlineBasis: { type: basis, required: true },
    deliveryDeadline: { type: deadline, required: true },
    availableMethods: { type: [method], required: true, default: undefined },
    policyVersions: {
      type: [new Schema({ type: text, version: text, effectiveAt: text }, embedded)],
      required: true,
      default: undefined,
    },
  },
  embedded,
)
export type CheckoutQuote = {
  scopeType: 'customer' | 'guest_context'
  scopeKeyHash: string
  requestFingerprint: string
  commercialSnapshot: z.output<typeof checkoutCommercialSnapshot>
  commercialDigest: string
  quotedAt: Date
  expiresAt: Date
  status: 'open' | 'consumed'
  revision: number
  checkoutIntentId?: Types.ObjectId
  orderId?: Types.ObjectId
  consumedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}
const schema = new Schema<CheckoutQuote>(
  {
    scopeType: {
      type: String,
      enum: ['customer', 'guest_context'],
      required: true,
      immutable: true,
    },
    scopeKeyHash: { type: String, match: /^[a-f0-9]{64}$/, required: true, immutable: true },
    requestFingerprint: { type: String, match: /^[a-f0-9]{64}$/, required: true, immutable: true },
    commercialSnapshot: { type: snapshot, required: true, immutable: true },
    commercialDigest: { type: String, match: /^[a-f0-9]{64}$/, required: true, immutable: true },
    quotedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    status: { type: String, enum: ['open', 'consumed'], required: true, default: 'open' },
    checkoutIntentId: optionalObjectIdField(),
    orderId: optionalObjectIdField(),
    consumedAt: { type: Date, default: undefined },
    revision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
schema.index({ scopeType: 1, scopeKeyHash: 1, expiresAt: 1 }, { name: 'quote_scope_expiry' })
schema.index(
  { checkoutIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { checkoutIntentId: { $type: 'objectId' } },
    name: 'quote_intent_unique',
  },
)
schema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: 'objectId' } },
    name: 'quote_order_unique',
  },
)
export function checkoutQuoteModel(connection: Connection) {
  return connection.models.CheckoutQuote
    ? connection.model<CheckoutQuote>('CheckoutQuote')
    : connection.model<CheckoutQuote>('CheckoutQuote', schema, 'checkoutQuotes')
}

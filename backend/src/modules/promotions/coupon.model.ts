import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'

const embedded = { _id: false, strict: 'throw', versionKey: false } as const
const count = { ...integerField(), required: true, default: 0 }
const ids = {
  type: [Schema.Types.ObjectId],
  default: undefined,
  validate: (values: unknown[]) =>
    values.length <= 200 && new Set(values.map(String)).size === values.length,
}
const couponSchema = new Schema(
  {
    codeNormalized: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 64,
      validate: (v: string) => v.trim().toUpperCase() === v,
    },
    type: { type: String, enum: ['fixed', 'percentage'], required: true },
    value: { ...integerField(1), required: true },
    minEligibleSubtotalPoisha: count,
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'inactive'], required: true },
    overallLimit: { ...integerField(1) },
    perCustomerLimit: { ...integerField(1) },
    heldCount: count,
    redeemedCount: count,
    termsVersion: count,
    revision: count,
    eligibleProductIds: ids,
    eligibleCategoryIds: ids,
  },
  mutableSchemaOptions,
)
couponSchema.pre('validate', function () {
  if (
    this.startsAt >= this.expiresAt ||
    (this.type === 'percentage' && this.value > 10000) ||
    (this.overallLimit != null &&
      BigInt(this.heldCount) + BigInt(this.redeemedCount) > BigInt(this.overallLimit))
  )
    this.invalidate('value', 'Invalid coupon terms/capacity')
})
couponSchema.index({ codeNormalized: 1 }, { unique: true, name: 'coupon_code_unique' })
couponSchema.index({ status: 1, startsAt: 1, expiresAt: 1 }, { name: 'coupon_status_window' })
couponSchema.index({ createdAt: -1, _id: -1 }, { name: 'coupon_admin_created' })
couponSchema.index({ status: 1, createdAt: -1, _id: -1 }, { name: 'coupon_admin_status_created' })
const termsSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 64 },
    type: { type: String, required: true, enum: ['fixed', 'percentage'] },
    value: { ...integerField(1), required: true },
    version: { ...integerField(), required: true },
    discountPoisha: { ...integerField(), required: true },
    eligibleLineIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: undefined,
      validate: (v: unknown[]) =>
        v.length > 0 && v.length <= 40 && new Set(v.map(String)).size === v.length,
    },
  },
  embedded,
)
const redemptionSchema = new Schema(
  {
    couponId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    userId: optionalObjectIdField(),
    generation: { ...integerField(1), required: true },
    status: { type: String, enum: ['held', 'redeemed', 'released'], required: true },
    activeKey: { type: String, enum: ['active'] },
    termsSnapshot: { type: termsSchema, required: true },
    heldAt: Date,
    expiresAt: Date,
    redeemedAt: Date,
    releasedAt: Date,
    lastOperationKey: { type: String, maxlength: 128 },
  },
  mutableSchemaOptions,
)
redemptionSchema.index(
  { couponId: 1, orderId: 1, generation: 1 },
  { unique: true, name: 'coupon_order_generation_unique' },
)
redemptionSchema.index(
  { orderId: 1, activeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeKey: { $type: 'string' } },
    name: 'coupon_order_active_unique',
  },
)
redemptionSchema.index({ status: 1, expiresAt: 1 }, { name: 'coupon_redemption_expiry' })
redemptionSchema.index(
  { couponId: 1, createdAt: -1, _id: -1 },
  { name: 'coupon_redemption_history' },
)
const customerSchema = new Schema(
  {
    couponId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    heldCount: count,
    redeemedCount: count,
    revision: count,
  },
  mutableSchemaOptions,
)
customerSchema.index({ couponId: 1, userId: 1 }, { unique: true, name: 'coupon_customer_unique' })
type Coupon = InferSchemaType<typeof couponSchema>
export type CouponRedemption = InferSchemaType<typeof redemptionSchema>
type CustomerCounter = InferSchemaType<typeof customerSchema>
export function couponModels(connection: Connection) {
  return {
    coupons: connection.models.Coupon
      ? connection.model<Coupon>('Coupon')
      : connection.model<Coupon>('Coupon', couponSchema, 'coupons'),
    redemptions: connection.models.CouponRedemption
      ? connection.model<CouponRedemption>('CouponRedemption')
      : connection.model<CouponRedemption>(
          'CouponRedemption',
          redemptionSchema,
          'couponRedemptions',
        ),
    customers: connection.models.CouponCustomerCounter
      ? connection.model<CustomerCounter>('CouponCustomerCounter')
      : connection.model<CustomerCounter>(
          'CouponCustomerCounter',
          customerSchema,
          'couponCustomerCounters',
        ),
  }
}

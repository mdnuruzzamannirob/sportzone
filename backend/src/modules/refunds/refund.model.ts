import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    sourceCollectionId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    basis: {
      type: String,
      enum: [
        'cancellation',
        'physical_return',
        'shortage',
        'delivery_exception',
        'payment_correction',
      ],
      required: true,
      immutable: true,
    },
    basisRefId: { type: Schema.Types.ObjectId, immutable: true },
    refundGroupKey: { type: String, match: /^[a-f0-9]{64}$/, immutable: true },
    classification: {
      type: String,
      enum: ['merchandise', 'payment_correction'],
      required: true,
      immutable: true,
    },
    items: {
      type: [
        new Schema(
          {
            orderItemId: { type: Schema.Types.ObjectId, required: true },
            unitAmounts: {
              type: [
                new Schema(
                  {
                    ordinal: { ...integerField(1), max: 50, required: true },
                    amountPoisha: { ...integerField(1), required: true },
                  },
                  { _id: false, strict: 'throw' },
                ),
              ],
              required: true,
            },
            amountPoisha: { ...integerField(1), required: true },
          },
          { _id: false, strict: 'throw' },
        ),
      ],
      default: [],
      immutable: true,
    },
    merchandiseAmountPoisha: { ...integerField(), required: true, immutable: true },
    deliveryAmountPoisha: { ...integerField(), required: true, immutable: true },
    correctionAmountPoisha: { ...integerField(), required: true, immutable: true },
    amountPoisha: { ...integerField(1), required: true, immutable: true },
    method: {
      type: String,
      enum: ['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank'],
    },
    policyVersion: { type: String, minlength: 1, maxlength: 100 },
    consentEvidenceRef: { type: String, minlength: 1, maxlength: 256 },
    approvedBy: Schema.Types.ObjectId,
    approvedAt: Date,
    completedAt: Date,
    timingSnapshot: {
      type: new Schema(
        {
          policyVersion: { type: String, required: true, maxlength: 100 },
          timezone: { type: String, enum: ['Asia/Dhaka'], required: true },
          targetBusinessDays: { ...integerField(1), max: 7, required: true },
          calendarVersion: String,
          legalRuleRef: String,
          targetAt: Date,
          status: { type: String, enum: ['calculated', 'under_review'], required: true },
        },
        { _id: false, strict: 'throw' },
      ),
      default: undefined,
    },
    status: {
      type: String,
      enum: [
        'requested',
        'under_review',
        'approved',
        'processing',
        'completed',
        'failed',
        'rejected',
      ],
      required: true,
    },
    capacityStatus: {
      type: String,
      enum: ['not_reserved', 'reserved', 'completed', 'released'],
      required: true,
    },
    decisionKey: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
    revision: { ...integerField(), required: true },
  },
  mutableSchemaOptions,
)
schema.index({ orderId: 1, decisionKey: 1 }, { unique: true, name: 'refund_decision_unique' })
schema.index({ sourceCollectionId: 1, status: 1 }, { name: 'refund_source_status' })
schema.index({ status: 1, completedAt: 1, _id: 1 }, { name: 'refund_report_completion' })
schema.index({ capacityStatus: 1, createdAt: 1 }, { name: 'refund_capacity_queue' })
schema.index(
  { orderId: 1, classification: 1, createdAt: -1 },
  { name: 'refund_order_class_history' },
)
schema.index({ refundGroupKey: 1, createdAt: 1 }, { name: 'refund_group_history' })
schema.pre('save', function () {
  if (
    !this.isNew ||
    BigInt(this.amountPoisha) !==
      BigInt(this.merchandiseAmountPoisha) +
        BigInt(this.deliveryAmountPoisha) +
        BigInt(this.correctionAmountPoisha)
  )
    throw new ApiError('STATE_CONFLICT')
})
schema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  () => {
    throw new ApiError('STATE_CONFLICT')
  },
)
type Refund = InferSchemaType<typeof schema>
schema.pre('deleteOne', { document: true, query: true }, () => {
  throw new ApiError('STATE_CONFLICT')
})
export function refundModel(connection: Connection) {
  return connection.models.Refund
    ? connection.model<Refund>('Refund')
    : connection.model<Refund>('Refund', schema, 'refunds')
}

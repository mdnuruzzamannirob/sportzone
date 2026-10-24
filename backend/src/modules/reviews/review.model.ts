import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    qualifyingOrderItemId: { type: Schema.Types.ObjectId, required: true },
    rating: { ...integerField(1), max: 5, required: true },
    comment: {
      type: String,
      required: true,
      validate: (value: string) =>
        value === value.trim() && value.length > 0 && [...value].length <= 2000,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected', 'hidden'],
      default: 'pending',
    },
    isActive: { type: Boolean, required: true, default: true },
    moderatedAt: Date,
    moderationReason: {
      type: String,
      validate: (value: string) =>
        value === value.trim() && value.length > 0 && [...value].length <= 2000,
    },
  },
  mutableSchemaOptions,
)
schema.index(
  { userId: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'review_active_customer_product_unique',
  },
)
schema.index({ productId: 1, status: 1, createdAt: -1 }, { name: 'review_product_status_created' })
schema.pre('validate', function () {
  if (this.status !== 'pending' && (!this.moderatedAt || !this.moderationReason))
    this.invalidate('status', 'Moderation requires a reason and timestamp.')
})
schema.pre('save', function () {
  if (
    !this.isNew &&
    ['userId', 'productId', 'orderId', 'qualifyingOrderItemId'].some((field) =>
      this.isModified(field),
    )
  )
    throw new Error('Review purchase identity is immutable.')
})
export type ReviewRecord = InferSchemaType<typeof schema>
export function reviewModel(connection: Connection) {
  return connection.models.Review
    ? connection.model<ReviewRecord>('Review')
    : connection.model<ReviewRecord>('Review', schema, 'reviews')
}

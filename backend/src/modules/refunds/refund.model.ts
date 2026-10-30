import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { mutableSchemaOptions } from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    paymentId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    sourceCollectionId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    basis: { type: String, enum: ['payment_correction'], required: true, immutable: true },
    classification: { type: String, enum: ['payment_correction'], required: true, immutable: true },
    items: {
      type: [Schema.Types.Mixed],
      default: [],
      validate: (items: unknown[]) => items.length === 0,
    },
    merchandiseAmountPoisha: { type: Number, required: true, enum: [0] },
    deliveryAmountPoisha: { type: Number, required: true, enum: [0] },
    correctionAmountPoisha: { type: Number, required: true, min: 1, immutable: true },
    amountPoisha: { type: Number, required: true, min: 1, immutable: true },
    status: { type: String, enum: ['under_review'], required: true },
    capacityStatus: { type: String, enum: ['not_reserved'], required: true },
    decisionKey: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
    revision: { type: Number, required: true, min: 0 },
  },
  mutableSchemaOptions,
)
schema.index({ orderId: 1, decisionKey: 1 }, { unique: true, name: 'refund_decision_unique' })
schema.index({ sourceCollectionId: 1, status: 1 }, { name: 'refund_source_status' })
schema.index(
  { orderId: 1, classification: 1, createdAt: -1 },
  { name: 'refund_order_class_history' },
)
schema.pre('save', function () {
  if (!this.isNew || this.amountPoisha !== this.correctionAmountPoisha)
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

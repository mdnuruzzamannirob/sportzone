import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    requestedBy: {
      type: new Schema(
        {
          kind: { type: String, enum: ['customer', 'guest_order'], required: true },
          userId: Schema.Types.ObjectId,
          guestSessionId: Schema.Types.ObjectId,
        },
        { _id: false, strict: 'throw' },
      ),
      required: true,
      immutable: true,
    },
    reason: { type: String, required: true, maxlength: 2000, immutable: true },
    status: { type: String, enum: ['requested', 'approved', 'rejected'], required: true },
    operationKey: { type: String, required: true, immutable: true, maxlength: 128 },
    reviewedBy: Schema.Types.ObjectId,
    reviewedAt: Date,
    decisionReason: { type: String, maxlength: 2000 },
    revision: { ...integerField(), required: true },
  },
  mutableSchemaOptions,
)
schema.index(
  { orderId: 1, operationKey: 1 },
  { unique: true, name: 'cancellation_operation_unique' },
)
schema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'requested' },
    name: 'cancellation_pending_unique',
  },
)
schema.index({ orderId: 1, createdAt: -1, _id: -1 }, { name: 'cancellation_order_history' })
schema.pre(
  ['replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  () => {
    throw new ApiError('STATE_CONFLICT')
  },
)
type Cancellation = InferSchemaType<typeof schema>
export function cancellationModel(connection: Connection) {
  return connection.models.CancellationRequest
    ? connection.model<Cancellation>('CancellationRequest')
    : connection.model<Cancellation>('CancellationRequest', schema, 'cancellationRequests')
}

schema.pre('save', function () {
  if (!this.isNew) throw new ApiError('STATE_CONFLICT')
})
schema.pre('deleteOne', { document: true, query: false }, () => {
  throw new ApiError('STATE_CONFLICT')
})
schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const filter = this.getFilter(),
    update = this.getUpdate()
  if (
    filter.status !== 'requested' ||
    !Number.isSafeInteger(filter.revision) ||
    !update ||
    Array.isArray(update)
  )
    throw new ApiError('STATE_CONFLICT')
  for (const [operator, fields] of Object.entries(update)) {
    if (!['$set', '$inc'].includes(operator) || !fields || typeof fields !== 'object')
      throw new ApiError('STATE_CONFLICT')
    for (const path of Object.keys(fields))
      if (
        !(operator === '$inc'
          ? path === 'revision'
          : ['status', 'reviewedBy', 'reviewedAt', 'decisionReason', 'updatedAt'].includes(path))
      )
        throw new ApiError('STATE_CONFLICT')
  }
})

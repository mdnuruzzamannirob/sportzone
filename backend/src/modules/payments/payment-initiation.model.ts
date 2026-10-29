import { Schema, Types, type Connection, type InferSchemaType } from 'mongoose'
import { mutableSchemaOptions, optionalObjectIdField } from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
export const initiationStatuses = [
  'dispatching',
  'accepted',
  'uncertain',
  'rejected',
  'allocation_shortfall',
] as const
const digest = { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true }
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    merchantAccountKey: { ...digest, required: false, default: undefined },
    gatewayKey: {
      type: String,
      immutable: true,
      match: /^[A-Za-z0-9_]{1,30}$/,
      default: undefined,
    },
    scopeKeyHash: digest,
    idempotencyKeyHash: digest,
    requestFingerprint: digest,
    status: { type: String, enum: initiationStatuses, required: true },
    attemptId: { ...optionalObjectIdField(), immutable: true },
    redirectUrl: { type: String, maxlength: 255, default: undefined },
  },
  mutableSchemaOptions,
)
schema.index(
  { orderId: 1, scopeKeyHash: 1, idempotencyKeyHash: 1 },
  { unique: true, name: 'payment_initiation_key_unique' },
)
schema.index(
  { attemptId: 1 },
  {
    unique: true,
    partialFilterExpression: { attemptId: { $type: 'objectId' } },
    name: 'payment_initiation_attempt_unique',
  },
)
schema.pre('save', function () {
  if (!this.isNew) throw new ApiError('STATE_CONFLICT')
})
schema.pre(
  ['replaceOne', 'findOneAndReplace', 'findOneAndDelete', 'updateMany', 'deleteMany'],
  () => {
    throw new ApiError('STATE_CONFLICT')
  },
)
schema.pre('deleteOne', { document: true, query: true }, () => {
  throw new ApiError('STATE_CONFLICT')
})
schema.pre(['updateOne', 'findOneAndUpdate'], function () {
  const filter = this.getFilter(),
    update = this.getUpdate()
  if (
    !(
      filter._id instanceof Types.ObjectId ||
      (typeof filter._id === 'string' && /^[a-f0-9]{24}$/.test(filter._id))
    ) ||
    filter.status !== 'dispatching' ||
    !update ||
    Array.isArray(update) ||
    this.getOptions().upsert
  )
    throw new ApiError('STATE_CONFLICT')
  for (const [operator, fields] of Object.entries(update)) {
    if (!['$set', '$setOnInsert'].includes(operator) || !fields || typeof fields !== 'object')
      throw new ApiError('STATE_CONFLICT')
    for (const path of Object.keys(fields))
      if (
        !(operator === '$setOnInsert' && path === 'createdAt') &&
        !['status', 'redirectUrl', 'updatedAt'].includes(path)
      )
        throw new ApiError('STATE_CONFLICT')
  }
})
type Initiation = InferSchemaType<typeof schema>
export function paymentInitiationModel(connection: Connection) {
  return connection.models.PaymentInitiation
    ? connection.model<Initiation>('PaymentInitiation')
    : connection.model<Initiation>('PaymentInitiation', schema, 'paymentInitiations')
}

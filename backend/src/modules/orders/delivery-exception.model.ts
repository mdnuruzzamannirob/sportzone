import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
const oid = { type: Schema.Types.ObjectId, required: true },
  embedded = { _id: false, strict: 'throw' } as const
const schema = new Schema(
  {
    orderId: { ...oid, immutable: true },
    type: {
      type: String,
      enum: ['delay', 'failed_attempt', 'final_non_delivery'],
      required: true,
      immutable: true,
    },
    reason: { type: String, required: true, maxlength: 2000, immutable: true },
    status: { type: String, enum: ['open', 'resolved'], required: true },
    operationKey: { type: String, required: true, immutable: true },
    requestDigest: { type: String, required: true, immutable: true },
    contactHistory: {
      type: [
        new Schema(
          {
            at: { type: Date, required: true },
            channel: { type: String, required: true },
            outcome: { type: String, required: true, maxlength: 2000 },
          },
          embedded,
        ),
      ],
      required: true,
    },
    disposition: {
      type: [
        new Schema(
          {
            orderItemId: oid,
            quantity: { ...integerField(1), required: true, max: 50 },
            custody: {
              type: String,
              enum: ['recovered', 'lost', 'damaged', 'other'],
              required: true,
            },
            inspectedResellableQty: { ...integerField(), required: true, max: 50 },
          },
          embedded,
        ),
      ],
      required: true,
    },
    resolution: { type: String, maxlength: 2000 },
    resolvedAt: Date,
    dispositionDigest: { type: String, match: /^[a-f0-9]{64}$/ },
    revision: { ...integerField(), required: true },
  },
  mutableSchemaOptions,
)
schema.index({ orderId: 1, status: 1, createdAt: -1 }, { name: 'delivery_exception_order_history' })
schema.index(
  { orderId: 1, operationKey: 1 },
  { unique: true, name: 'delivery_exception_operation_unique' },
)
schema.pre('save', function () {
  if (!this.isNew) throw new ApiError('STATE_CONFLICT')
})
schema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne', 'findOneAndReplace'],
  () => {
    throw new ApiError('STATE_CONFLICT')
  },
)
type DeliveryException = InferSchemaType<typeof schema>
export function deliveryExceptionModel(connection: Connection) {
  return connection.models.DeliveryException
    ? connection.model<DeliveryException>('DeliveryException')
    : connection.model<DeliveryException>('DeliveryException', schema, 'deliveryExceptions')
}

schema.pre('deleteOne', { document: true, query: false }, () => {
  throw new ApiError('STATE_CONFLICT')
})
schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const filter = this.getFilter(),
    update = this.getUpdate()
  if (
    filter.status !== 'open' ||
    !Number.isSafeInteger(filter.revision) ||
    !update ||
    Array.isArray(update)
  )
    throw new ApiError('STATE_CONFLICT')
  for (const [op, fields] of Object.entries(update)) {
    if (!['$set', '$inc'].includes(op) || !fields || typeof fields !== 'object')
      throw new ApiError('STATE_CONFLICT')
    for (const path of Object.keys(fields))
      if (
        !(op === '$inc'
          ? path === 'revision'
          : [
              'status',
              'resolution',
              'resolvedAt',
              'disposition',
              'dispositionDigest',
              'contactHistory',
              'updatedAt',
            ].includes(path))
      )
        throw new ApiError('STATE_CONFLICT')
  }
})

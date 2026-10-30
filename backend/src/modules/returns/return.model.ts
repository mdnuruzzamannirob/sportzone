import { ApiError } from '../../shared/errors/app-error.js'
import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
const oid = { type: Schema.Types.ObjectId, required: true, immutable: true }
const embedded = { _id: false, strict: 'throw', versionKey: false } as const
const schema = new Schema(
  {
    orderId: oid,
    requestedBy: {
      type: new Schema(
        {
          type: { type: String, enum: ['customer', 'guest'], required: true },
          id: oid,
        },
        embedded,
      ),
      required: true,
      immutable: true,
    },
    claimType: {
      type: String,
      enum: ['physical_return', 'shortage'],
      required: true,
      immutable: true,
    },
    items: {
      type: [
        new Schema(
          {
            id: oid,
            orderItemId: oid,
            requestedQty: { ...integerField(1), max: 50, required: true },
            protectedUnitOrdinals: { type: [Number], required: true },
            approvedUnitOrdinals: { type: [Number], required: true },
            reason: { type: String, required: true, maxlength: 2000 },
            evidenceRefs: { type: [Schema.Types.ObjectId], required: true },
          },
          embedded,
        ),
      ],
      required: true,
    },
    status: { type: String, enum: ['requested'], required: true },
    requestedAt: { type: Date, required: true, immutable: true },
    eligibilitySnapshot: {
      type: new Schema(
        {
          policyVersion: { type: String, required: true, maxlength: 100 },
          deliveredAt: Date,
          requestDeadlineAt: Date,
          exceptionBasis: { type: String, maxlength: 2000 },
        },
        embedded,
      ),
      required: true,
      immutable: true,
    },
    revision: { ...integerField(), required: true },
  },
  mutableSchemaOptions,
)
schema.index({ orderId: 1, status: 1, createdAt: -1 }, { name: 'return_order_history' })
schema.index({ claimType: 1, status: 1, createdAt: 1 }, { name: 'return_type_queue' })
schema.pre('save', function () {
  if (!this.isNew) throw new ApiError('STATE_CONFLICT')
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
schema.pre('deleteOne', { document: true, query: false }, () => {
  throw new ApiError('STATE_CONFLICT')
})
type ReturnRequest = InferSchemaType<typeof schema>
export function returnModel(connection: Connection) {
  return connection.models.ReturnRequest
    ? connection.model<ReturnRequest>('ReturnRequest')
    : connection.model<ReturnRequest>('ReturnRequest', schema, 'returnRequests')
}

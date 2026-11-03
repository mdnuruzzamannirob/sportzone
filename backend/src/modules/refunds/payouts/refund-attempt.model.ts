import { type Connection, type InferSchemaType, Schema } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../../shared/database/schema.js'
import { ApiError } from '../../../shared/errors/app-error.js'

type Attempt = InferSchemaType<typeof schema>

const schema = new Schema(
  {
    refundId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    attemptNumber: { ...integerField(1), required: true, immutable: true },
    idempotencyKey: { type: String, required: true, minlength: 1, maxlength: 128, immutable: true },
    provider: { type: String, enum: ['sslcommerz', 'manual'], required: true, immutable: true },
    originalBankTranId: { type: String, minlength: 1, maxlength: 256, immutable: true },
    refundTransId: { type: String, minlength: 1, maxlength: 30, immutable: true },
    refundRefId: { type: String, minlength: 1, maxlength: 50 },
    status: {
      type: String,
      enum: ['created', 'submitted', 'uncertain', 'confirmed', 'failed'],
      required: true,
    },
    amountPoisha: { ...integerField(1), required: true, immutable: true },
    initiatedAt: { type: Date, required: true, immutable: true },
    lastCheckedAt: Date,
    confirmedAt: Date,
    manualEvidence: {
      type: new Schema(
        {
          destinationMasked: { type: String, required: true, maxlength: 200 },
          transferReference: { type: String, required: true, maxlength: 256 },
          evidenceDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
          confirmedBy: { type: Schema.Types.ObjectId, required: true },
          confirmedAt: { type: Date, required: true },
        },
        { _id: false, strict: 'throw' },
      ),
      default: undefined,
    },
    failureCode: { type: String, maxlength: 128 },
    lastOperationKey: { type: String, maxlength: 128 },
    revision: { ...integerField(), required: true },
  },
  mutableSchemaOptions,
)

schema.index(
  { refundId: 1, attemptNumber: 1 },
  { unique: true, name: 'refund_attempt_number_unique' },
)

schema.index(
  { provider: 1, idempotencyKey: 1 },
  { unique: true, name: 'refund_attempt_key_unique' },
)

schema.index(
  { provider: 1, refundTransId: 1 },
  {
    unique: true,
    partialFilterExpression: { refundTransId: { $type: 'string' } },
    name: 'refund_attempt_merchant_unique',
  },
)

schema.index(
  { provider: 1, refundRefId: 1 },
  {
    unique: true,
    partialFilterExpression: { refundRefId: { $type: 'string' } },
    name: 'refund_attempt_provider_unique',
  },
)

schema.index(
  { refundId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['created', 'submitted', 'uncertain'] } },
    name: 'refund_attempt_open_unique',
  },
)

schema.index(
  { provider: 1, 'manualEvidence.transferReference': 1 },
  {
    unique: true,
    partialFilterExpression: { 'manualEvidence.transferReference': { $type: 'string' } },
    name: 'refund_manual_transfer_unique',
  },
)

schema.index({ status: 1, lastCheckedAt: 1 }, { name: 'refund_attempt_reconciliation' })

schema.pre('save', function () {
  if (!this.isNew || this.status !== 'created') throw new ApiError('STATE_CONFLICT')
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

schema.pre('deleteOne', { document: true, query: true }, () => {
  throw new ApiError('STATE_CONFLICT')
})

function refundAttemptModel(connection: Connection) {
  return connection.models.RefundAttempt
    ? connection.model<Attempt>('RefundAttempt')
    : connection.model<Attempt>('RefundAttempt', schema, 'refundAttempts')
}

export { refundAttemptModel }

import { Schema, Types, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
export const attemptStates = [
  'created',
  'initiated',
  'pending',
  'uncertain',
  'verified_failed',
  'verified_cancelled',
  'verified_paid',
] as const
export const amountDispositions = [
  'not_checked',
  'matched',
  'under_collected',
  'over_collected',
  'quarantined',
] as const
export const collectionAmounts = [
  'merchandiseAllocatedPoisha',
  'correctionAllocatedPoisha',
  'unassignedAllocatedPoisha',
  'merchandiseRefundHeldPoisha',
  'merchandiseRefundCompletedPoisha',
  'correctionRefundHeldPoisha',
  'correctionRefundCompletedPoisha',
] as const
const text = (max = 256, immutable = false) => ({
  type: String,
  required: true,
  maxlength: max,
  immutable,
  validate: (value: string) =>
    value === value.trim() &&
    [...value].every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    ),
})
const optionalText = (max = 256) => ({ ...text(max), required: false, default: undefined })
const oid = { type: Schema.Types.ObjectId, required: true, immutable: true }
const money = { ...integerField(), required: true }
const positive = { ...integerField(1), required: true, immutable: true }
const digest = { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true }
const embedded = { _id: false, strict: 'throw', versionKey: false } as const
const verification = new Schema(
  {
    verifiedAt: { type: Date, required: true },
    verifiedStatus: text(64),
    merchantIdMatch: { type: Boolean, required: true },
    amountMatch: { type: Boolean, required: true },
    currencyMatch: { type: Boolean, required: true },
    referenceMatch: { type: Boolean, required: true },
    rawRecordDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  },
  embedded,
)
const attemptSchema = new Schema(
  {
    paymentId: oid,
    orderId: oid,
    provider: { type: String, enum: ['sslcommerz'], required: true, immutable: true },
    tranId: text(30, true),
    expectedAmountPoisha: positive,
    initiatedOutstandingPoisha: positive,
    currency: { type: String, enum: ['BDT'], required: true, immutable: true },
    verifiedReceiptAmountPoisha: { ...integerField(), default: undefined },
    amountDisposition: { type: String, enum: amountDispositions, required: true },
    requestedChannel: {
      type: String,
      enum: ['bkash', 'nagad', 'rocket', 'provider_other'],
      immutable: true,
      default: undefined,
    },
    state: { type: String, enum: attemptStates, required: true },
    providerSessionId: optionalText(),
    providerValidationId: optionalText(),
    bankTranId: optionalText(),
    riskLevel: { ...integerField(), default: undefined },
    riskTitle: optionalText(200),
    initiatedAt: { type: Date, default: undefined },
    expiresAt: { type: Date, default: undefined, immutable: true },
    lastCheckedAt: { type: Date, default: undefined },
    verification: { type: verification, default: undefined },
    retryOfAttemptId: { ...optionalObjectIdField(), immutable: true },
  },
  mutableSchemaOptions,
)
attemptSchema.index(
  { provider: 1, tranId: 1 },
  { unique: true, name: 'payment_attempt_tran_unique' },
)
attemptSchema.index({ state: 1, lastCheckedAt: 1 }, { name: 'payment_attempt_reconcile' })
attemptSchema.index(
  { orderId: 1, createdAt: -1, _id: -1 },
  { name: 'payment_attempt_order_history' },
)
attemptSchema.index({ providerValidationId: 1 }, { name: 'payment_attempt_validation_lookup' })
attemptSchema.index({ bankTranId: 1 }, { name: 'payment_attempt_bank_lookup' })
attemptSchema.index({ retryOfAttemptId: 1 }, { name: 'payment_attempt_retry_lookup' })
const intakeSchema = new Schema(
  {
    provider: { type: String, enum: ['sslcommerz'], required: true, immutable: true },
    merchantAccountKey: text(128, true),
    providerCollectionRef: text(256, true),
    bankTranId: { ...optionalText(), immutable: true },
    validationId: { ...optionalText(), immutable: true },
    reportedTranId: { ...optionalText(), immutable: true },
    amountPoisha: positive,
    currency: { type: String, enum: ['BDT'], required: true, immutable: true },
    collectedAt: { type: Date, required: true, immutable: true },
    verifiedAt: { type: Date, required: true, immutable: true },
    validationDigest: digest,
    matchingStatus: { type: String, enum: ['unmatched', 'linked', 'quarantined'], required: true },
    linkedCollectionId: optionalObjectIdField(),
    resolutionKey: optionalText(128),
    resolvedBy: optionalObjectIdField(),
    resolvedAt: { type: Date, default: undefined },
  },
  mutableSchemaOptions,
)
intakeSchema.index(
  { provider: 1, merchantAccountKey: 1, providerCollectionRef: 1 },
  { unique: true, name: 'receipt_intake_identity_unique' },
)
intakeSchema.index(
  { linkedCollectionId: 1 },
  {
    unique: true,
    partialFilterExpression: { linkedCollectionId: { $type: 'objectId' } },
    name: 'receipt_intake_link_unique',
  },
)
intakeSchema.index({ matchingStatus: 1, verifiedAt: 1 }, { name: 'receipt_intake_resolution' })
const collectionSchema = new Schema(
  {
    paymentId: oid,
    orderId: oid,
    intakeId: { ...optionalObjectIdField(), immutable: true },
    attemptId: { ...optionalObjectIdField(), immutable: true },
    provider: { type: String, enum: ['sslcommerz', 'cod_manual'], required: true, immutable: true },
    merchantAccountKey: text(128, true),
    providerCollectionRef: text(256, true),
    bankTranId: { ...optionalText(), immutable: true },
    validationId: { ...optionalText(), immutable: true },
    amountPoisha: positive,
    currency: { type: String, enum: ['BDT'], required: true, immutable: true },
    collectedAt: { type: Date, required: true, immutable: true },
    verifiedAt: { type: Date, required: true, immutable: true },
    evidenceDigest: digest,
    verifiedBy: {
      type: new Schema(
        {
          type: { type: String, enum: ['provider', 'admin'], required: true },
          actorId: optionalObjectIdField(),
        },
        embedded,
      ),
      required: true,
      immutable: true,
    },
    ...Object.fromEntries(collectionAmounts.map((name) => [name, money])),
    revision: money,
  },
  mutableSchemaOptions,
)
collectionSchema.index(
  { provider: 1, merchantAccountKey: 1, providerCollectionRef: 1 },
  { unique: true, name: 'collection_identity_unique' },
)
collectionSchema.index(
  { intakeId: 1 },
  {
    unique: true,
    partialFilterExpression: { intakeId: { $type: 'objectId' } },
    name: 'collection_intake_unique',
  },
)
collectionSchema.index({ attemptId: 1, collectedAt: 1 }, { name: 'collection_attempt_history' })
collectionSchema.index({ orderId: 1, collectedAt: -1 }, { name: 'collection_order_history' })
// Private record writers retain immutable identity/proof. Existing records are changed only with
// explicit narrow CAS queries by the owning verification/reconciliation service, never replacement.
function protect(
  schema: Schema,
  immutable: string[],
  mutable: string[],
  guard: 'state' | 'matchingStatus' | 'revision',
) {
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
    const update = this.getUpdate(),
      filter = this.getFilter()
    if (
      !(
        filter._id instanceof Types.ObjectId ||
        (typeof filter._id === 'string' && /^[a-f0-9]{24}$/.test(filter._id))
      ) ||
      this.getOptions().upsert ||
      !update ||
      Array.isArray(update)
    )
      throw new ApiError('STATE_CONFLICT')
    if (guard === 'revision') {
      if (
        !Number.isSafeInteger(filter.revision) ||
        Number(filter.revision) < 0 ||
        Number(filter.revision) >= Number.MAX_SAFE_INTEGER ||
        update.$inc?.revision !== 1
      )
        throw new ApiError('STATE_CONFLICT')
    } else if (typeof filter[guard] !== 'string') throw new ApiError('STATE_CONFLICT')
    for (const [operator, fields] of Object.entries(update)) {
      if (
        !['$set', '$unset', '$inc', '$setOnInsert'].includes(operator) ||
        !fields ||
        typeof fields !== 'object'
      )
        throw new ApiError('STATE_CONFLICT')
      for (const path of Object.keys(fields)) {
        if (operator === '$setOnInsert' && path === 'createdAt') continue
        const root = path.split('.')[0] ?? ''
        if (
          immutable.includes(root) ||
          !mutable.includes(root) ||
          (guard === 'revision' && root === 'revision' && operator !== '$inc')
        )
          throw new ApiError('STATE_CONFLICT')
      }
    }
  })
}
protect(
  attemptSchema,
  [
    'paymentId',
    'orderId',
    'provider',
    'tranId',
    'expectedAmountPoisha',
    'initiatedOutstandingPoisha',
    'currency',
    'requestedChannel',
    'retryOfAttemptId',
    'expiresAt',
    'createdAt',
  ],
  [
    'verifiedReceiptAmountPoisha',
    'amountDisposition',
    'state',
    'providerSessionId',
    'providerValidationId',
    'bankTranId',
    'riskLevel',
    'riskTitle',
    'initiatedAt',
    'lastCheckedAt',
    'verification',
    'updatedAt',
  ],
  'state',
)
protect(
  intakeSchema,
  [
    'provider',
    'merchantAccountKey',
    'providerCollectionRef',
    'bankTranId',
    'validationId',
    'reportedTranId',
    'amountPoisha',
    'currency',
    'collectedAt',
    'verifiedAt',
    'validationDigest',
    'createdAt',
  ],
  [
    'matchingStatus',
    'linkedCollectionId',
    'resolutionKey',
    'resolvedBy',
    'resolvedAt',
    'updatedAt',
  ],
  'matchingStatus',
)
protect(
  collectionSchema,
  [
    'paymentId',
    'orderId',
    'intakeId',
    'attemptId',
    'provider',
    'merchantAccountKey',
    'providerCollectionRef',
    'bankTranId',
    'validationId',
    'amountPoisha',
    'currency',
    'collectedAt',
    'verifiedAt',
    'evidenceDigest',
    'verifiedBy',
    'createdAt',
  ],
  [...collectionAmounts, 'revision', 'updatedAt'],
  'revision',
)
type Attempt = InferSchemaType<typeof attemptSchema>
type Intake = InferSchemaType<typeof intakeSchema>
type Collection = InferSchemaType<typeof collectionSchema>
export function paymentRecordModels(connection: Connection) {
  return {
    attempts: connection.models.PaymentAttempt
      ? connection.model<Attempt>('PaymentAttempt')
      : connection.model<Attempt>('PaymentAttempt', attemptSchema, 'paymentAttempts'),
    intake: connection.models.ProviderReceiptIntake
      ? connection.model<Intake>('ProviderReceiptIntake')
      : connection.model<Intake>('ProviderReceiptIntake', intakeSchema, 'providerReceiptIntake'),
    collections: connection.models.PaymentCollection
      ? connection.model<Collection>('PaymentCollection')
      : connection.model<Collection>('PaymentCollection', collectionSchema, 'paymentCollections'),
  }
}

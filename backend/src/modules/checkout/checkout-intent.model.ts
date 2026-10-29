import { Schema, type Connection, type Types } from 'mongoose'
import { mutableSchemaOptions, optionalObjectIdField } from '../../shared/database/schema.js'
export type CheckoutIntent = {
  scopeType: 'customer' | 'guest_context'
  scopeKeyHash: string
  idempotencyKeyHash: string
  requestFingerprint: string
  quoteId: Types.ObjectId
  orderId?: Types.ObjectId
  status: 'preparing' | 'order_created' | 'resolved'
  resultSnapshot?: { orderId: Types.ObjectId }
  replayUntil?: Date
  createdAt?: Date
  updatedAt?: Date
}
const hash = {
  type: String,
  required: true,
  immutable: true,
  match: /^[a-f0-9]{64}$/,
}
const schema = new Schema<CheckoutIntent>(
  {
    scopeType: {
      type: String,
      enum: ['customer', 'guest_context'],
      required: true,
      immutable: true,
    },
    scopeKeyHash: hash,
    idempotencyKeyHash: hash,
    requestFingerprint: hash,
    quoteId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    orderId: optionalObjectIdField(),
    status: {
      type: String,
      enum: ['preparing', 'order_created', 'resolved'],
      required: true,
    },
    resultSnapshot: {
      type: new Schema(
        { orderId: { type: Schema.Types.ObjectId, required: true } },
        { _id: false, strict: 'throw', versionKey: false },
      ),
      default: undefined,
    },
    replayUntil: { type: Date, default: undefined },
  },
  mutableSchemaOptions,
)
schema.index(
  { scopeType: 1, scopeKeyHash: 1, idempotencyKeyHash: 1 },
  { unique: true, name: 'checkout_intent_key_unique' },
)
schema.index({ quoteId: 1 }, { unique: true, name: 'checkout_intent_quote_unique' })
schema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: 'objectId' } },
    name: 'checkout_intent_order_unique',
  },
)
export function checkoutIntentModel(connection: Connection) {
  return connection.models.CheckoutIntent
    ? connection.model<CheckoutIntent>('CheckoutIntent')
    : connection.model<CheckoutIntent>('CheckoutIntent', schema, 'checkoutIntents')
}

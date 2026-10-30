import { Schema, type Connection } from 'mongoose'
import { mutableSchemaOptions } from '../../shared/database/schema.js'

const recipient = new Schema(
  { emailNormalized: { type: String, required: true }, displayName: String },
  { _id: false, strict: 'throw' },
)
const schema = new Schema(
  {
    eventKey: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, default: undefined },
    orderId: { type: Schema.Types.ObjectId, default: undefined },
    recipient: { type: recipient, required: true, select: false },
    eventType: {
      type: String,
      enum: [
        'order_confirmation',
        'order_cancellation',
        'shipment_update',
        'delivery_completion',
        'payment_success',
        'payment_failure',
        'payment_pending',
        'registration',
        'password_reset',
        'email_change',
        'order_received',
        'guest_order_access',
      ],
      required: true,
    },
    templateVersion: { type: String, required: true },
    payload: {
      type: new Schema(
        {
          operationKey: String,
          occurredAt: Date,
          challengeId: Schema.Types.ObjectId,
          paymentId: Schema.Types.ObjectId,
          attemptId: Schema.Types.ObjectId,
          intakeId: Schema.Types.ObjectId,
          orderNumber: String,
          amountPoisha: Number,
        },
        { _id: false, strict: 'throw' },
      ),
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'sending', 'delivery_uncertain', 'sent', 'retry_wait', 'failed'],
      required: true,
    },
    attemptCount: {
      type: Number,
      min: 0,
      required: true,
      validate: Number.isSafeInteger,
    },
    nextAttemptAt: Date,
    providerMessageId: String,
    lastErrorCode: String,
    sentAt: Date,
    claimId: String,
    claimExpiresAt: Date,
    lastAttemptAt: Date,
  },
  { ...mutableSchemaOptions, minimize: false },
)
schema.index({ eventKey: 1 }, { name: 'notifications_event_key_unique', unique: true })
schema.index({ status: 1, nextAttemptAt: 1 }, { name: 'notifications_retry_queue' })
schema.index({ status: 1, claimExpiresAt: 1 }, { name: 'notifications_claim_expiry' })
export function createNotificationModel(connection: Connection) {
  return connection.model('RegistrationNotification', schema, 'notifications')
}
export type NotificationModel = ReturnType<typeof createNotificationModel>

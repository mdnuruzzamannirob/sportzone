import { Schema, type Connection, type Types } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
export const paymentStates = [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const
export const paymentAmounts = [
  'verifiedCollectedPoisha',
  'merchandiseFundedPoisha',
  'correctionCollectedPoisha',
  'unassignedCollectedPoisha',
  'merchandiseRefundHeldPoisha',
  'merchandiseRefundCompletedPoisha',
  'correctionRefundHeldPoisha',
  'correctionRefundCompletedPoisha',
  'deliveryRefundHeldPoisha',
  'deliveryRefundCompletedPoisha',
] as const
export type Payment = {
  orderId: Types.ObjectId
  method: 'cod' | 'online'
  expectedPoisha: number
  currency: 'BDT'
  paymentStatus: (typeof paymentStates)[number]
  riskStatus: 'clear' | 'review' | 'rejected'
  revision: number
  lastReconciledAt?: Date
  createdAt?: Date
  updatedAt?: Date
} & Record<(typeof paymentAmounts)[number], number>
const amounts = Object.fromEntries(
  paymentAmounts.map((name) => [name, { ...integerField(), required: true }]),
)
const schema = new Schema<Payment>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    method: {
      type: String,
      enum: ['cod', 'online'],
      required: true,
      immutable: true,
    },
    expectedPoisha: { ...integerField(), required: true, immutable: true },
    currency: { type: String, enum: ['BDT'], required: true, immutable: true },
    paymentStatus: { type: String, enum: paymentStates, required: true },
    riskStatus: {
      type: String,
      enum: ['clear', 'review', 'rejected'],
      required: true,
    },
    ...amounts,
    revision: { ...integerField(), required: true },
    lastReconciledAt: Date,
  },
  mutableSchemaOptions,
)
schema.index({ orderId: 1 }, { unique: true, name: 'payment_order_unique' })
schema.index({ paymentStatus: 1, updatedAt: -1 }, { name: 'payment_status_updated' })
export function paymentModel(connection: Connection) {
  return connection.models.Payment
    ? connection.model<Payment>('Payment')
    : connection.model<Payment>('Payment', schema, 'payments')
}

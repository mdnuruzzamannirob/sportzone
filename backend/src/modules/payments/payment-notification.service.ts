import { paymentInitiationModel } from './payment-initiation.model.js'
import { inTransaction } from '../../shared/database/transaction.js'
import type { verifiedFundingOrderAccess } from '../orders/order.service.js'
import type { Connection } from 'mongoose'
import { z } from 'zod'
import { paymentModel } from './payment.model.js'
import { paymentRecordModels } from './payment-record.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const input = z.strictObject({
  recipient: z.email().max(254),
  orderNumber: z.string().min(1).max(64),
  event: z.enum(['success', 'failure', 'pending']),
  orderId: id,
  paymentId: id,
  attemptId: id,
  intakeId: id.optional(),
  amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
})
// Narrow evidence reader for notification dispatch; no credentials, bank references or models escape.
export function paymentNotificationAccess(
  connection: Connection,
  target: ReturnType<typeof verifiedFundingOrderAccess>['notificationTarget'],
) {
  const payments = paymentModel(connection),
    { attempts, collections, intake } = paymentRecordModels(connection)
  return async (raw: unknown) => {
    const parsed = input.safeParse(raw)
    if (!parsed.success) return false
    await verifyPaymentRecordPersistence(connection)
    const data = parsed.data,
      payment = await payments.findOne({ _id: data.paymentId, orderId: data.orderId }).lean()
    const attempt = await attempts
      .findOne({ _id: data.attemptId, paymentId: data.paymentId, orderId: data.orderId })
      .lean()
    if (!payment || !attempt) return false
    const contact = await inTransaction(connection, (session) => target(session, data.orderId))
    if (contact.email !== data.recipient || contact.orderNumber !== data.orderNumber) return false
    if (data.event !== 'success' && data.amountPoisha !== attempt.expectedAmountPoisha) return false
    if (data.event === 'success')
      return Boolean(
        data.intakeId &&
          (await collections.exists({
            intakeId: data.intakeId,
            orderId: data.orderId,
            paymentId: data.paymentId,
            attemptId: data.attemptId,
            amountPoisha: data.amountPoisha,
            provider: 'sslcommerz',
          })),
      )
    if (payment.verifiedCollectedPoisha > 0) return false
    const operation = await paymentInitiationModel(connection)
      .findOne({ attemptId: attempt._id, orderId: attempt.orderId })
      .lean()
    if (
      !operation?.merchantAccountKey ||
      (await intake.exists({
        merchantAccountKey: operation.merchantAccountKey,
        reportedTranId: attempt.tranId,
      }))
    )
      return false
    return data.event === 'failure'
      ? ['verified_failed', 'verified_cancelled'].includes(attempt.state)
      : ['created', 'initiated', 'pending', 'uncertain'].includes(attempt.state)
  }
}

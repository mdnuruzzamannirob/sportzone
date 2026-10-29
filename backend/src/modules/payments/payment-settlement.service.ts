import type { Connection, ClientSession } from 'mongoose'
import { inTransaction, assertOutsideTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { createAuditWriter } from '../audit/audit.service.js'
import type { verifiedFundingOrderAccess } from '../orders/order.service.js'
import type { verifiedAllocationService } from '../checkout/verified-allocation.service.js'
import { paymentModel } from './payment.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
// Retryable internal recovery, never a new charge. Allocation failure aborts only this transaction;
// independently committed funds remain visible with the durable fulfillment hold for resolution.
export function paymentSettlementService(
  connection: Connection,
  orders: ReturnType<typeof verifiedFundingOrderAccess>,
  allocation: ReturnType<typeof verifiedAllocationService>,
  clock: () => Date = () => new Date(),
) {
  const payments = paymentModel(connection),
    audit = createAuditWriter(connection, true)
  return {
    async recover(paymentId: string, fence?: (session: ClientSession) => Promise<void>) {
      assertOutsideTransaction()
      await verifyPaymentRecordPersistence(connection)
      return inTransaction(connection, async (session) => {
        await fence?.(session)
        try {
          const payment = await payments
            .findOne({
              _id: paymentId,
              method: 'online',
              paymentStatus: 'paid',
              riskStatus: 'clear',
            })
            .session(session)
          if (
            !payment ||
            payment.merchandiseFundedPoisha !== payment.expectedPoisha ||
            payment.revision >= Number.MAX_SAFE_INTEGER
          )
            return false
          const fenced = await payments.updateOne(
            { _id: payment._id, revision: payment.revision },
            { $inc: { revision: 1 } },
            { session },
          )
          if (fenced.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          const orderId = payment.orderId.toHexString(),
            order = await orders.inspect(session, orderId)
          if (!order?.recoverable || order.cancelled) return false
          const ready = await allocation.ensureCommitted(session, order.binding)
          await orders.finish(session, orderId, ready, false)
          if (ready)
            await audit(session, {
              actorType: 'system',
              action: 'payment.allocation.recover',
              targetType: 'payment',
              targetId: paymentId,
              operationKey: `paid-allocation:${paymentId}`,
              occurredAt: clock(),
            })
          return ready
        } finally {
          await fence?.(session)
        }
      })
    },
  }
}

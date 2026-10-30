import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { verifiedFundingOrderAccess } from '../orders/order.service.js'
import type { paymentSettlementService } from './payment-settlement.service.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentModel } from './payment.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { paymentInitiationKey } from './payment-initiation.schema.js'
import { paymentRiskParams, paymentRiskInput, paymentRiskResult } from './payment-risk.schema.js'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function paymentRiskService(
  connection: Connection,
  access: AdminAccountAccess,
  orders: ReturnType<typeof verifiedFundingOrderAccess>,
  settlement: ReturnType<typeof paymentSettlementService>,
  clock: () => Date = () => new Date(),
) {
  const payments = paymentModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async decide(token: string | undefined, paymentId: string, raw: unknown, key: unknown) {
      parseInput(paymentRiskParams, { paymentId })
      const input = parseInput(paymentRiskInput, raw),
        requestKey = parseInput(paymentInitiationKey, key)
      const operationKey = hash(`risk-decision:${paymentId}:${requestKey}`),
        afterDigest = hash(JSON.stringify(input))
      const recover = await access.owned(token, async (actorId, session) => {
        try {
          await verifyPaymentRecordPersistence(connection)
        } catch {
          throw new ApiError('SERVICE_UNAVAILABLE')
        }
        const payment = await payments.findById(paymentId).session(session)
        if (!payment) throw new ApiError('NOT_FOUND')
        const previous = await lookup(session, {
          action: 'payment.risk.decision',
          targetType: 'payment',
          targetId: paymentId,
          operationKey,
        })
        if (previous) {
          if (previous.afterDigest !== afterDigest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return false // A historical key must never approve a newer risk review.
        }
        if (
          payment.riskStatus !== 'review' ||
          payment.verifiedCollectedPoisha <= 0 ||
          payment.revision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('STATE_CONFLICT')
        const order = await orders.inspect(session, payment.orderId.toHexString())
        if (!order) throw new ApiError('STATE_CONFLICT')
        const result = await payments.updateOne(
          { _id: payment._id, revision: payment.revision, riskStatus: 'review' },
          {
            $set: { riskStatus: input.decision === 'approve' ? 'clear' : 'rejected' },
            $inc: { revision: 1 },
          },
          { session },
        )
        if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        await orders.finish(
          session,
          payment.orderId.toHexString(),
          false,
          input.decision === 'reject',
        )
        await audit(session, {
          actorType: 'admin',
          actorId,
          action: 'payment.risk.decision',
          targetType: 'payment',
          targetId: paymentId,
          operationKey,
          afterDigest,
          beforeDigest: hash(
            JSON.stringify({
              riskStatus: payment.riskStatus,
              revision: payment.revision,
              verifiedCollectedPoisha: payment.verifiedCollectedPoisha,
            }),
          ),
          reason: input.reason,
          occurredAt: clock(),
        })
        return input.decision === 'approve' && !order.cancelled
      })
      // Recovery failure preserves the committed decision, verified money and explicit hold. It
      // cannot produce fulfillment without capacity or roll back/automatically refund the payment.
      if (recover) {
        try {
          await settlement.recover(paymentId)
        } catch {
          /* durable allocation_shortfall */
        }
      }
      return access.owned(
        token,
        async (_actorId, session) => {
          const payment = await payments.findById(paymentId).session(session)
          if (!payment) throw new ApiError('NOT_FOUND')
          const hold = await orders.riskState(session, payment.orderId.toHexString())
          return paymentRiskResult.parse({ riskStatus: payment.riskStatus, fulfillmentHold: hold })
        },
        false,
      )
    },
  }
}

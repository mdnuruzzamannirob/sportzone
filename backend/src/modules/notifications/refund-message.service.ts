import { Types } from 'mongoose'
import { z } from 'zod'
import type { createAuditWriter } from '../audit/audit.service.js'
import type { returnNotificationOrderAccess } from '../orders/order.service.js'
import type { RefundNotifier } from '../refunds/refund-recovery.service.js'
import type { RegistrationNotifications } from './notification.service.js'
export function refundDecisionNotifier(
  order: ReturnType<typeof returnNotificationOrderAccess>,
  notifications: Pick<RegistrationNotifications, 'enqueueRefund'>,
  audit: ReturnType<typeof createAuditWriter>,
): RefundNotifier {
  return async (session, input) => {
    const target = await order(session, input.orderId)
    await audit(session, {
      actorType: 'system',
      action: `refund.notification.${input.status}`,
      targetType: 'refund',
      targetId: input.refundId,
      operationKey: input.operationKey,
      occurredAt: input.occurredAt,
    })
    await notifications.enqueueRefund(
      {
        orderId: target.id,
        ...(target.userId ? { userId: target.userId } : {}),
        email: target.email,
        name: target.name,
        refundId: new Types.ObjectId(input.refundId),
        status: input.status,
        operationKey: input.operationKey,
        occurredAt: input.occurredAt,
      },
      session,
    )
  }
}
export function refundMessageService(
  verify: (input: {
    refundId: string
    orderId: string
    status: string
    operationKey: string
    occurredAt: Date
    recipient: string
  }) => Promise<{ orderNumber: string; recipient: string } | undefined>,
) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<RegistrationNotifications['claim']>>>) {
      if (
        claim.eventType !== 'refund_update' ||
        claim.templateVersion !== 'refund-update-v1' ||
        !claim.orderId
      )
        return undefined
      const parsed = z
        .object({
          refundId: z.instanceof(Types.ObjectId),
          refundStatus: z.enum(['approved', 'processing', 'completed', 'failed', 'rejected']),
          operationKey: z.string().regex(/^[a-f0-9]{64}$/),
          occurredAt: z.date(),
        })
        .safeParse(claim.payload)
      if (!parsed.success) return undefined
      const p = parsed.data
      if (claim.eventKey !== `refund_update:${p.refundId}:${p.refundStatus}:${p.operationKey}:v1`)
        return undefined
      const fact = await verify({
        refundId: p.refundId.toHexString(),
        orderId: claim.orderId.toHexString(),
        status: p.refundStatus,
        operationKey: p.operationKey,
        occurredAt: p.occurredAt,
        recipient: claim.recipient,
      })
      if (!fact || fact.recipient !== claim.recipient) return undefined
      const text =
        p.refundStatus === 'completed'
          ? 'Your refund payout has been independently verified as completed.'
          : p.refundStatus === 'failed'
            ? 'This refund attempt was verified not paid. The refund needs operator review.'
            : p.refundStatus === 'rejected'
              ? 'Your refund approval was rejected. No payout was sent.'
              : p.refundStatus === 'approved'
                ? 'Your refund was approved. Approval does not confirm payout.'
                : 'Your refund is processing. Payout is not yet confirmed.'
      return {
        to: fact.recipient,
        subject: `SportZone refund update: ${fact.orderNumber}`,
        text: `Order ${fact.orderNumber}. ${text} Check your secure refund history for current details.`,
      }
    },
  }
}

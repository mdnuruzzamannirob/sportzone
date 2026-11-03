import { z } from 'zod'
import type { orderNotificationAccess } from '../orders/order-notification.service.js'
import type { NotificationService } from './notification.service.js'
import { Types, type ClientSession } from 'mongoose'
import type { createAuditWriter } from '../audit/audit.service.js'
import type { returnNotificationOrderAccess } from '../orders/order.service.js'
import type { RefundNotifier } from '../refunds/payouts/refund-recovery.service.js'

const payload = z.object({ operationKey: z.string().regex(/^[a-f0-9]{64}$/), occurredAt: z.date() })

function createOrderMessageService(read: ReturnType<typeof orderNotificationAccess>) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<NotificationService['claim']>>>) {
      if (!claim.orderId) return undefined
      const parsed =
        claim.eventType === 'order_received' ? undefined : payload.safeParse(claim.payload)
      if (claim.eventType !== 'order_received' && !parsed?.success) return undefined
      const fact = await read({
        orderId: claim.orderId.toHexString(),
        recipient: claim.recipient,
        eventType: claim.eventType,
        eventKey: claim.eventKey,
        ...(parsed?.success ? parsed.data : {}),
      })
      if (!fact) return undefined
      const descriptions = {
        order_received: 'was placed',
        order_confirmation: 'was confirmed',
        order_cancellation: 'was cancelled',
        shipment_update: 'was shipped',
        delivery_completion: 'had delivery recorded',
      }
      const kind = z
        .enum([
          'order_received',
          'order_confirmation',
          'order_cancellation',
          'shipment_update',
          'delivery_completion',
        ])
        .safeParse(claim.eventType)
      if (!kind.success) return undefined
      const label = descriptions[kind.data],
        note =
          kind.data === 'order_received'
            ? ' Placement does not confirm fulfillment.'
            : kind.data === 'delivery_completion'
              ? ' Delivery does not confirm payment collection.'
              : ''
      return {
        to: fact.recipient,
        subject: `SportZone order update: ${fact.orderNumber}`,
        text: `Order ${fact.orderNumber} ${label} at ${fact.occurredAt}.${note} Check your secure order status for current fulfillment, payment and after-sales details.`,
      }
    },
  }
}

const paymentMessagePayload = z.object({
  paymentId: z.instanceof(Types.ObjectId),
  attemptId: z.instanceof(Types.ObjectId),
  intakeId: z.instanceof(Types.ObjectId).optional(),
  orderNumber: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
  amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
})

function createPaymentMessageService(verified: (raw: unknown) => Promise<boolean>) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<NotificationService['claim']>>>) {
      const parsed = paymentMessagePayload.safeParse(claim.payload)
      if (
        !parsed.success ||
        !claim.orderId ||
        !['payment_success', 'payment_failure', 'payment_pending'].includes(claim.eventType)
      )
        return undefined
      const data = parsed.data,
        event =
          claim.eventType === 'payment_success'
            ? 'success'
            : claim.eventType === 'payment_failure'
              ? 'failure'
              : 'pending'
      if (
        claim.eventKey !==
        `payment_${event}:${event === 'success' ? data.intakeId?.toHexString() : data.attemptId.toHexString()}:v1`
      )
        return undefined
      if (
        !(await verified({
          event,
          recipient: claim.recipient,
          orderNumber: data.orderNumber,
          orderId: claim.orderId.toHexString(),
          paymentId: data.paymentId.toHexString(),
          attemptId: data.attemptId.toHexString(),
          ...(data.intakeId ? { intakeId: data.intakeId.toHexString() } : {}),
          amountPoisha: data.amountPoisha,
        }))
      )
        return undefined
      const amount = `${Math.floor(data.amountPoisha / 100)}.${String(data.amountPoisha % 100).padStart(2, '0')}`
      const detail =
        event === 'success'
          ? `A collection of BDT ${amount} was independently verified. This does not confirm fulfillment; risk, allocation or correction review may still apply.`
          : event === 'failure'
            ? 'A payment attempt was independently reported as unsuccessful. Check current secure order status before attempting another payment.'
            : 'The provider reports payment verification is pending. Do not pay again until the backend permits a safe retry.'
      return {
        to: claim.recipient,
        subject: `SportZone payment ${event}: ${data.orderNumber}`,
        text: `Order ${data.orderNumber}. Attempt ${data.attemptId.toHexString()}.${event === 'success' ? ` Receipt ${data.intakeId?.toHexString()}.` : ''} ${detail}`,
      }
    },
  }
}

function refundDecisionNotifier(
  order: ReturnType<typeof returnNotificationOrderAccess>,
  notifications: Pick<NotificationService, 'enqueueRefund'>,
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

function createRefundMessageService(
  verify: (input: {
    refundId: string
    orderId: string
    status: string
    operationKey: string
    occurredAt: Date
    recipient: string
  }) => Promise<
    | {
        orderNumber: string
        recipient: string
      }
    | undefined
  >,
) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<NotificationService['claim']>>>) {
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

const event = z
  .strictObject({
    orderId: z.string().regex(/^[a-f0-9]{24}$/),
    returnId: z.string().regex(/^[a-f0-9]{24}$/),
    from: z.enum(['under_review', 'approved', 'inspected']),
    to: z.enum(['approved', 'rejected', 'completed']),
    operationKey: z.string().regex(/^[a-f0-9]{64}$/),
    occurredAt: z.date(),
  })
  .refine(
    (e) =>
      (e.from === 'under_review' && ['approved', 'rejected'].includes(e.to)) ||
      (['approved', 'inspected'].includes(e.from) && e.to === 'completed'),
  )

const returnMessagePayload = z.object({
  returnId: z.instanceof(Types.ObjectId),
  returnFrom: event.shape.from,
  returnTo: event.shape.to,
  operationKey: event.shape.operationKey,
  occurredAt: z.date(),
})

// Enqueue belongs to the enclosing claim transition transaction; this never sends mail.
function returnDecisionNotifier(
  order: ReturnType<typeof returnNotificationOrderAccess>,
  notifications: Pick<NotificationService, 'enqueueReturnDecision'>,
) {
  return async (session: ClientSession, raw: z.infer<typeof event>) => {
    const fact = event.parse(raw),
      contact = await order(session, fact.orderId)
    await notifications.enqueueReturnDecision(
      {
        orderId: contact.id,
        ...(contact.userId ? { userId: contact.userId } : {}),
        email: contact.email,
        name: contact.name,
        returnId: new Types.ObjectId(fact.returnId),
        from: fact.from,
        to: fact.to,
        operationKey: fact.operationKey,
        occurredAt: fact.occurredAt,
      },
      session,
    )
  }
}

// The proof reader must bind immutable event, canonical claim, order and snapshotted recipient.
function createReturnMessageService(
  verify: (raw: unknown) => Promise<
    | {
        orderNumber: string
        recipient: string
      }
    | undefined
  >,
) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<NotificationService['claim']>>>) {
      if (
        claim.eventType !== 'return_update' ||
        claim.templateVersion !== 'return-update-v1' ||
        !claim.orderId
      )
        return undefined
      const parsed = returnMessagePayload.safeParse(claim.payload)
      if (!parsed.success) return undefined
      const e = event.safeParse({
        orderId: claim.orderId.toHexString(),
        returnId: parsed.data.returnId.toHexString(),
        from: parsed.data.returnFrom,
        to: parsed.data.returnTo,
        operationKey: parsed.data.operationKey,
        occurredAt: parsed.data.occurredAt,
      })
      if (
        !e.success ||
        claim.eventKey !== `return_update:${e.data.returnId}:${e.data.operationKey}:v1`
      )
        return undefined
      const fact = await verify({ ...e.data, recipient: claim.recipient })
      if (!fact || fact.recipient !== claim.recipient) return undefined
      const text =
        e.data.to === 'approved'
          ? 'Your return or shortage claim was approved.'
          : e.data.to === 'rejected'
            ? 'Your return or shortage claim was rejected.'
            : 'Your return or shortage claim was completed. Claim completion does not confirm that a refund was paid.'
      return {
        to: fact.recipient,
        subject: `SportZone claim update: ${fact.orderNumber}`,
        text: `Order ${fact.orderNumber}. ${text} Check your secure claim and refund history for current details.`,
      }
    },
  }
}

export {
  createOrderMessageService,
  createPaymentMessageService,
  refundDecisionNotifier,
  createRefundMessageService,
  returnDecisionNotifier,
  createReturnMessageService,
}

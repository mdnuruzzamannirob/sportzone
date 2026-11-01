import { Types, type ClientSession } from 'mongoose'
import { z } from 'zod'
import type { returnNotificationOrderAccess } from '../orders/order.service.js'
import type { RegistrationNotifications } from './notification.service.js'

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
const payload = z.object({
  returnId: z.instanceof(Types.ObjectId),
  returnFrom: event.shape.from,
  returnTo: event.shape.to,
  operationKey: event.shape.operationKey,
  occurredAt: z.date(),
})

// Enqueue belongs to the enclosing claim transition transaction; this never sends mail.
export function returnDecisionNotifier(
  order: ReturnType<typeof returnNotificationOrderAccess>,
  notifications: Pick<RegistrationNotifications, 'enqueueReturnDecision'>,
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
export function returnMessageService(
  verify: (raw: unknown) => Promise<{ orderNumber: string; recipient: string } | undefined>,
) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<RegistrationNotifications['claim']>>>) {
      if (
        claim.eventType !== 'return_update' ||
        claim.templateVersion !== 'return-update-v1' ||
        !claim.orderId
      )
        return undefined
      const parsed = payload.safeParse(claim.payload)
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

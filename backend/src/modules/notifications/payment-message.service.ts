import { Types } from 'mongoose'
import { z } from 'zod'
import type { RegistrationNotifications } from './notification.service.js'
const payload = z.object({
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
export function paymentMessageService(verified: (raw: unknown) => Promise<boolean>) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<RegistrationNotifications['claim']>>>) {
      const parsed = payload.safeParse(claim.payload)
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

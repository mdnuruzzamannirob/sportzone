import { z } from 'zod'
import type { orderNotificationAccess } from '../orders/order-notification.service.js'
import type { RegistrationNotifications } from './notification.service.js'
const payload = z.object({ operationKey: z.string().regex(/^[a-f0-9]{64}$/), occurredAt: z.date() })
export function orderMessageService(read: ReturnType<typeof orderNotificationAccess>) {
  return {
    async message(claim: NonNullable<Awaited<ReturnType<RegistrationNotifications['claim']>>>) {
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

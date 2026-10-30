import type { Connection } from 'mongoose'
import { z } from 'zod'
import { inTransaction } from '../../shared/database/transaction.js'
import { orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
const input = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  recipient: z.email(),
  eventType: z.enum([
    'order_received',
    'order_confirmation',
    'order_cancellation',
    'shipment_update',
    'delivery_completion',
  ]),
  eventKey: z.string().max(256),
  operationKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  occurredAt: z.date().optional(),
})
export function orderNotificationAccess(connection: Connection) {
  return async (raw: unknown) => {
    const parsed = input.safeParse(raw)
    if (!parsed.success) return undefined
    return inTransaction(connection, async (session) => {
      await verifyOrderPersistence(connection)
      const data = parsed.data,
        row = await orderModels(connection).orders.findById(data.orderId).session(session)
      if (!row || row.customerSnapshot.emailNormalized !== data.recipient) return undefined
      const expected =
        data.eventType === 'order_received'
          ? `order_received:${data.orderId}:v1`
          : `${data.eventType}:${data.orderId}:${data.operationKey}:v1`
      if (expected !== data.eventKey) return undefined
      let occurredAt = row.placedAt
      if (data.eventType !== 'order_received') {
        const to =
          data.eventType === 'order_confirmation'
            ? 'confirmed'
            : data.eventType === 'order_cancellation'
              ? 'cancelled'
              : data.eventType === 'shipment_update'
                ? 'shipped'
                : 'delivered'
        const event = row.statusHistory.find(
          (e) =>
            e.operationKey === data.operationKey &&
            e.to === to &&
            e.at.getTime() === data.occurredAt?.getTime(),
        )
        if (!event) return undefined
        occurredAt = event.at
      } else if (data.operationKey || data.occurredAt) return undefined
      return {
        orderNumber: row.orderNumber,
        occurredAt: occurredAt.toISOString(),
        recipient: data.recipient,
      }
    })
  }
}

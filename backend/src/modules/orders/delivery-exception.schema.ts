import { z } from 'zod'
import { orderId } from './order.schema.js'
import { lifecycleText } from './order-lifecycle.schema.js'
export const exceptionType = z.enum(['delay', 'failed_attempt', 'final_non_delivery'])
export const exceptionContact = z.strictObject({
  channel: z.enum(['phone', 'email', 'sms', 'in_person']),
  outcome: lifecycleText,
})
export const exceptionInput = z.strictObject({
  type: exceptionType,
  reason: lifecycleText,
  contact: exceptionContact.optional(),
})
export const exceptionDisposition = z
  .strictObject({
    orderItemId: orderId,
    quantity: z.int().min(1).max(50),
    custody: z.enum(['recovered', 'lost', 'damaged', 'other']),
    inspectedResellableQty: z.int().min(0).max(50),
  })
  .refine(
    (r) =>
      r.inspectedResellableQty <= r.quantity &&
      (r.custody === 'recovered' || r.inspectedResellableQty === 0),
  )
export const exceptionResolution = z.strictObject({
  resolution: lifecycleText,
  disposition: z
    .array(exceptionDisposition)
    .min(1)
    .max(200)
    .refine(
      (rows) => new Set(rows.map((r) => `${r.orderItemId}:${r.custody}`)).size === rows.length,
    )
    .optional(),
  contactOutcome: lifecycleText.optional(),
})
export const exceptionView = z.strictObject({
  id: orderId,
  orderId,
  type: exceptionType,
  status: z.enum(['open', 'resolved']),
  reason: lifecycleText,
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  resolution: lifecycleText.optional(),
})

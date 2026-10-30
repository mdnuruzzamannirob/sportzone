import { z } from 'zod'
import { lifecycleText } from './order-lifecycle.schema.js'
import { orderId } from './order.schema.js'
export const cancellationInput = z.strictObject({ reason: lifecycleText })
export const cancellationDecision = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  reason: lifecycleText,
  dispatchNotStartedConfirmed: z.boolean().optional(),
})
export const cancellationView = z.strictObject({
  id: orderId,
  orderId,
  status: z.enum(['requested', 'approved', 'rejected']),
  reason: lifecycleText,
  requestedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().optional(),
})

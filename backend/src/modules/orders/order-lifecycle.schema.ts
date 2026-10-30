import { z } from 'zod'
import { fulfillmentStatus, orderId } from './order.schema.js'
export const lifecycleText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
export const lifecycleInput = z.strictObject({
  to: fulfillmentStatus,
  reason: lifecycleText,
  dispatchReference: lifecycleText.optional(),
  carrierLabel: lifecycleText.max(120).optional(),
})
export const lifecycleResult = z.strictObject({
  id: orderId,
  fulfillmentStatus,
  revision: z.int().nonnegative(),
  confirmedAt: z.iso.datetime().optional(),
  shippedAt: z.iso.datetime().optional(),
  deliveredAt: z.iso.datetime().optional(),
})

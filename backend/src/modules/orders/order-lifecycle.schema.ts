import { z } from 'zod'
import { fulfillmentStatus, orderId } from './order.schema.js'

const lifecycleText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))

const lifecycleInput = z.strictObject({
  to: fulfillmentStatus,
  reason: lifecycleText,
  dispatchReference: lifecycleText.optional(),
  carrierLabel: lifecycleText.max(120).optional(),
})

const lifecycleResult = z.strictObject({
  id: orderId,
  fulfillmentStatus,
  revision: z.int().nonnegative(),
  confirmedAt: z.iso.datetime().optional(),
  shippedAt: z.iso.datetime().optional(),
  deliveredAt: z.iso.datetime().optional(),
})

export { lifecycleText, lifecycleInput, lifecycleResult }

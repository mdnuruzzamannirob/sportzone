import { z } from 'zod'
import { singleLineText as lifecycleText, resourceId as orderId } from '../../shared/validation.js'
import { fulfillmentStatus } from './order.schema.js'

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

export { lifecycleInput, lifecycleResult, lifecycleText }

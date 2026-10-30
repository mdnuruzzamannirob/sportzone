import { z } from 'zod'
import { lifecycleText } from '../orders/order-lifecycle.schema.js'
import { bangladeshPhone } from '../customers/customer.schema.js'
import { orderId } from '../orders/order.schema.js'
export const complaintInput = z.strictObject({
  issue: lifecycleText,
  contactName: lifecycleText.refine((value) => [...value].length <= 120).optional(),
  contactEmail: z.email().max(254).optional(),
  contactPhone: bangladeshPhone.optional(),
})
export const complaintResolution = z.strictObject({
  status: z.enum(['in_review', 'resolved', 'closed']),
  resolution: lifecycleText,
  contactOutcome: lifecycleText.optional(),
})
export const complaintView = z.strictObject({
  id: orderId,
  orderId,
  status: z.enum(['open', 'in_review', 'resolved', 'closed']),
  issue: lifecycleText,
  createdAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().optional(),
  resolvedAt: z.iso.datetime().optional(),
  resolution: lifecycleText.optional(),
})

import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
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
  orderId: orderId.optional(),
  status: z.enum(['open', 'in_review', 'resolved', 'closed']),
  issue: lifecycleText,
  createdAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().optional(),
  resolvedAt: z.iso.datetime().optional(),
  resolution: lifecycleText.optional(),
})
export const complaintIntakeInput = complaintInput.safeExtend({ orderId: orderId.optional() })
export const complaintAccepted = z.strictObject({ reference: orderId, status: z.literal('open') })
export const complaintAdminQuery = paginationSchema.safeExtend({
  status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional(),
  orderId: orderId.optional(),
  q: z.string().trim().min(1).max(120).optional(),
})
export const complaintAdminDetail = complaintView.extend({
  contact: z.strictObject({ name: z.string(), email: z.email(), phone: z.string().optional() }),
  contactHistory: z.array(z.strictObject({ at: z.iso.datetime(), outcome: z.string() })).max(40),
  responsePolicy: z.strictObject({ status: z.literal('under_review') }),
})

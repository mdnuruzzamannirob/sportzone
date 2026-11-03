import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import {
  bangladeshPhone,
  singleLineText as lifecycleText,
  resourceId as orderId,
} from '../../shared/validation.js'

const complaintInput = z.strictObject({
  issue: lifecycleText,
  contactName: lifecycleText.refine((value) => [...value].length <= 120).optional(),
  contactEmail: z.email().max(254).optional(),
  contactPhone: bangladeshPhone.optional(),
})

const complaintResolution = z.strictObject({
  status: z.enum(['in_review', 'resolved', 'closed']),
  resolution: lifecycleText,
  contactOutcome: lifecycleText.optional(),
})

const complaintView = z.strictObject({
  id: orderId,
  orderId: orderId.optional(),
  status: z.enum(['open', 'in_review', 'resolved', 'closed']),
  issue: lifecycleText,
  createdAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().optional(),
  resolvedAt: z.iso.datetime().optional(),
  resolution: lifecycleText.optional(),
})

const complaintIntakeInput = complaintInput.safeExtend({ orderId: orderId.optional() })

const complaintAccepted = z.strictObject({ reference: orderId, status: z.literal('open') })

const complaintAdminQuery = paginationSchema.safeExtend({
  status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional(),
  orderId: orderId.optional(),
  q: z.string().trim().min(1).max(120).optional(),
})

const complaintAdminDetail = complaintView.extend({
  contact: z.strictObject({ name: z.string(), email: z.email(), phone: z.string().optional() }),
  contactHistory: z.array(z.strictObject({ at: z.iso.datetime(), outcome: z.string() })).max(40),
  responsePolicy: z.strictObject({ status: z.literal('under_review') }),
})

export {
  complaintAccepted,
  complaintAdminDetail,
  complaintAdminQuery,
  complaintInput,
  complaintIntakeInput,
  complaintResolution,
  complaintView,
}

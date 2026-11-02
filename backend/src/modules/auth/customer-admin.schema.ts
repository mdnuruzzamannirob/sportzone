import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const status = z.enum(['active', 'suspended', 'deletion_pending', 'deactivated'])
const reason = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
export const customerAdminQuery = paginationSchema.safeExtend({
  q: z.string().trim().min(1).max(120).optional(),
  status: status.optional(),
})
export const customerStatusDecision = z.strictObject({
  to: z.enum(['active', 'suspended']),
  reason,
})
export const customerStatusResult = z.strictObject({ status })
export const customerAdminView = z.strictObject({
  id,
  name: z.string(),
  emailMasked: z.string(),
  phoneMasked: z.string().optional(),
  status,
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
})
const privacyStatus = z.enum(['requested', 'under_review', 'approved', 'rejected'])
export const customerPrivacyView = z.strictObject({
  customerId: id,
  request: z
    .strictObject({
      id,
      status: privacyStatus,
      requestedAt: z.iso.datetime(),
      verifiedAt: z.iso.datetime(),
      decisionAt: z.iso.datetime().optional(),
    })
    .nullable(),
  retention: z.literal('required_order_financial_audit_and_legal_hold_records_retained'),
})
export const customerPrivacyDecision = z.strictObject({
  decision: z.enum(['under_review', 'approve_deactivation', 'reject']),
  reason,
})
export const customerPrivacyResult = z.strictObject({
  status: privacyStatus,
  retained: z.literal(true),
})

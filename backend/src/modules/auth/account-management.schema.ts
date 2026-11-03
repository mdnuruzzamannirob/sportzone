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

const customerAdminQuery = paginationSchema.safeExtend({
  q: z.string().trim().min(1).max(120).optional(),
  status: status.optional(),
})

const customerStatusDecision = z.strictObject({
  to: z.enum(['active', 'suspended']),
  reason,
})

const customerStatusResult = z.strictObject({ status })

const customerAdminView = z.strictObject({
  id,
  name: z.string(),
  emailMasked: z.string(),
  phoneMasked: z.string().optional(),
  status,
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
})

const privacyStatus = z.enum(['requested', 'under_review', 'approved', 'rejected'])

const customerPrivacyView = z.strictObject({
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

const customerPrivacyDecision = z.strictObject({
  decision: z.enum(['under_review', 'approve_deactivation', 'reject']),
  reason,
})

const customerPrivacyResult = z.strictObject({
  status: privacyStatus,
  retained: z.literal(true),
})

export {
  customerAdminQuery,
  customerAdminView,
  customerPrivacyDecision,
  customerPrivacyResult,
  customerPrivacyView,
  customerStatusDecision,
  customerStatusResult,
}

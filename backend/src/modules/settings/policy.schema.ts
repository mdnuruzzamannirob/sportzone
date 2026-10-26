import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'

export const policyType = z.enum([
  'shipping',
  'cancellation',
  'returns',
  'refunds',
  'privacy',
  'terms',
  'complaints',
])
export const policyStatus = z.enum([
  'draft',
  'approved',
  'scheduled',
  'published',
  'superseded',
  'withdrawn',
])
// Plain text only; future consumers must render text rather than interpret HTML.
export const policyContent = z
  .string()
  .trim()
  .min(1)
  .max(50000)
  .refine(
    (value) =>
      !/<[^>]*>/.test(value) &&
      [...value].every((char) => char.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(char)),
  )
const date = z.iso.datetime({ offset: true })
export const policyDraftInput = z.strictObject({
  type: policyType,
  content: policyContent,
  proposedEffectiveAt: date.optional(),
})
export const policyDraftPatch = policyDraftInput
  .omit({ type: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0)
export const policyParams = z.strictObject({ policyId: z.string().regex(/^[a-f0-9]{24}$/) })
export const policyListQuery = paginationSchema.safeExtend({
  type: policyType.optional(),
  status: policyStatus.optional(),
})
export const policyDocument = z.strictObject({
  id: policyParams.shape.policyId,
  type: policyType,
  version: z.string().min(1).max(100),
  status: policyStatus,
  content: policyContent,
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  effectiveAt: date.optional(),
  approvalEvidenceRef: z.string().min(1).max(2000).optional(),
  approvedAt: date.optional(),
  publishedAt: date.optional(),
})
export const policySummary = policyDocument.pick({
  id: true,
  type: true,
  version: true,
  status: true,
  effectiveAt: true,
  revision: true,
})
export const policyCreated = z.strictObject({
  policyId: policyParams.shape.policyId,
  version: policyDocument.shape.version,
  status: z.literal('draft'),
  revision: policyDocument.shape.revision,
})
const reason = z.string().trim().min(1).max(2000)
export const policyApprove = z.strictObject({
  approvalEvidenceRef: z.string().trim().min(1).max(2000),
  reason,
})
export const policyPublish = z.strictObject({ effectiveAt: date, reason })
export const policyPublication = z.strictObject({
  version: policyDocument.shape.version,
  effectiveAt: date,
  status: z.enum(['scheduled', 'published']),
})
export const policyPublic = policyDocument
  .pick({ version: true, content: true, effectiveAt: true })
  .required()
export const policyKey = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/)

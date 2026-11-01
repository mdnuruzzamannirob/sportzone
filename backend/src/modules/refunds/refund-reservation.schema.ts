import { z } from 'zod'

export const refundApproval = z.strictObject({
  policyVersion: z.string().trim().min(1).max(100),
  method: z.enum(['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank']),
  consentRequired: z.boolean(),
  deliveryApproved: z.boolean().default(false),
  consentEvidenceRef: z.string().trim().min(1).max(256).optional(),
})

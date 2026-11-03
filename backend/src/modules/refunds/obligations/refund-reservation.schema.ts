import { z } from 'zod'

const refundApproval = z.strictObject({
  policyVersion: z.string().trim().min(1).max(100),
  method: z.enum(['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank']),
  consentRequired: z.boolean(),
  deliveryApproved: z.boolean().default(false),
  consentEvidenceRef: z.string().trim().min(1).max(256).optional(),
})

const id = z.string().regex(/^[a-f0-9]{24}$/),
  money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const text = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))

const refundGroupInput = z.strictObject({
  orderId: id,
  basis: z.enum(['physical_return', 'shortage', 'payment_correction']),
  basisRefId: id.optional(),
  classification: z.enum(['merchandise', 'payment_correction']),
  requestedItems: z
    .array(z.strictObject({ orderItemId: id, quantity: z.int().min(1).max(50) }))
    .min(1)
    .max(50)
    .optional(),
  deliveryChargeRequestedPoisha: money.default(0),
  correctionCollectionId: id.optional(),
  reason: text,
})

export { refundApproval, refundGroupInput }

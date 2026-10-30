import { z } from 'zod'
export const claimId = z.string().regex(/^[a-f0-9]{24}$/)
export const claimText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
export const claimCommand = z.strictObject({
  claimId,
  orderId: claimId,
  claimType: z.enum(['physical_return', 'shortage']),
  items: z
    .array(
      z.strictObject({
        orderItemId: claimId,
        quantity: z.int().min(1).max(50),
        reason: claimText,
      }),
    )
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.orderItemId)).size === items.length),
})
export const claimAuthority = z.strictObject({
  requestedBy: z.strictObject({
    type: z.enum(['customer', 'guest']),
    id: claimId,
  }),
  eligibilitySnapshot: z.strictObject({
    policyVersion: z.string().min(1).max(100),
    deliveredAt: z.date().optional(),
    requestDeadlineAt: z.date().optional(),
    exceptionBasis: claimText.optional(),
  }),
})

import { z } from 'zod'
export const paymentRiskParams = z.strictObject({ paymentId: z.string().regex(/^[a-f0-9]{24}$/) })
export const paymentRiskInput = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((value) => [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
})
export const paymentRiskResult = z.strictObject({
  riskStatus: z.enum(['clear', 'review', 'rejected']),
  fulfillmentHold: z.enum([
    'none',
    'payment_pending',
    'risk_review',
    'allocation_shortfall',
    'admin_review',
  ]),
})

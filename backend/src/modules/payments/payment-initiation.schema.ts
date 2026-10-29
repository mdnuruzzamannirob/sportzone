import { z } from 'zod'
import { attemptId } from './payment-attempt.schema.js'
export const paymentInitiationInput = z.strictObject({
  requestedChannel: z.enum(['bkash', 'nagad', 'rocket']),
})
export const paymentInitiationKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/)
export const paymentInitiationResult = z.strictObject({
  attemptId: attemptId.optional(),
  state: z.enum([
    'created',
    'initiated',
    'pending',
    'uncertain',
    'verified_failed',
    'verified_cancelled',
    'verified_paid',
    'allocation_shortfall',
  ]),
  expectedAmountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  redirectUrl: z.url().optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
})
export const paymentInitiationParams = z.strictObject({ orderId: attemptId })
export const paymentAttemptParams = paymentInitiationParams.extend({ attemptId })
export const paymentAttemptStatus = z.strictObject({
  id: attemptId,
  state: z.enum([
    'created',
    'initiated',
    'pending',
    'uncertain',
    'verified_failed',
    'verified_cancelled',
    'verified_paid',
  ]),
  riskStatus: z.enum(['clear', 'review', 'rejected']).optional(),
  lastCheckedAt: z.iso.datetime({ offset: true }).optional(),
})

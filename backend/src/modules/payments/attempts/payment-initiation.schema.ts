import { z } from 'zod'
import { attemptId } from './payment-attempt.schema.js'

const paymentInitiationInput = z.strictObject({
  requestedChannel: z.enum(['bkash', 'nagad', 'rocket']),
})

const paymentInitiationKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/)

const paymentInitiationResult = z.strictObject({
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

const paymentInitiationParams = z.strictObject({ orderId: attemptId })

const paymentAttemptParams = paymentInitiationParams.extend({ attemptId })

const paymentAttemptStatus = z.strictObject({
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

const publicPaymentAttempt = z.strictObject({
  id: attemptId,
  state: paymentAttemptStatus.shape.state,
  expectedAmountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
  verifiedReceiptAmountPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  amountDisposition: z.enum([
    'not_checked',
    'matched',
    'under_collected',
    'over_collected',
    'quarantined',
  ]),
  riskStatus: z.enum(['clear', 'review', 'rejected']).optional(),
  lastCheckedAt: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
})

export {
  paymentInitiationInput,
  paymentInitiationKey,
  paymentInitiationResult,
  paymentInitiationParams,
  paymentAttemptParams,
  paymentAttemptStatus,
  publicPaymentAttempt,
}

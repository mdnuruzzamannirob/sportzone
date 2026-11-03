import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import type { FulfillmentStatusSchema } from '../orders/order.public.js'
import type { CheckoutSubmitInputSchema } from './checkout.schema.js'
import { quoteId } from './checkout.schema.js'

type CheckoutSubmissionFingerprint = ReturnType<
  typeof createCheckoutIntentSchemas
>['checkoutSubmissionFingerprint']

type CheckoutOrderSummarySchema = ReturnType<
  typeof createCheckoutIntentSchemas
>['checkoutOrderSummary']

type CheckoutOrderOutcomeSchema = ReturnType<
  typeof createCheckoutIntentSchemas
>['checkoutOrderOutcome']

type CheckoutSubmitResultSchema = ReturnType<
  typeof createCheckoutIntentSchemas
>['checkoutSubmitResult']

// Same bounded opaque-key convention as existing replay-sensitive commands. Never persist raw keys.
const checkoutIdempotencyKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/)

const checkoutIntentScope = z.strictObject({
  scopeType: z.enum(['customer', 'guest_context']),
  scopeKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
})

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

function checkoutKeyHash(raw: unknown) {
  return digest(parseInput(checkoutIdempotencyKey, raw))
}

function createCheckoutIntentSchemas({
  checkoutSubmitInput,
  fulfillmentStatus,
}: {
  fulfillmentStatus: FulfillmentStatusSchema
  checkoutSubmitInput: CheckoutSubmitInputSchema
}) {
  const checkoutOrderOutcome = z.strictObject({
    id: quoteId,
    orderNumber: z.string().min(1).max(64),
    fulfillmentStatus,
    paymentMethod: z.enum(['online', 'cod']),
    revision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    placedAt: z.iso.datetime({ offset: true }).optional(),
    finalTotalPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    currency: z.literal('BDT').optional(),
    paymentStatus: z
      .enum(['pending', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded'])
      .optional(),
    fulfillmentHold: z
      .enum(['none', 'payment_pending', 'risk_review', 'allocation_shortfall', 'admin_review'])
      .optional(),
  })

  const checkoutOrderSummary = z.strictObject({
    id: quoteId,
    orderNumber: z.string().min(1).max(64),
    fulfillmentStatus,
    paymentStatus: z.enum([
      'pending',
      'paid',
      'failed',
      'cancelled',
      'partially_refunded',
      'refunded',
    ]),
    finalTotalPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.literal('BDT'),
    placedAt: z.iso.datetime({ offset: true }),
    fulfillmentHold: z
      .enum(['none', 'payment_pending', 'risk_review', 'allocation_shortfall', 'admin_review'])
      .optional(),
  })

  const checkoutSubmitResult = z.strictObject({ order: checkoutOrderSummary })
  function checkoutSubmissionFingerprint(raw: unknown) {
    const input = parseInput(checkoutSubmitInput, raw)
    // Compare the validated submitted command before loading mutable profile/catalog/quote data.
    // New submissions still resolve saved contacts/addresses through authoritative quote revalidation.
    input.items.sort((a, b) => a.variantId.localeCompare(b.variantId))
    input.acceptedPolicyVersionIds.sort()
    return digest(JSON.stringify(input))
  }
  return {
    checkoutSubmissionFingerprint,
    checkoutOrderOutcome,
    checkoutOrderSummary,
    checkoutSubmitResult,
  }
}

export type {
  CheckoutOrderOutcomeSchema,
  CheckoutOrderSummarySchema,
  CheckoutSubmissionFingerprint,
  CheckoutSubmitResultSchema,
}
export { checkoutIdempotencyKey, checkoutIntentScope, checkoutKeyHash, createCheckoutIntentSchemas }

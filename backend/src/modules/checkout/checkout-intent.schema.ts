import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { checkoutSubmitInput, quoteId } from './checkout.schema.js'
import { fulfillmentStatus } from '../orders/order.schema.js'
// Same bounded opaque-key convention as existing replay-sensitive commands. Never persist raw keys.
export const checkoutIdempotencyKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/)
export const checkoutIntentScope = z.strictObject({
  scopeType: z.enum(['customer', 'guest_context']),
  scopeKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
})
export const checkoutOrderOutcome = z.strictObject({
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
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export function checkoutKeyHash(raw: unknown) {
  return digest(parseInput(checkoutIdempotencyKey, raw))
}
export function checkoutSubmissionFingerprint(raw: unknown) {
  const input = parseInput(checkoutSubmitInput, raw)
  // Compare the validated submitted command before loading mutable profile/catalog/quote data.
  // New submissions still resolve saved contacts/addresses through authoritative quote revalidation.
  input.items.sort((a, b) => a.variantId.localeCompare(b.variantId))
  input.acceptedPolicyVersionIds.sort()
  return digest(JSON.stringify(input))
}

export const checkoutOrderSummary = z.strictObject({
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
export const checkoutSubmitResult = z.strictObject({ order: checkoutOrderSummary })

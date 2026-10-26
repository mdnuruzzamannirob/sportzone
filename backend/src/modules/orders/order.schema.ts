import { z } from 'zod'
import { text } from '../catalog/catalog.schema.js'
import { checkoutCommercialSnapshot } from '../checkout/checkout.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
export const orderId = z.string().regex(/^[a-f0-9]{24}$/)
export const fulfillmentStatus = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
])
export const fulfillmentHold = z.enum([
  'none',
  'payment_pending',
  'risk_review',
  'allocation_shortfall',
  'admin_review',
])
export const orderCreateCommand = z.strictObject({
  orderId,
  checkoutIntentId: orderId,
  operationKey: z.string().min(1).max(128),
})
export const orderCreationProof = z.strictObject({
  orderId,
  checkoutIntentId: orderId,
  quoteId: orderId,
  userId: orderId.nullable(),
  acceptedAt: z.iso.datetime({ offset: true }),
  commercialDigest: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: checkoutCommercialSnapshot,
  notes: z.string().trim().max(2000).optional(),
})
export const transitionRequest = z.strictObject({
  from: fulfillmentStatus,
  to: fulfillmentStatus,
  path: z.enum(['ordinary', 'final_non_delivery']).default('ordinary'),
})
// Graph validation only. A valid edge never proves funding, stock, ownership, cancellation
// approval or shipment disposition; owning operational services must enforce those guards.
export function assertFulfillmentTransition(raw: unknown) {
  const input = parseInput(transitionRequest, raw)
  const edges = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  } as const
  const ordinary = edges[input.from].some((target) => target === input.to)
  const exceptional =
    input.path === 'final_non_delivery' && input.from === 'shipped' && input.to === 'cancelled'
  if (
    (input.path === 'ordinary' && !ordinary) ||
    (input.path === 'final_non_delivery' && !exceptional)
  )
    throw new ApiError('STATE_CONFLICT')
  return input
}
export const initialOrderResult = z.strictObject({
  id: orderId,
  orderNumber: text(64),
  fulfillmentStatus: z.literal('pending'),
  paymentMethod: z.enum(['online', 'cod']),
  revision: z.literal(0),
})

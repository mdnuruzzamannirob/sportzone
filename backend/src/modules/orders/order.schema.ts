import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { resourceId as orderId, boundedText as text } from '../../shared/validation.js'
import type { CheckoutCommercialSnapshotSchema } from '../checkout/checkout.public.js'
import type { PricingInputSchema } from '../promotions/promotion.public.js'

type OrderCreationProofSchema = ReturnType<typeof createOrderSchemas>['orderCreationProof']

type OrderAllocationBindingSchema = ReturnType<typeof createOrderAllocationBindingSchema>

type FulfillmentStatusSchema = typeof fulfillmentStatus

const fulfillmentStatus = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
])

const fulfillmentHold = z.enum([
  'none',
  'payment_pending',
  'risk_review',
  'allocation_shortfall',
  'admin_review',
])

const orderCreateCommand = z.strictObject({
  orderId,
  checkoutIntentId: orderId,
  operationKey: z.string().min(1).max(128),
})

const transitionRequest = z.strictObject({
  from: fulfillmentStatus,
  to: fulfillmentStatus,
  path: z.enum(['ordinary', 'final_non_delivery']).default('ordinary'),
})

// Graph validation only. A valid edge never proves funding, stock, ownership, cancellation
// approval or shipment disposition; owning operational services must enforce those guards.
function assertFulfillmentTransition(raw: unknown) {
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

const initialOrderResult = z.strictObject({
  id: orderId,
  orderNumber: text(64),
  fulfillmentStatus: z.literal('pending'),
  paymentMethod: z.enum(['online', 'cod']),
  revision: z.literal(0),
})

function createOrderSchemas({
  checkoutCommercialSnapshot,
}: {
  checkoutCommercialSnapshot: CheckoutCommercialSnapshotSchema
}) {
  const orderCreationProof = z.strictObject({
    orderId,
    checkoutIntentId: orderId,
    quoteId: orderId,
    userId: orderId.nullable(),
    acceptedAt: z.iso.datetime({ offset: true }),
    commercialDigest: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: checkoutCommercialSnapshot,
    notes: z.string().trim().max(2000).optional(),
  })
  return { orderCreationProof }
}

function createOrderAllocationBindingSchema(pricingInput: PricingInputSchema) {
  const id = orderId
  const orderAllocationBinding = z.strictObject({
    orderId: id,
    placedAt: z.date().optional(),
    generation: z.int().min(1),
    userId: id.optional(),
    pricing: pricingInput.safeExtend({ coupon: z.undefined().optional() }),
    coupon: z
      .strictObject({
        couponId: id,
        code: z.string(),
        type: z.enum(['fixed', 'percentage']),
        value: z.int().min(1),
        version: z.int().nonnegative(),
        discountPoisha: z.int().nonnegative(),
        eligibleLineIds: z.array(id).min(1),
      })
      .optional(),
  })
  return orderAllocationBinding
}

export type { FulfillmentStatusSchema, OrderAllocationBindingSchema, OrderCreationProofSchema }
export {
  assertFulfillmentTransition,
  createOrderAllocationBindingSchema,
  createOrderSchemas,
  fulfillmentHold,
  fulfillmentStatus,
  initialOrderResult,
  orderCreateCommand,
  orderId,
  transitionRequest,
}

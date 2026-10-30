import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { checkoutOrderSummary } from '../checkout/checkout-intent.schema.js'
import { quoteLine, quoteTotals, quotePolicyRef } from '../checkout/checkout.schema.js'
import { fulfillmentStatus, fulfillmentHold } from './order.schema.js'
import { deliveryDeadline } from './delivery-deadline.schema.js'
const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  text = z.string().min(1).max(2000),
  date = z.iso.datetime({ offset: true })
export const orderReadQuery = paginationSchema.safeExtend({ status: fulfillmentStatus.optional() })
export const customerPaymentSummary = z.strictObject({
  status: checkoutOrderSummary.shape.paymentStatus,
  fundingContext: z.enum(['normal', 'correction_only']),
  expectedPoisha: money,
  verifiedCollectedPoisha: money,
  merchandiseFundedPoisha: money,
  correctionCollectedPoisha: money,
  unassignedCollectedPoisha: money,
  riskStatus: z.enum(['clear', 'review', 'rejected']),
  merchandiseRefundHeldPoisha: money,
  merchandiseRefundCompletedPoisha: money,
  correctionRefundHeldPoisha: money,
  correctionRefundCompletedPoisha: money,
})
export const orderReadSummary = checkoutOrderSummary.safeExtend({
  deliveryEstimate: date.optional(),
})
export const orderStatusView = z.strictObject({
  fulfillmentStatus,
  fulfillmentHold: fulfillmentHold.optional(),
  paymentSummary: customerPaymentSummary,
  deliveryEstimate: date.optional(),
  deliveryDeadline,
})
export const customerOrderDetail = orderReadSummary.safeExtend({
  items: z.array(quoteLine).min(1).max(50),
  pricingSnapshot: quoteTotals,
  deliverySnapshot: z.strictObject({
    recipient: text,
    phone: text,
    districtKey: text,
    areaKey: text,
    street: text,
    addressLine2: text.optional(),
    postalCode: text.optional(),
    chargePoisha: money,
    deadlineRuleVersion: text,
  }),
  termsSnapshot: z.strictObject({
    acceptedAt: date,
    policyVersionIds: z.array(text).max(7),
    termsVersion: text,
  }),
  policyVersions: z.array(quotePolicyRef).max(7),
  statusHistory: z
    .array(z.strictObject({ from: fulfillmentStatus, to: fulfillmentStatus, at: date }))
    .max(40),
  paymentSummary: customerPaymentSummary,
  deliveryDeadline,
  cancellationEligibility: z.strictObject({
    eligible: z.boolean(),
    reasonCode: z.enum(['PRE_DISPATCH', 'TERMINAL_OR_DISPATCHED']),
  }),
  claimEligibility: z.strictObject({
    status: z.literal('under_review'),
  }),
})

import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { quoteLine, quotePolicyRef, quoteTotals } from '../checkout/checkout.schema.js'
import { checkoutOrderSummary } from '../checkout/checkout-intent.schema.js'
import { publicPaymentAttempt } from '../payments/attempts/payment-initiation.schema.js'
import { deliveryDeadline } from './delivery-deadline.schema.js'
import { fulfillmentHold, fulfillmentStatus } from './order.schema.js'

const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  text = z.string().min(1).max(2000),
  date = z.iso.datetime({ offset: true })

const orderReadQuery = paginationSchema.safeExtend({ status: fulfillmentStatus.optional() })

const customerPaymentSummary = z.strictObject({
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

const orderReadSummary = checkoutOrderSummary.safeExtend({
  deliveryEstimate: date.optional(),
})

const orderStatusView = z.strictObject({
  fulfillmentStatus,
  fulfillmentHold: fulfillmentHold.optional(),
  paymentSummary: customerPaymentSummary,
  deliveryEstimate: date.optional(),
  deliveryDeadline,
})

const customerOrderDetail = orderReadSummary.safeExtend({
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

const adminOrderQuery = paginationSchema.safeExtend({
  orderNumber: z.string().trim().min(1).max(128).optional(),
  customerId: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
  fulfillmentStatus: fulfillmentStatus.optional(),
  paymentStatus: checkoutOrderSummary.shape.paymentStatus.optional(),
})

const adminOrderDetail = customerOrderDetail.safeExtend({
  allocationSummary: z.strictObject({
    generation: z.int().positive().nullable(),
    items: z
      .array(
        z.strictObject({
          variantId: z.string().regex(/^[a-f0-9]{24}$/),
          quantity: z.int().positive(),
          status: z.enum(['held', 'committed', 'released', 'shipped']),
        }),
      )
      .max(50),
  }),
  fulfillmentActions: z.array(fulfillmentStatus).max(4),
  auditRefs: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(40),
})

const customerDeliveryEvents = z.strictObject({
  status: fulfillmentStatus,
  estimate: date.optional(),
  deadline: deliveryDeadline,
  events: customerOrderDetail.shape.statusHistory,
})

const customerPaymentHistory = z.strictObject({
  payment: customerPaymentSummary,
  attempts: z.array(publicPaymentAttempt).max(50),
})

const customerAdminOrderSummary = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  orderNumber: z.string(),
  paymentStatus: checkoutOrderSummary.shape.paymentStatus,
  fulfillmentStatus,
  placedAt: date,
  finalTotalPoisha: money,
  currency: z.literal('BDT'),
})

export {
  adminOrderDetail,
  adminOrderQuery,
  customerAdminOrderSummary,
  customerDeliveryEvents,
  customerOrderDetail,
  customerPaymentHistory,
  customerPaymentSummary,
  orderReadQuery,
  orderReadSummary,
  orderStatusView,
}

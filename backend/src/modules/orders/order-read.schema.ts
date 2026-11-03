import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import type {
  CheckoutOrderSummarySchema,
  QuoteLineSchema,
  QuotePolicyRefSchema,
  QuoteTotalsSchema,
} from '../checkout/checkout.public.js'
import type { PublicPaymentAttemptSchema } from '../payments/payment.public.js'

import { deliveryDeadline } from './delivery-deadline.schema.js'
import { fulfillmentHold, fulfillmentStatus } from './order.schema.js'

type AdminOrderDetailSchema = ReturnType<typeof createOrderReadSchemas>['adminOrderDetail']

type AdminOrderQuerySchema = ReturnType<typeof createOrderReadSchemas>['adminOrderQuery']

type CustomerAdminOrderSummarySchema = ReturnType<
  typeof createOrderReadSchemas
>['customerAdminOrderSummary']

type CustomerDeliveryEventsSchema = ReturnType<
  typeof createOrderReadSchemas
>['customerDeliveryEvents']

type CustomerOrderDetailSchema = ReturnType<typeof createOrderReadSchemas>['customerOrderDetail']

type CustomerPaymentHistorySchema = ReturnType<
  typeof createOrderReadSchemas
>['customerPaymentHistory']

type CustomerPaymentSummarySchema = ReturnType<
  typeof createOrderReadSchemas
>['customerPaymentSummary']

type OrderReadSummarySchema = ReturnType<typeof createOrderReadSchemas>['orderReadSummary']

type OrderStatusViewSchema = ReturnType<typeof createOrderReadSchemas>['orderStatusView']

const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  text = z.string().min(1).max(2000),
  date = z.iso.datetime({ offset: true })

const orderReadQuery = paginationSchema.safeExtend({ status: fulfillmentStatus.optional() })

function createOrderReadSchemas({
  quoteLine,
  quotePolicyRef,
  quoteTotals,
  checkoutOrderSummary,
  publicPaymentAttempt,
}: {
  quoteLine: QuoteLineSchema
  quotePolicyRef: QuotePolicyRefSchema
  quoteTotals: QuoteTotalsSchema
  checkoutOrderSummary: CheckoutOrderSummarySchema
  publicPaymentAttempt: PublicPaymentAttemptSchema
}) {
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
  return {
    adminOrderDetail,
    adminOrderQuery,
    customerAdminOrderSummary,
    customerDeliveryEvents,
    customerOrderDetail,
    customerPaymentHistory,
    customerPaymentSummary,
    orderReadSummary,
    orderStatusView,
  }
}

export type {
  AdminOrderDetailSchema,
  AdminOrderQuerySchema,
  CustomerAdminOrderSummarySchema,
  CustomerDeliveryEventsSchema,
  CustomerOrderDetailSchema,
  CustomerPaymentHistorySchema,
  CustomerPaymentSummarySchema,
  OrderReadSummarySchema,
  OrderStatusViewSchema,
}
export { createOrderReadSchemas, orderReadQuery }

import type { ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { CheckoutPrincipal, OrderPrincipal } from '../auth/auth.public.js'
import type { InventoryAllocationRecord } from '../inventory/inventory.public.js'
import type { CouponAllocationRecord } from '../promotions/promotion.public.js'
import type { exceptionResolution } from './delivery-exception.schema.js'

interface DeliveryDispositionInput {
  orderId: string
  exceptionId: string
  shippedAt: Date
  disposition: NonNullable<z.output<typeof exceptionResolution>['disposition']>
}

type DeliveryDispositionVerifier = (
  session: ClientSession,
  input: DeliveryDispositionInput,
) => Promise<unknown>

interface GuestOrderAccess {
  verifyPersistence(): Promise<void>
  lookup(
    session: ClientSession,
    orderNumber: string,
    email: string,
  ): Promise<{
    id: string
    email: string
    revision: number
  } | null>
  issue(session: ClientSession, orderId: string, expectedRevision: number): Promise<number>
  verify(
    session: ClientSession | undefined,
    orderId: string,
    revision?: number,
    email?: string,
  ): Promise<boolean>
  consume(
    session: ClientSession,
    orderId: string,
    revision: number,
    email: string,
  ): Promise<boolean>
}

type DeliveryDeadlineService = {
  snapshotForCheckout: () => Readonly<{
    rule: {
      version: string
      timezone: 'Asia/Dhaka'
      effectiveFrom: string
      target: { startEvent: 'confirmedAt'; calendarDays: number }
      legalCaps: { ruleRef: string; startEvent: 'confirmedAt' | 'placedAt'; calendarDays: number }[]
      effectiveTo?: string | undefined
      estimate?: { startEvent: 'confirmedAt' | 'placedAt'; calendarDays: number } | undefined
      prepaid?: { ruleRef: string; handoverHours: number; deliveryCalendarDays: number } | undefined
    }
    review: { evidenceRef: string; approvedAt: string; approvedBy: string; ruleDigest: string }
    capturedAt: string
  }>
  project: (
    rawBasis: unknown,
    rawEvents: unknown,
  ) => {
    status: 'awaiting_start' | 'calculated' | 'under_review'
    startEvent: 'confirmedAt'
    ruleVersion: string
    startEventAt?: string | undefined
    targetDeadlineAt?: string | undefined
    legalCapAt?: string | undefined
    effectiveAt?: string | undefined
    handoverDeadlineAt?: string | undefined
    handoverStatus?: 'pending' | 'awaiting_payment' | 'met' | 'overdue' | undefined
  }
  preview(): {
    status: 'awaiting_start' | 'calculated' | 'under_review'
    startEvent: 'confirmedAt'
    ruleVersion: string
    startEventAt?: string | undefined
    targetDeadlineAt?: string | undefined
    legalCapAt?: string | undefined
    effectiveAt?: string | undefined
    handoverDeadlineAt?: string | undefined
    handoverStatus?: 'pending' | 'awaiting_payment' | 'met' | 'overdue' | undefined
  }
  projectTiming(
    rawBasis: unknown,
    rawEvents: unknown,
  ):
    | {
        deliveryDeadline: {
          status: 'awaiting_start' | 'calculated' | 'under_review'
          startEvent: 'confirmedAt'
          ruleVersion: string
          startEventAt?: string | undefined
          targetDeadlineAt?: string | undefined
          legalCapAt?: string | undefined
          effectiveAt?: string | undefined
          handoverDeadlineAt?: string | undefined
          handoverStatus?: 'pending' | 'awaiting_payment' | 'met' | 'overdue' | undefined
        }
        deliveryEstimate?: never
      }
    | {
        deliveryDeadline: {
          status: 'awaiting_start' | 'calculated' | 'under_review'
          startEvent: 'confirmedAt'
          ruleVersion: string
          startEventAt?: string | undefined
          targetDeadlineAt?: string | undefined
          legalCapAt?: string | undefined
          effectiveAt?: string | undefined
          handoverDeadlineAt?: string | undefined
          handoverStatus?: 'pending' | 'awaiting_payment' | 'met' | 'overdue' | undefined
        }
        deliveryEstimate: string
      }
  requireConfirmation(
    basis: unknown,
    events: unknown,
  ): {
    status: 'awaiting_start' | 'calculated' | 'under_review'
    startEvent: 'confirmedAt'
    ruleVersion: string
    startEventAt?: string | undefined
    targetDeadlineAt?: string | undefined
    legalCapAt?: string | undefined
    effectiveAt?: string | undefined
    handoverDeadlineAt?: string | undefined
    handoverStatus?: 'pending' | 'awaiting_payment' | 'met' | 'overdue' | undefined
  }
}

type OrderNotificationAccess = (
  raw: unknown,
) => Promise<{ orderNumber: string; occurredAt: string; recipient: string } | undefined>

type CodCollectionOrderAccess = (
  session: ClientSession,
  orderId: string,
) => Promise<{ cancelled: boolean; placedAt: Date; expectedPoisha: number }>

type VerifiedAllocationService = {
  ensureCommitted(session: ClientSession, raw: unknown): Promise<boolean>
  commitLive(session: ClientSession, raw: unknown): Promise<boolean>
}

type PaymentMethodOrderAccess = (
  session: ClientSession,
  orderId: string,
  scope: { customerId?: string; guestOrderId?: string },
) => Promise<{ method: 'cod' | 'online'; cancelled: boolean }>

type ClaimQuantityAccess = (
  session: ClientSession,
  input: { orderId: string; claimId: string; items: { orderItemId: string; quantity: number }[] },
) => Promise<{ orderItemId: string; ordinals: number[] }[]>

type ClaimRestockAccess = (
  session: ClientSession,
  input: {
    orderId: string
    claimId: string
    orderItemId: string
    ordinals: number[]
    operationKey: string
  },
) => Promise<{ variantId: string }>

type ClaimReviewQuantityAccess = (
  session: ClientSession,
  input: {
    orderId: string
    claimId: string
    items: { orderItemId: string; protected: number[]; approved: number[] }[]
    resolve: boolean
  },
) => Promise<void>

type CustomerOrderHistoryAccess = (session: ClientSession, userId: string) => Promise<string[]>

type RefundOrderSnapshotAccess = (
  session: ClientSession,
  orderId: string,
  claimId: string,
  requested: { orderItemId: string; quantity: number; ordinals: number[] }[],
) => Promise<{
  lines: {
    orderItemId: string
    quantity: number
    units: {
      ordinal: number
      netEntitlementPoisha: number
      refundHeldPoisha: number
      refundCompletedPoisha: number
      eligible: boolean
    }[]
  }[]
  deliveryChargePoisha: number
}>

type RefundRequestOrderAccess = (
  session: ClientSession,
  orderId: string,
) => Promise<{ customerId?: string }>

type RefundUnitReservationAccess = (session: ClientSession, raw: unknown) => Promise<void>

type CancellationRefundSnapshotAccess = (
  session: ClientSession,
  orderId: string,
  requestId: string,
) => Promise<{
  lines: {
    orderItemId: string
    quantity: number
    units: {
      ordinal: number
      netEntitlementPoisha: number
      refundHeldPoisha: number
      refundCompletedPoisha: number
      eligible: boolean
    }[]
  }[]
  deliveryChargePoisha: number
}>

type RefundUnitOutcomeAccess = (
  session: ClientSession,
  raw: unknown,
) => Promise<{ deliveryChargePoisha: number }>

type OrderReportAccess = (
  session: ClientSession,
  period: { from: Date; to: Date; asOf: Date },
) => Promise<{
  orders: {
    id: string
    cancelled: boolean
    placedAt: string
    regularSubtotalPoisha: number
    productDiscountPoisha: number
    couponDiscountPoisha: number
    deliveryChargePoisha: number
    finalTotalPoisha: number
  }[]
  codOrderIds: string[]
  counts: { [k: string]: number }
  totalOrders: number
  recentOrders: {
    id: string
    orderNumber: string
    fulfillmentStatus:
      | 'pending'
      | 'cancelled'
      | 'confirmed'
      | 'processing'
      | 'shipped'
      | 'delivered'
    placedAt: string
    finalTotalPoisha: number
    currency: string
  }[]
}>

type ClaimEligibilityOrderAccess = (
  session: ClientSession,
  orderId: string,
  principal: OrderPrincipal,
) => Promise<{
  status: 'pending' | 'cancelled' | 'confirmed' | 'processing' | 'shipped' | 'delivered'
  deliveredAt: Date | undefined
}>

type ClaimEligibilitySnapshotAccess = (
  session: ClientSession,
  orderId: string,
  principal: OrderPrincipal,
) => Promise<{
  status: 'pending' | 'cancelled' | 'confirmed' | 'processing' | 'shipped' | 'delivered'
  deliveredAt: Date | undefined
  items: { orderItemId: string; quantity: number; claimableQty: number }[]
}>

type ReturnNotificationOrderAccess = (
  session: ClientSession,
  orderId: string,
) => Promise<{ email: string; name: string; orderNumber: string; userId?: string; id: string }>

type VerifiedFundingOrderAccess = {
  notificationTarget(
    session: ClientSession,
    orderId: string,
  ): Promise<{ orderNumber: string; email: string; name: string; userId?: string; orderId: string }>
  riskState(
    session: ClientSession,
    orderId: string,
  ): Promise<'payment_pending' | 'none' | 'risk_review' | 'allocation_shortfall' | 'admin_review'>
  inspect(
    session: ClientSession,
    orderId: string,
  ): Promise<
    | {
        binding: {
          coupon?: {
            couponId: string
            code: string
            type: 'fixed' | 'percentage'
            value: number
            version: number
            discountPoisha: number
            eligibleLineIds: string[]
          }
          pricing: {
            items: {
              id: string
              variantId: string
              quantity: number
              couponEligible: boolean
              regularUnitPoisha: number
              effectiveUnitPoisha: number
            }[]
            deliveryChargePoisha: number
          }
          userId?: string
          orderId: string
          placedAt: Date
          generation: number
        }
        expectedPoisha: number
        eligible: boolean
        recoverable: boolean
        cancelled: boolean
      }
    | undefined
  >
  finish(session: ClientSession, orderId: string, committed: boolean, risk: boolean): Promise<void>
}

type ComplaintOrderAccess = (
  session: ClientSession,
  id: string,
  principal: OrderPrincipal,
) => Promise<{
  contact: { name: string; emailNormalized: string; phone: string }
  userId?: string
  orderId: string
}>

type CheckoutOrderReader = (
  session: ClientSession,
  principal: CheckoutPrincipal,
  orderId: string,
  intentId: string,
) => Promise<{
  fulfillmentHold?:
    | 'payment_pending'
    | 'none'
    | 'risk_review'
    | 'allocation_shortfall'
    | 'admin_review'
  id: string
  orderNumber: string
  fulfillmentStatus: 'pending' | 'shipped' | 'confirmed' | 'processing' | 'delivered' | 'cancelled'
  paymentMethod: 'cod' | 'online'
  revision: number
  placedAt: string
  finalTotalPoisha: number
  currency: 'BDT'
}>

type OrderCreationFactory = (
  checkout: {
    authorize(
      session: ClientSession,
      command: { orderId: string; checkoutIntentId: string },
    ): Promise<unknown>
  },
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  clock?: () => Date,
) => {
  create(
    session: ClientSession,
    raw: unknown,
  ): Promise<{
    id: string
    orderNumber: string
    fulfillmentStatus: 'pending'
    paymentMethod: 'cod' | 'online'
    revision: 0
  }>
}

type ExpiredOrderAllocationFactory = (
  payment: (session: ClientSession, orderId: string) => Promise<boolean>,
) => {
  authorize(
    session: ClientSession,
    orderId: string,
    generation: number,
    action: string,
  ): Promise<{
    coupon?: {
      couponId: string
      code: string
      type: 'fixed' | 'percentage'
      value: number
      version: number
      discountPoisha: number
      eligibleLineIds: string[]
    }
    pricing: {
      items: {
        id: string
        variantId: string
        quantity: number
        couponEligible: boolean
        regularUnitPoisha: number
        effectiveUnitPoisha: number
      }[]
      deliveryChargePoisha: number
    }
    userId?: string
    orderId: string
    placedAt: Date
    generation: number
  }>
}

type InitialOrderAllocationAccess = {
  authorize(
    session: ClientSession,
    orderId: string,
    generation: number,
    action: string,
  ): Promise<{
    coupon?: {
      couponId: string
      code: string
      type: 'fixed' | 'percentage'
      value: number
      version: number
      discountPoisha: number
      eligibleLineIds: string[]
    }
    pricing: {
      items: {
        id: string
        variantId: string
        quantity: number
        couponEligible: boolean
        regularUnitPoisha: number
        effectiveUnitPoisha: number
      }[]
      deliveryChargePoisha: number
    }
    userId?: string
    orderId: string
    placedAt: Date
    generation: number
  }>
}

type OrderAllocationFactory = (
  stock: {
    reserve: (
      session: ClientSession,
      input: unknown,
      heldAt: Date,
    ) => Promise<InventoryAllocationRecord>
    commit: (session: ClientSession, input: unknown) => Promise<InventoryAllocationRecord>
    commitCod: (session: ClientSession, input: unknown) => Promise<InventoryAllocationRecord>
    release: (
      session: ClientSession,
      input: unknown,
      expectedStatus: 'committed' | 'held',
    ) => Promise<InventoryAllocationRecord>
  },
  access: {
    authorize(
      session: ClientSession,
      orderId: string,
      generation: number,
      action: 'cod' | 'commit' | 'release_held' | 'hold' | 'release_committed',
    ): Promise<unknown>
  },
  clock?: () => Date,
) => {
  apply(
    session: ClientSession,
    raw: unknown,
  ): Promise<{
    coupon?: CouponAllocationRecord
    inventory: InventoryAllocationRecord[]
  }>
}

type FulfillmentStatusSchema = z.ZodEnum<{
  pending: 'pending'
  confirmed: 'confirmed'
  processing: 'processing'
  shipped: 'shipped'
  delivered: 'delivered'
  cancelled: 'cancelled'
}>

type OrderCreationProofSchema = z.ZodObject<
  {
    orderId: z.ZodString
    checkoutIntentId: z.ZodString
    quoteId: z.ZodString
    userId: z.ZodNullable<z.ZodString>
    acceptedAt: z.ZodISODateTime
    commercialDigest: z.ZodString
    snapshot: z.ZodObject<
      {
        draft: z.ZodObject<
          {
            items: z.ZodArray<
              z.ZodObject<{ variantId: z.ZodString; quantity: z.ZodInt }, z.core.$strict>
            >
            recipient: z.ZodObject<
              {
                recipient: z.ZodString
                phone: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>
                districtKey: z.ZodString
                areaKey: z.ZodString
                street: z.ZodString
                postalCode: z.ZodOptional<z.ZodString>
                addressLine2: z.ZodOptional<z.ZodString>
              },
              z.core.$strict
            >
            customer: z.ZodObject<
              {
                name: z.ZodString
                email: z.ZodEmail
                phone: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>
              },
              z.core.$strict
            >
            couponCode: z.ZodOptional<
              z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>
            >
            method: z.ZodEnum<{ cod: 'cod'; bkash: 'bkash'; nagad: 'nagad'; rocket: 'rocket' }>
          },
          z.core.$strict
        >
        items: z.ZodArray<
          z.ZodObject<
            {
              id: z.ZodString
              productId: z.ZodString
              variantId: z.ZodString
              productName: z.ZodString
              sku: z.ZodString
              variantAttributes: z.ZodPipe<
                z.ZodPipe<z.ZodUnknown, z.ZodRecord<z.ZodString, z.ZodString>>,
                z.ZodTransform<{ [k: string]: string }, Record<string, string>>
              >
              quantity: z.ZodInt
              regularUnitPoisha: z.ZodInt
              effectiveUnitPoisha: z.ZodInt
              regularLinePoisha: z.ZodInt
              productDiscountPoisha: z.ZodInt
              couponAllocatedPoisha: z.ZodInt
              netMerchandisePoisha: z.ZodInt
              couponEligible: z.ZodBoolean
            },
            z.core.$strict
          >
        >
        pricing: z.ZodObject<
          {
            regularSubtotalPoisha: z.ZodInt
            productDiscountPoisha: z.ZodInt
            saleSubtotalPoisha: z.ZodInt
            couponDiscountPoisha: z.ZodInt
            deliveryChargePoisha: z.ZodInt
            finalTotalPoisha: z.ZodInt
            currency: z.ZodLiteral<'BDT'>
          },
          z.core.$strict
        >
        coupon: z.ZodOptional<
          z.ZodObject<
            {
              couponId: z.ZodString
              code: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>
              type: z.ZodEnum<{ fixed: 'fixed'; percentage: 'percentage' }>
              value: z.ZodInt
              termsVersion: z.ZodInt
              eligibleSubtotalPoisha: z.ZodInt
              discountPoisha: z.ZodInt
            },
            z.core.$strict
          >
        >
        delivery: z.ZodObject<
          {
            zoneId: z.ZodString
            chargeRuleId: z.ZodString
            coverageKey: z.ZodString
            amountPoisha: z.ZodInt
            ruleVersion: z.ZodInt
          },
          z.core.$strict
        >
        deadlineBasis: z.ZodObject<
          {
            rule: z.ZodObject<
              {
                version: z.ZodString
                timezone: z.ZodLiteral<'Asia/Dhaka'>
                effectiveFrom: z.ZodISODateTime
                effectiveTo: z.ZodOptional<z.ZodISODateTime>
                target: z.ZodObject<
                  { startEvent: z.ZodLiteral<'confirmedAt'>; calendarDays: z.ZodInt },
                  z.core.$strict
                >
                estimate: z.ZodOptional<
                  z.ZodObject<
                    {
                      startEvent: z.ZodEnum<{ confirmedAt: 'confirmedAt'; placedAt: 'placedAt' }>
                      calendarDays: z.ZodInt
                    },
                    z.core.$strict
                  >
                >
                prepaid: z.ZodOptional<
                  z.ZodObject<
                    {
                      ruleRef: z.ZodString
                      handoverHours: z.ZodInt
                      deliveryCalendarDays: z.ZodInt
                    },
                    z.core.$strict
                  >
                >
                legalCaps: z.ZodArray<
                  z.ZodObject<
                    {
                      ruleRef: z.ZodString
                      startEvent: z.ZodEnum<{ confirmedAt: 'confirmedAt'; placedAt: 'placedAt' }>
                      calendarDays: z.ZodInt
                    },
                    z.core.$strict
                  >
                >
              },
              z.core.$strict
            >
            review: z.ZodObject<
              {
                evidenceRef: z.ZodString
                approvedAt: z.ZodISODateTime
                approvedBy: z.ZodString
                ruleDigest: z.ZodString
              },
              z.core.$strict
            >
            capturedAt: z.ZodISODateTime
          },
          z.core.$strict
        >
        deliveryDeadline: z.ZodObject<
          {
            status: z.ZodEnum<{
              awaiting_start: 'awaiting_start'
              calculated: 'calculated'
              under_review: 'under_review'
            }>
            startEvent: z.ZodLiteral<'confirmedAt'>
            ruleVersion: z.ZodString
            startEventAt: z.ZodOptional<z.ZodISODateTime>
            targetDeadlineAt: z.ZodOptional<z.ZodISODateTime>
            legalCapAt: z.ZodOptional<z.ZodISODateTime>
            effectiveAt: z.ZodOptional<z.ZodISODateTime>
            handoverDeadlineAt: z.ZodOptional<z.ZodISODateTime>
            handoverStatus: z.ZodOptional<
              z.ZodEnum<{
                pending: 'pending'
                awaiting_payment: 'awaiting_payment'
                met: 'met'
                overdue: 'overdue'
              }>
            >
          },
          z.core.$strict
        >
        availableMethods: z.ZodArray<
          z.ZodObject<
            {
              channel: z.ZodEnum<{ cod: 'cod'; bkash: 'bkash'; nagad: 'nagad'; rocket: 'rocket' }>
              active: z.ZodBoolean
              eligible: z.ZodBoolean
              reasonCode: z.ZodOptional<z.ZodString>
              minPoisha: z.ZodOptional<z.ZodInt>
              maxPoisha: z.ZodOptional<z.ZodInt>
            },
            z.core.$strict
          >
        >
        policyVersions: z.ZodArray<
          z.ZodObject<
            {
              type: z.ZodEnum<{
                shipping: 'shipping'
                cancellation: 'cancellation'
                returns: 'returns'
                refunds: 'refunds'
                privacy: 'privacy'
                terms: 'terms'
                complaints: 'complaints'
              }>
              version: z.ZodString
              effectiveAt: z.ZodISODateTime
            },
            z.core.$strict
          >
        >
      },
      z.core.$strict
    >
    notes: z.ZodOptional<z.ZodString>
  },
  z.core.$strict
>

type CustomerPaymentSummarySchema = z.ZodObject<
  {
    status: z.ZodEnum<{
      pending: 'pending'
      cancelled: 'cancelled'
      paid: 'paid'
      failed: 'failed'
      partially_refunded: 'partially_refunded'
      refunded: 'refunded'
    }>
    fundingContext: z.ZodEnum<{ normal: 'normal'; correction_only: 'correction_only' }>
    expectedPoisha: z.ZodInt
    verifiedCollectedPoisha: z.ZodInt
    merchandiseFundedPoisha: z.ZodInt
    correctionCollectedPoisha: z.ZodInt
    unassignedCollectedPoisha: z.ZodInt
    riskStatus: z.ZodEnum<{ clear: 'clear'; review: 'review'; rejected: 'rejected' }>
    merchandiseRefundHeldPoisha: z.ZodInt
    merchandiseRefundCompletedPoisha: z.ZodInt
    correctionRefundHeldPoisha: z.ZodInt
    correctionRefundCompletedPoisha: z.ZodInt
  },
  z.core.$strict
>

export type {
  DeliveryDeadlineBasisSchema,
  DeliveryDeadlineSchema,
} from './delivery-deadline.schema.js'
export type {
  CancellationRefundSnapshotAccess,
  CheckoutOrderReader,
  ClaimEligibilityOrderAccess,
  ClaimEligibilitySnapshotAccess,
  ClaimQuantityAccess,
  ClaimRestockAccess,
  ClaimReviewQuantityAccess,
  CodCollectionOrderAccess,
  ComplaintOrderAccess,
  CustomerOrderHistoryAccess,
  CustomerPaymentSummarySchema,
  DeliveryDeadlineService,
  DeliveryDispositionInput,
  DeliveryDispositionVerifier,
  ExpiredOrderAllocationFactory,
  FulfillmentStatusSchema,
  GuestOrderAccess,
  InitialOrderAllocationAccess,
  OrderAllocationFactory,
  OrderCreationFactory,
  OrderCreationProofSchema,
  OrderNotificationAccess,
  OrderReportAccess,
  PaymentMethodOrderAccess,
  RefundOrderSnapshotAccess,
  RefundRequestOrderAccess,
  RefundUnitOutcomeAccess,
  RefundUnitReservationAccess,
  ReturnNotificationOrderAccess,
  VerifiedAllocationService,
  VerifiedFundingOrderAccess,
}

import type { ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { OrderPrincipal } from '../auth/auth.public.js'
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

export type {
  CancellationRefundSnapshotAccess,
  ClaimEligibilityOrderAccess,
  ClaimEligibilitySnapshotAccess,
  ClaimQuantityAccess,
  ClaimRestockAccess,
  ClaimReviewQuantityAccess,
  CodCollectionOrderAccess,
  CustomerOrderHistoryAccess,
  DeliveryDeadlineService,
  DeliveryDispositionInput,
  DeliveryDispositionVerifier,
  GuestOrderAccess,
  OrderNotificationAccess,
  OrderReportAccess,
  PaymentMethodOrderAccess,
  RefundOrderSnapshotAccess,
  RefundRequestOrderAccess,
  RefundUnitOutcomeAccess,
  RefundUnitReservationAccess,
  VerifiedAllocationService,
}

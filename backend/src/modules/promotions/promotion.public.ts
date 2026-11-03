import type { ClientSession } from 'mongoose'

type PricingCalculator = (raw: unknown) => {
  items: {
    regularLinePoisha: number
    productDiscountPoisha: number
    saleLinePoisha: number
    couponAllocatedPoisha: number
    netMerchandisePoisha: number
    id: string
    variantId: string
    quantity: number
    couponEligible: boolean
    regularUnitPoisha: number
    effectiveUnitPoisha: number
  }[]
  regularSubtotalPoisha: number
  productDiscountPoisha: number
  saleSubtotalPoisha: number
  couponEligibleSubtotalPoisha: number
  couponDiscountPoisha: number
  deliveryChargePoisha: number
  finalTotalPoisha: number
}

type CouponGenerationReader = (
  session: ClientSession,
  orderId: string,
  generation: number,
) => Promise<{
  couponId: string
  status: 'held' | 'released' | 'redeemed'
  heldAt: Date | null | undefined
  expiresAt: Date | null | undefined
} | null>

type CouponAllocationFactory = (
  orders: {
    authorize(
      session: ClientSession,
      orderId: string,
      action: 'reserve' | 'redeem_cod' | 'commit' | 'release_held' | 'release_redeemed',
    ): Promise<unknown>
  },
  clock?: () => Date,
) => {
  reserve: (session: ClientSession, input: unknown, heldAt: Date) => Promise<CouponAllocationRecord>
  redeemCod: (session: ClientSession, input: unknown) => Promise<CouponAllocationRecord>
  commit: (session: ClientSession, input: unknown) => Promise<CouponAllocationRecord>
  release(
    session: ClientSession,
    input: unknown,
    expectedStatus: 'held' | 'redeemed',
  ): Promise<CouponAllocationRecord>
}

type CouponQuoteAccess = (
  code: string,
  principal: { kind: 'guest' } | { kind: 'customer'; userId: string },
  lines: ({
    id: string
    variantId: string
    quantity: number
    couponEligible: boolean
    regularUnitPoisha: number
    effectiveUnitPoisha: number
  } & { productId: string; categoryIds: string[] })[],
  deliveryChargePoisha: number,
  session: ClientSession,
  now: Date,
) => Promise<
  | {
      couponId: string
      eligibleSubtotalPoisha: number
      source: 'live_hold'
      pricing: {
        items: {
          regularLinePoisha: number
          productDiscountPoisha: number
          saleLinePoisha: number
          couponAllocatedPoisha: number
          netMerchandisePoisha: number
          id: string
          variantId: string
          quantity: number
          couponEligible: boolean
          regularUnitPoisha: number
          effectiveUnitPoisha: number
        }[]
        regularSubtotalPoisha: number
        productDiscountPoisha: number
        saleSubtotalPoisha: number
        couponEligibleSubtotalPoisha: number
        couponDiscountPoisha: number
        deliveryChargePoisha: number
        finalTotalPoisha: number
      }
      termsSnapshot: {
        code: string
        type: 'fixed' | 'percentage'
        value: number
        version: number
        discountPoisha: number
        eligibleLineIds: string[]
      }
    }
  | {
      couponId: string
      eligibleSubtotalPoisha: number
      source: 'current'
      pricing: {
        items: {
          regularLinePoisha: number
          productDiscountPoisha: number
          saleLinePoisha: number
          couponAllocatedPoisha: number
          netMerchandisePoisha: number
          id: string
          variantId: string
          quantity: number
          couponEligible: boolean
          regularUnitPoisha: number
          effectiveUnitPoisha: number
        }[]
        regularSubtotalPoisha: number
        productDiscountPoisha: number
        saleSubtotalPoisha: number
        couponEligibleSubtotalPoisha: number
        couponDiscountPoisha: number
        deliveryChargePoisha: number
        finalTotalPoisha: number
      }
      termsSnapshot: {
        code: string
        type: 'fixed' | 'percentage'
        value: number
        version: number
        discountPoisha: number
        eligibleLineIds: string[]
      }
    }
>

type CouponAllocationRecord = {
  id: string
  couponId: string
  orderId: string
  generation: number
  status: 'held' | 'released' | 'redeemed'
  heldAt: Date | null | undefined
  expiresAt: Date | null | undefined
  redeemedAt: Date | null | undefined
  releasedAt: Date | null | undefined
}

export type { PricingInputSchema } from './pricing.schema.js'
export type { CouponCodeSchema } from './promotion.schema.js'
export type {
  CouponAllocationFactory,
  CouponAllocationRecord,
  CouponGenerationReader,
  CouponQuoteAccess,
  PricingCalculator,
}

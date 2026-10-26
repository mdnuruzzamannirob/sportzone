import { text } from '../catalog/catalog.schema.js'
import { z } from 'zod'
import { addressInput, bangladeshPhone } from '../customers/customer.schema.js'
import { couponCode } from '../promotions/coupon.schema.js'
import { attributes } from '../catalog/variants/variant.schema.js'
import { deliveryDeadline, deliveryDeadlineBasis } from '../orders/delivery-deadline.schema.js'
import { paymentChannel, paymentMethodEligibility } from '../payments/payment-eligibility.schema.js'
import { policyType } from '../settings/policy.schema.js'
export const quoteId = z.string().regex(/^[a-f0-9]{24}$/)
const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const items = z
  .array(z.strictObject({ variantId: quoteId, quantity: z.int().min(1).max(50) }))
  .min(1)
  .max(40)
  .refine((v) => new Set(v.map((row) => row.variantId)).size === v.length)
export const checkoutQuoteInput = z
  .strictObject({
    items,
    recipient: addressInput.optional(),
    savedAddressId: quoteId.optional(),
    email: z.string().trim().email().max(254).toLowerCase().optional(),
    contactPhone: bangladeshPhone.optional(),
    couponCode: couponCode.optional(),
    method: paymentChannel,
  })
  .refine((v) => Boolean(v.recipient) !== Boolean(v.savedAddressId))
export const checkoutSubmitInput = checkoutQuoteInput.safeExtend({
  quoteId,
  acceptedTermsVersion: z.string().min(1).max(100),
  acceptedPolicyVersionIds: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(7)
    .refine((v) => new Set(v).size === v.length),
  notes: z.string().trim().max(2000).optional(),
})
export const quoteLine = z.strictObject({
  id: quoteId,
  productId: quoteId,
  variantId: quoteId,
  productName: text(120),
  sku: z.string().min(1).max(64),
  variantAttributes: attributes,
  quantity: z.int().min(1).max(50),
  regularUnitPoisha: money,
  effectiveUnitPoisha: money,
  regularLinePoisha: money,
  productDiscountPoisha: money,
  couponAllocatedPoisha: money,
  netMerchandisePoisha: money,
  couponEligible: z.boolean(),
})
export const quotePolicyRef = z.strictObject({
  type: policyType,
  version: z.string().min(1).max(100),
  effectiveAt: z.iso.datetime({ offset: true }),
})
export const quoteTotals = z.strictObject({
  regularSubtotalPoisha: money,
  productDiscountPoisha: money,
  saleSubtotalPoisha: money,
  couponDiscountPoisha: money,
  deliveryChargePoisha: money,
  finalTotalPoisha: money,
  currency: z.literal('BDT'),
})
export const checkoutQuote = quoteTotals.extend({
  quoteId,
  items: z.array(quoteLine).min(1).max(40),
  deliveryEstimate: z.iso.datetime({ offset: true }).optional(),
  quoteExpiresAt: z.iso.datetime({ offset: true }),
  deliveryDeadline,
  availableMethods: z.array(paymentMethodEligibility).length(4),
  policyVersions: z.array(quotePolicyRef).min(1).max(7),
})
export const normalizedCheckoutDraft = z.strictObject({
  items,
  recipient: addressInput,
  customer: z.strictObject({
    name: text(120),
    email: z.email().max(254),
    phone: bangladeshPhone,
  }),
  couponCode: couponCode.optional(),
  method: paymentChannel,
})
export const quoteCouponSnapshot = z.strictObject({
  couponId: quoteId,
  code: couponCode,
  type: z.enum(['fixed', 'percentage']),
  value: money.min(1),
  termsVersion: money,
  eligibleSubtotalPoisha: money,
  discountPoisha: money,
})
export const checkoutCommercialSnapshot = z.strictObject({
  draft: normalizedCheckoutDraft,
  items: z.array(quoteLine).min(1).max(40),
  pricing: quoteTotals,
  coupon: quoteCouponSnapshot.optional(),
  delivery: z.strictObject({
    zoneId: quoteId,
    chargeRuleId: quoteId,
    coverageKey: z.string().min(1).max(129),
    amountPoisha: money,
    ruleVersion: money,
  }),
  deadlineBasis: deliveryDeadlineBasis,
  deliveryDeadline,
  availableMethods: z.array(paymentMethodEligibility).length(4),
  policyVersions: z.array(quotePolicyRef).min(1).max(7),
})

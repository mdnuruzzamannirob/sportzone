import { z } from 'zod'
import { couponTerms, pricingInput } from './pricing.schema.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const integer = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const couponCode = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().min(1).max(64))
const fields = {
  id,
  codeNormalized: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => couponCode.safeParse(value).data === value),
  minEligibleSubtotalPoisha: integer,
  startsAt: z.date(),
  expiresAt: z.date(),
  status: z.enum(['active', 'inactive']),
  overallLimit: integer.min(1).optional(),
  perCustomerLimit: integer.min(1).optional(),
  heldCount: integer,
  redeemedCount: integer,
  termsVersion: integer,
}
export const couponState = z
  .discriminatedUnion('type', [
    z.strictObject({ ...fields, type: z.literal('fixed'), value: integer.min(1) }),
    z.strictObject({ ...fields, type: z.literal('percentage'), value: z.int().min(1).max(10000) }),
  ])
  .refine((value) => value.startsAt < value.expiresAt)
const pricing = pricingInput.safeExtend({ coupon: z.undefined().optional() })
const terms = z
  .strictObject({
    code: couponCode,
    type: z.enum(['fixed', 'percentage']),
    value: integer.min(1),
    version: integer,
    discountPoisha: integer,
    eligibleLineIds: z.array(id).min(1).max(40),
  })
  .refine(
    (value) =>
      couponTerms.safeParse({ type: value.type, value: value.value }).success &&
      new Set(value.eligibleLineIds).size === value.eligibleLineIds.length,
  )
export const couponEligibilityInput = z.strictObject({
  code: couponCode,
  coupon: couponState.nullable(),
  principal: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('guest') }),
    z.strictObject({ kind: z.literal('customer'), userId: id }),
  ]),
  pricing,
  customerUsage: z
    .strictObject({ couponId: id, userId: id, heldCount: integer, redeemedCount: integer })
    .optional(),
  accepted: z.strictObject({ orderId: id, couponId: id, pricing, terms }).optional(),
  hold: z
    .strictObject({
      orderId: id,
      couponId: id,
      userId: id.optional(),
      heldAt: z.date(),
      expiresAt: z.date(),
      status: z.literal('held'),
    })
    .optional(),
})

export const couponPreviewInput = z.strictObject({
  code: couponCode,
  items: z
    .array(
      z.strictObject({
        variantId: z.string().regex(/^[a-f0-9]{24}$/),
        quantity: z.int().min(1).max(50),
      }),
    )
    .min(1)
    .max(40)
    .refine((items) => new Set(items.map((item) => item.variantId)).size === items.length),
  deliveryArea: z
    .strictObject({ districtKey: z.string().min(1).max(128), areaKey: z.string().min(1).max(128) })
    .optional(),
})
export const couponPreviewResult = z.strictObject({
  eligible: z.boolean(),
  discountPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  reasonCode: z.literal('COUPON_UNAVAILABLE').optional(),
})

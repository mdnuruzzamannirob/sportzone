import { z } from 'zod'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const couponTerms = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('fixed'), value: money.min(1) }),
  z.strictObject({ type: z.literal('percentage'), value: z.int().min(1).max(10000) }),
])
const selection = z.strictObject({
  id,
  variantId: id,
  quantity: z.int().min(1).max(50),
  couponEligible: z.boolean(),
})
export const pricingRequest = z
  .strictObject({
    items: z.array(selection).min(1).max(40),
    coupon: couponTerms.optional(),
    deliveryChargePoisha: money,
  })
  .superRefine(({ items }, context) => {
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      new Set(items.map((item) => item.variantId)).size !== items.length
    )
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Duplicate item or variant identity',
      })
  })
export const pricingInput = pricingRequest.safeExtend({
  items: z
    .array(
      selection
        .extend({ regularUnitPoisha: money, effectiveUnitPoisha: money })
        .refine((line) => line.effectiveUnitPoisha <= line.regularUnitPoisha),
    )
    .min(1)
    .max(40),
})

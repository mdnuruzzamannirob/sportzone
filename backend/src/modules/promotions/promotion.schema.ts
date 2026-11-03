import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { couponTerms, pricingInput } from './pricing.schema.js'

const couponId = z.string().regex(/^[a-f0-9]{24}$/)

const couponInteger = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const couponCode = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().min(1).max(64))

const couponFields = {
  id: couponId,
  codeNormalized: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => couponCode.safeParse(value).data === value),
  minEligibleSubtotalPoisha: couponInteger,
  startsAt: z.date(),
  expiresAt: z.date(),
  status: z.enum(['active', 'inactive']),
  overallLimit: couponInteger.min(1).optional(),
  perCustomerLimit: couponInteger.min(1).optional(),
  heldCount: couponInteger,
  redeemedCount: couponInteger,
  termsVersion: couponInteger,
}

const couponState = z
  .discriminatedUnion('type', [
    z.strictObject({ ...couponFields, type: z.literal('fixed'), value: couponInteger.min(1) }),
    z.strictObject({
      ...couponFields,
      type: z.literal('percentage'),
      value: z.int().min(1).max(10000),
    }),
  ])
  .refine((value) => value.startsAt < value.expiresAt)

const pricing = pricingInput.safeExtend({ coupon: z.undefined().optional() })

const terms = z
  .strictObject({
    code: couponCode,
    type: z.enum(['fixed', 'percentage']),
    value: couponInteger.min(1),
    version: couponInteger,
    discountPoisha: couponInteger,
    eligibleLineIds: z.array(couponId).min(1).max(40),
  })
  .refine(
    (value) =>
      couponTerms.safeParse({ type: value.type, value: value.value }).success &&
      new Set(value.eligibleLineIds).size === value.eligibleLineIds.length,
  )

const couponEligibilityInput = z.strictObject({
  code: couponCode,
  coupon: couponState.nullable(),
  principal: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('guest') }),
    z.strictObject({ kind: z.literal('customer'), userId: couponId }),
  ]),
  pricing,
  customerUsage: z
    .strictObject({
      couponId: couponId,
      userId: couponId,
      heldCount: couponInteger,
      redeemedCount: couponInteger,
    })
    .optional(),
  accepted: z.strictObject({ orderId: couponId, couponId: couponId, pricing, terms }).optional(),
  hold: z
    .strictObject({
      orderId: couponId,
      couponId: couponId,
      userId: couponId.optional(),
      heldAt: z.date(),
      expiresAt: z.date(),
      status: z.literal('held'),
    })
    .optional(),
})

const couponPreviewInput = z.strictObject({
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

const couponPreviewResult = z.strictObject({
  eligible: z.boolean(),
  discountPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  reasonCode: z.literal('COUPON_UNAVAILABLE').optional(),
})

const id = z.string().regex(/^[a-f0-9]{24}$/)

const integer = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const ids = z
  .array(id)
  .max(200)
  .refine((v) => new Set(v).size === v.length)

const fields = {
  code: couponCode,
  type: z.enum(['fixed', 'percentage']),
  value: integer.min(1),
  minEligibleSubtotalPoisha: integer,
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: z.enum(['active', 'inactive']),
  overallLimit: integer.min(1).optional(),
  perCustomerLimit: integer.min(1).optional(),
  eligibleProductIds: ids.optional(),
  eligibleCategoryIds: ids.optional(),
}

const couponInput = z
  .strictObject(fields)
  .refine(
    (v) =>
      new Date(v.startsAt) < new Date(v.expiresAt) && (v.type !== 'percentage' || v.value <= 10000),
  )

const couponPatch = z
  .strictObject({
    ...fields,
    overallLimit: integer.min(1).nullable().optional(),
    perCustomerLimit: integer.min(1).nullable().optional(),
    eligibleProductIds: ids.nullable().optional(),
    eligibleCategoryIds: ids.nullable().optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0)

const couponDeactivate = z.strictObject({ reason: z.string().trim().min(1).max(2000) })

const couponParams = z.strictObject({ couponId: id })

const couponListQuery = paginationSchema.safeExtend({ status: fields.status.optional() })

const couponHistoryQuery = paginationSchema

const couponAdmin = z.strictObject({
  ...fields,
  id,
  heldCount: integer,
  redeemedCount: integer,
  termsVersion: integer,
  revision: integer,
})

const couponHistory = z.strictObject({
  id,
  couponId: id,
  orderId: id,
  userId: id.optional(),
  generation: integer.min(1),
  status: z.enum(['held', 'redeemed', 'released']),
  termsSnapshot: z.strictObject({
    code: z.string(),
    type: fields.type,
    value: integer.min(1),
    version: integer,
    discountPoisha: integer,
    eligibleLineIds: z.array(id).min(1).max(40),
  }),
  heldAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().optional(),
  redeemedAt: z.iso.datetime().optional(),
  releasedAt: z.iso.datetime().optional(),
})

export { parseRevision as parseCouponRevision } from '../../shared/preconditions.js'
export {
  couponAdmin,
  couponCode,
  couponDeactivate,
  couponEligibilityInput,
  couponHistory,
  couponHistoryQuery,
  couponInput,
  couponListQuery,
  couponParams,
  couponPatch,
  couponPreviewInput,
  couponPreviewResult,
  couponState,
}

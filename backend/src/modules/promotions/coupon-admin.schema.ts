import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { couponCode } from './coupon.schema.js'
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
export const couponInput = z
  .strictObject(fields)
  .refine(
    (v) =>
      new Date(v.startsAt) < new Date(v.expiresAt) && (v.type !== 'percentage' || v.value <= 10000),
  )
export const couponPatch = z
  .strictObject({
    ...fields,
    overallLimit: integer.min(1).nullable().optional(),
    perCustomerLimit: integer.min(1).nullable().optional(),
    eligibleProductIds: ids.nullable().optional(),
    eligibleCategoryIds: ids.nullable().optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0)
export const couponDeactivate = z.strictObject({ reason: z.string().trim().min(1).max(2000) })
export const couponParams = z.strictObject({ couponId: id })
export const couponListQuery = paginationSchema.safeExtend({ status: fields.status.optional() })
export const couponHistoryQuery = paginationSchema
export const couponAdmin = z.strictObject({
  ...fields,
  id,
  heldCount: integer,
  redeemedCount: integer,
  termsVersion: integer,
  revision: integer,
})
export const couponHistory = z.strictObject({
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
export function parseCouponRevision(value: string | undefined) {
  if (value === undefined) return undefined
  if (!/^"(0|[1-9]\d*)"$/.test(value)) return NaN
  const n = Number(value.slice(1, -1))
  return Number.isSafeInteger(n) ? n : NaN
}

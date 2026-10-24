import { z } from 'zod'
export const reviewId = z.string().regex(/^[a-f0-9]{24}$/)
const comment = z
  .string()
  .trim()
  .min(1)
  .refine((value) => [...value].length <= 2000)
  .meta({ maxLength: 2000 })
export const reviewCreate = z.strictObject({
  rating: z.int().min(1).max(5),
  comment,
  qualifyingOrderItemId: reviewId,
})
export const reviewEdit = z
  .strictObject({ rating: z.int().min(1).max(5).optional(), comment: comment.optional() })
  .refine((value) => Object.keys(value).length > 0)
export const reviewModeration = z.strictObject({
  decision: z.enum(['approve', 'reject', 'hide']),
  reason: comment,
})
export const purchaseProof = z.strictObject({
  userId: reviewId,
  productId: reviewId,
  qualifyingOrderItemId: reviewId,
  orderId: reviewId,
  delivered: z.literal(true),
  eligible: z.literal(true),
})
export const moderationKey = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value === value.trim() &&
      [...value].every(
        (character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
      ),
  )
export const moderationReceipt = z.strictObject({
  actorType: z.literal('admin'),
  actorId: reviewId,
  targetId: reviewId,
  operationKey: moderationKey,
  action: z.string(),
  reason: z.string(),
})

import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'

const reviewId = z.string().regex(/^[a-f0-9]{24}$/)

const comment = z
  .string()
  .trim()
  .min(1)
  .refine((value) => [...value].length <= 2000)
  .meta({ maxLength: 2000 })

const reviewCreate = z.strictObject({
  rating: z.int().min(1).max(5),
  comment,
  qualifyingOrderItemId: reviewId,
})

const reviewEdit = z
  .strictObject({ rating: z.int().min(1).max(5).optional(), comment: comment.optional() })
  .refine((value) => Object.keys(value).length > 0)

const reviewModeration = z.strictObject({
  decision: z.enum(['approve', 'reject', 'hide']),
  reason: comment,
})

const purchaseProof = z.strictObject({
  userId: reviewId,
  productId: reviewId,
  qualifyingOrderItemId: reviewId,
  orderId: reviewId,
  delivered: z.literal(true),
  eligible: z.literal(true),
})

const moderationKey = z
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

const moderationReceipt = z.strictObject({
  actorType: z.literal('admin'),
  actorId: reviewId,
  targetId: reviewId,
  operationKey: moderationKey,
  action: z.string(),
  reason: z.string(),
})

const reviewAdminQuery = paginationSchema.safeExtend({
  status: z.enum(['pending', 'approved', 'rejected', 'hidden']).optional(),
  productId: reviewId.optional(),
})

const reviewView = z.strictObject({
  id: reviewId,
  productId: reviewId,
  rating: z.int().min(1).max(5),
  comment: z.string().min(1).max(4000),
  status: z.enum(['pending', 'approved', 'rejected', 'hidden']),
  createdAt: z.iso.datetime(),
  verifiedPurchase: z.literal(true),
})

const adminReviewView = reviewView.extend({
  userId: reviewId,
  orderId: reviewId,
  moderationReason: z.string().optional(),
  moderatedAt: z.iso.datetime().optional(),
})

export {
  reviewId,
  reviewCreate,
  reviewEdit,
  reviewModeration,
  purchaseProof,
  moderationKey,
  moderationReceipt,
  reviewAdminQuery,
  reviewView,
  adminReviewView,
}

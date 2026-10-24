import { expect, it } from 'vitest'
import {
  purchaseProof,
  reviewCreate,
  reviewEdit,
  reviewModeration,
  moderationKey,
} from '../../src/modules/reviews/review.schema.js'
const qualifyingOrderItemId = '000000000000000000000001'
it.each([1, 2, 3, 4, 5])('accepts rating %s without a positivity threshold', (rating) => {
  expect(reviewCreate.parse({ rating, comment: ' Feedback ', qualifyingOrderItemId }).comment).toBe(
    'Feedback',
  )
})
it.each([0, 6, 1.5, '5', null])('rejects invalid rating %s', (rating) => {
  expect(
    reviewCreate.safeParse({ rating, comment: 'Feedback', qualifyingOrderItemId }).success,
  ).toBe(false)
})
it('bounds comments by Unicode code points without truncating them', () => {
  expect(
    reviewCreate.safeParse({ rating: 1, comment: '🏏'.repeat(2000), qualifyingOrderItemId })
      .success,
  ).toBe(true)
  expect(
    reviewCreate.safeParse({ rating: 1, comment: '🏏'.repeat(2001), qualifyingOrderItemId })
      .success,
  ).toBe(false)
  expect(reviewCreate.safeParse({ rating: 1, comment: '  ', qualifyingOrderItemId }).success).toBe(
    false,
  )
})
it.each([
  { status: 'approved' },
  { isVerifiedPurchase: true },
  { userId: qualifyingOrderItemId },
  { orderId: qualifyingOrderItemId },
  { reviewedBy: qualifyingOrderItemId },
])('rejects protected author fields %j', (extra) => {
  expect(
    reviewCreate.safeParse({ rating: 1, comment: 'Feedback', qualifyingOrderItemId, ...extra })
      .success,
  ).toBe(false)
})
it('accepts only nonempty authored changes and rejects moderation fields in edits', () => {
  expect(reviewEdit.safeParse({}).success).toBe(false)
  expect(reviewEdit.safeParse({ comment: 'Updated' }).success).toBe(true)
  expect(reviewEdit.safeParse({ status: 'approved' }).success).toBe(false)
})
it.each(['approve', 'reject', 'hide'])(
  'requires a reason for moderation decision %s',
  (decision) => {
    expect(
      reviewModeration.safeParse({ decision, reason: 'Documented review reason' }).success,
    ).toBe(true)
    expect(reviewModeration.safeParse({ decision, reason: '  ' }).success).toBe(false)
    expect(reviewModeration.safeParse({ decision, reason: 'Reason', rating: 5 }).success).toBe(
      false,
    )
  },
)
it('rejects boolean and unsupported purchase proofs', () => {
  expect(purchaseProof.safeParse(true).success).toBe(false)
  expect(purchaseProof.safeParse({ orderId: qualifyingOrderItemId, delivered: true }).success).toBe(
    false,
  )
})

it('validates opaque moderation causes without truncating or accepting controls', () => {
  expect(moderationKey.parse('x'.repeat(128))).toHaveLength(128)
  for (const key of ['', 'x'.repeat(129), ' bad ', 'bad\nkey'])
    expect(moderationKey.safeParse(key).success).toBe(false)
})

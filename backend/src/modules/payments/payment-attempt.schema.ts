import { z } from 'zod'
export const attemptId = z.string().regex(/^[a-f0-9]{24}$/)
export const prepareAttemptInput = z.strictObject({
  attemptId,
  orderId: attemptId,
  requestedChannel: z.enum(['bkash', 'nagad', 'rocket']),
  retryOfAttemptId: attemptId.optional(),
})
export const attemptAllocation = z
  .strictObject({
    orderId: attemptId,
    channel: z.enum(['bkash', 'nagad', 'rocket']),
    heldAt: z.date(),
    expiresAt: z.date(),
    minPoisha: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
    maxPoisha: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .refine(
    (value) =>
      value.minPoisha <= value.maxPoisha &&
      value.expiresAt.getTime() === value.heldAt.getTime() + 900000,
  )

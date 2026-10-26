import { z } from 'zod'
export const paymentChannel = z.enum(['cod', 'bkash', 'nagad', 'rocket'])
const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const paymentMethodEligibility = z.strictObject({
  channel: paymentChannel,
  active: z.boolean(),
  eligible: z.boolean(),
  reasonCode: z.string().min(1).max(100).optional(),
  minPoisha: money.optional(),
  maxPoisha: money.optional(),
})
export const verifiedChannelCapability = z
  .strictObject({
    channel: z.enum(['bkash', 'nagad', 'rocket']),
    active: z.boolean(),
    minPoisha: money.min(1),
    maxPoisha: money.min(1),
  })
  .refine((v) => v.minPoisha <= v.maxPoisha)

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
export const paymentMethodsQuery = z.strictObject({
  amountPoisha: z
    .string()
    .regex(/^(0|[1-9]\d*)$/)
    .transform(Number)
    .pipe(money)
    .optional(),
  orderId: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
})
export const paymentMethodsView = z.strictObject({
  methods: z.array(paymentMethodEligibility).max(4),
})
export const paymentChannelApproval = z
  .strictObject({
    channel: z.enum(['bkash', 'nagad', 'rocket']),
    appEnv: z.enum(['local', 'test', 'staging', 'production']),
    mode: z.enum(['sandbox', 'live']),
    merchantAccountKey: z.string().regex(/^[a-f0-9]{64}$/),
    gatewayKey: z.string().regex(/^[A-Za-z0-9_]{1,30}$/),
    minPoisha: z.int().min(1000).max(50000000),
    maxPoisha: z.int().min(1000).max(50000000),
    verifiedAt: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }),
    approvedBy: z.string().trim().min(1).max(120),
    evidenceRef: z.string().trim().min(1).max(2000),
    evidenceFile: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    (v) =>
      v.minPoisha <= v.maxPoisha &&
      Date.parse(v.verifiedAt) < Date.parse(v.validUntil) &&
      v.mode === (v.appEnv === 'production' ? 'live' : 'sandbox'),
  )
export type PaymentChannelApproval = z.infer<typeof paymentChannelApproval>

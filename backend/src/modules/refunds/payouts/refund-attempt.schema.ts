import { z } from 'zod'

const id = z.string().regex(/^[a-f0-9]{24}$/)

const reference = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))

const digest = z.string().regex(/^[a-f0-9]{64}$/)

const manualEvidence = z.strictObject({
  destinationMasked: reference(200),
  transferReference: reference(256),
  evidenceDigest: digest,
  confirmedBy: id,
  confirmedAt: z.date(),
})

// A validated fact shape alone is not actual provider/transfer verification. Canonical durable
// attempts and refundRecoveryService separately own intent, protected outcome proof and settlement.
const refundAttemptFact = z
  .strictObject({
    refundId: id,
    attemptNumber: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    idempotencyKey: reference(128),
    provider: z.enum(['sslcommerz', 'manual']),
    originalBankTranId: reference(256).optional(),
    refundTransId: reference(30).optional(),
    refundRefId: reference(50).optional(),
    status: z.enum(['created', 'submitted', 'uncertain', 'confirmed', 'failed']),
    amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    initiatedAt: z.date(),
    lastCheckedAt: z.date().optional(),
    confirmedAt: z.date().optional(),
    manualEvidence: manualEvidence.optional(),
    failureCode: reference(128).optional(),
    lastOperationKey: reference(128).optional(),
  })
  .superRefine((value, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (value.lastCheckedAt && value.lastCheckedAt < value.initiatedAt)
      fail('lastCheckedAt', 'Check precedes initiation')
    if (value.status === 'confirmed') {
      if (!value.confirmedAt || value.confirmedAt < value.initiatedAt)
        fail('confirmedAt', 'Valid confirmation time required')
    } else if (value.confirmedAt || value.manualEvidence)
      fail('confirmedAt', 'Unconfirmed attempt cannot have payout confirmation')
    if (value.provider === 'sslcommerz') {
      if (!value.originalBankTranId || !value.refundTransId)
        fail('refundTransId', 'Original and merchant references required')
      if (value.manualEvidence) fail('manualEvidence', 'Gateway attempt cannot use manual proof')
      if (value.status === 'confirmed' && !value.refundRefId)
        fail('refundRefId', 'Provider reference required for status verification')
    } else {
      if (value.originalBankTranId || value.refundTransId || value.refundRefId)
        fail('provider', 'Manual attempt cannot use gateway references')
      if (
        value.status === 'confirmed' &&
        (!value.manualEvidence ||
          value.manualEvidence.confirmedAt.getTime() !== value.confirmedAt?.getTime())
      )
        fail('manualEvidence', 'Confirmed manual transfer requires matching evidence')
    }
  })

export { refundAttemptFact }

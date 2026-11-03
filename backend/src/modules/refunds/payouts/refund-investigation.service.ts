import { z } from 'zod'
import { assertOutsideTransaction } from '../../../shared/database/transaction.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import type { PaymentGateway } from '../../payments/payment.public.js'

const ref = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (v) =>
        v === v.trim() && [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    )

const input = z.strictObject({
  refundRefId: ref(50),
  bankTranId: ref(80),
  merchantAccountKey: z.string().regex(/^[a-f0-9]{64}$/),
})

// Read-only classification. The provider status API has no amount, and provider timestamp zone is
// unqualified. Even a refunded report requires later durable identity/amount/time verification.
function createRefundInvestigationService(provider: Pick<PaymentGateway, 'queryRefund'>) {
  return async (raw: unknown) => {
    assertOutsideTransaction()
    const expected = parseInput(input, raw)
    const result = await provider.queryRefund({
      refundRefId: expected.refundRefId,
      bankTranId: expected.bankTranId,
    })
    if (
      result.kind !== 'refund_report' ||
      result.merchantAccountKey !== expected.merchantAccountKey ||
      result.refundRefId !== expected.refundRefId ||
      result.bankTranId !== expected.bankTranId
    )
      return { state: 'investigate' as const }
    if (result.status === 'processing')
      return {
        state: 'pending' as const,
        evidenceDigest: result.evidenceDigest,
      }
    if (result.status === 'cancelled')
      return {
        state: 'investigate' as const,
        evidenceDigest: result.evidenceDigest,
      }
    return {
      state: 'independent_verification_required' as const,
      evidenceDigest: result.evidenceDigest,
    }
  }
}

const id = z.string().regex(/^[a-f0-9]{24}$/)

const retryInput = z.strictObject({
  refundId: id,
  attemptId: id,
  sourceCollectionId: id,
  amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
  capacityStatus: z.enum(['not_reserved', 'reserved', 'completed', 'released']),
  attemptStatus: z.enum(['created', 'submitted', 'uncertain', 'confirmed', 'failed']),
  initiatedAt: z.date(),
  lastOperationAt: z.date(),
  otherOpenAttempts: z.int().nonnegative().max(100),
  now: z.date(),
  proof: z
    .strictObject({
      refundId: id,
      attemptId: id,
      sourceCollectionId: id,
      amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
      outcome: z.literal('verified_no_payout'),
      checkedAt: z.date(),
      evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
})

// Advisory assessment only. Canonical refundRecoveryService owns current-admin proof revalidation,
// capacity reacquisition and durable retry identity; this helper never authorizes a mutation.
function assessRefundRetry(raw: unknown) {
  const data = parseInput(retryInput, raw)
  if (data.lastOperationAt < data.initiatedAt || data.now < data.lastOperationAt)
    return { state: 'investigate' as const }
  if (data.attemptStatus === 'confirmed' && data.capacityStatus === 'completed')
    return { state: 'already_confirmed' as const }
  if (data.attemptStatus === 'confirmed' || data.capacityStatus === 'completed')
    return { state: 'investigate' as const }
  if (
    data.capacityStatus !== 'reserved' ||
    data.otherOpenAttempts ||
    !data.proof ||
    !['uncertain', 'failed'].includes(data.attemptStatus)
  )
    return { state: 'investigate' as const }
  const proof = data.proof
  if (
    proof.refundId !== data.refundId ||
    proof.attemptId !== data.attemptId ||
    proof.sourceCollectionId !== data.sourceCollectionId ||
    proof.amountPoisha !== data.amountPoisha ||
    proof.checkedAt <= data.lastOperationAt ||
    proof.checkedAt > data.now
  )
    return { state: 'investigate' as const }
  return {
    state: 'retry_review_required' as const,
    evidenceDigest: proof.evidenceDigest,
  }
}

export { assessRefundRetry, createRefundInvestigationService }

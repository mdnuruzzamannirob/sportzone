import { z } from 'zod'

type RefundOutcomeProof = z.output<typeof refundOutcomeProof>

type RefundOutcomeVerifier = (input: { refundId: string; attemptId: string }) => Promise<unknown>

const id = z.string().regex(/^[a-f0-9]{24}$/)

const refundOutcomeProof = z
  .strictObject({
    refundId: id,
    orderId: id,
    sourceCollectionId: id,
    attemptId: id,
    amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    outcome: z.enum(['paid', 'no_payout']),
    checkedAt: z.date(),
    paidAt: z.date().optional(),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    provider: z.enum(['sslcommerz', 'manual']),
    method: z.enum(['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank']),
    merchantAccountKey: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    bankTranId: z.string().min(1).max(256).optional(),
    refundTransId: z.string().min(1).max(30).optional(),
    refundRefId: z.string().min(1).max(50).optional(),
    transferReference: z.string().min(1).max(256).optional(),
    evidenceRef: z.string().min(1).max(256).optional(),
    destinationMasked: z.string().min(1).max(200).regex(/[*•]/u).optional(),
    consentEvidenceRef: z.string().min(1).max(256).optional(),
    consentDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    consentAt: z.date().optional(),
  })
  .refine((p) => (p.outcome === 'paid' ? Boolean(p.paidAt) : p.paidAt === undefined))

export type { RefundOutcomeProof, RefundOutcomeVerifier }
export { refundOutcomeProof }

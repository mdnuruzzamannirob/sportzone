import type { ClientSession } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const reference = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const money = z.int().positive().max(Number.MAX_SAFE_INTEGER)
const method = z.enum(['manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank'])
const snapshotSchema = z.strictObject({
  refundId: id,
  orderId: id,
  sourceCollectionId: id,
  attemptId: id,
  method,
  amountPoisha: money,
  sourceCollectedPoisha: money,
  sourceReservedPoisha: money,
  obligationReservedPoisha: money,
  capacityStatus: z.literal('reserved'),
  status: z.enum(['approved', 'processing']),
  attemptStatus: z.enum(['submitted', 'uncertain']),
  collectionVerifiedAt: z.date(),
  approvedAt: z.date(),
  initiatedAt: z.date(),
  refundRevision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sourceRevision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  attemptRevision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  consentRequired: z.boolean(),
})
const requestSchema = z.strictObject({ transferReference: reference, evidenceRef: reference })
const proofSchema = z.strictObject({
  refundId: id,
  orderId: id,
  sourceCollectionId: id,
  attemptId: id,
  method,
  amountPoisha: money,
  transferReference: reference,
  evidenceRef: reference,
  verdict: z.literal('verified'),
  transferredAt: z.date(),
  evidenceDigest: digest,
  destinationMasked: reference.refine((value) => /[*•]/u.test(value)),
  consentDigest: digest.optional(),
  consentAt: z.date().optional(),
})

// Private read-only verification. The reader and verifier are protected capabilities, never request
// fields. Canonical refundRecoveryService separately reauthorizes/fences persisted facts and settles
// the financial ledger atomically; this compatibility capability remains read-only.
export function manualPayoutVerificationService(
  admin: AdminAccountAccess,
  readReserved: (session: ClientSession, refundId: string) => Promise<unknown>,
  verifyEvidence: (input: {
    refundId: string
    transferReference: string
    evidenceRef: string
  }) => Promise<unknown>,
  clock: () => Date = () => new Date(),
) {
  return async (token: string | undefined, rawId: unknown, raw: unknown) => {
    assertOutsideTransaction()
    const refundId = parseInput(id, rawId),
      request = parseInput(requestSchema, raw)
    const read = () =>
      admin.owned(
        token,
        async (actorId, session) => {
          if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
          const snapshot = parseInput(snapshotSchema, await readReserved(session, refundId))
          if (
            snapshot.refundId !== refundId ||
            snapshot.amountPoisha > snapshot.sourceCollectedPoisha ||
            snapshot.amountPoisha > snapshot.sourceReservedPoisha ||
            snapshot.obligationReservedPoisha !== snapshot.amountPoisha ||
            snapshot.sourceReservedPoisha > snapshot.sourceCollectedPoisha ||
            snapshot.collectionVerifiedAt > snapshot.approvedAt ||
            snapshot.approvedAt > snapshot.initiatedAt
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          return { actorId, snapshot }
        },
        false,
      )
    const before = await read()
    let evidence: unknown
    try {
      evidence = await verifyEvidence({ refundId, ...request })
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const proof = parseInput(proofSchema, evidence)
    const now = clock(),
      expected = before.snapshot
    if (
      !Number.isFinite(now.getTime()) ||
      proof.transferredAt > now ||
      proof.transferredAt < expected.initiatedAt ||
      proof.refundId !== refundId ||
      proof.orderId !== expected.orderId ||
      proof.sourceCollectionId !== expected.sourceCollectionId ||
      proof.attemptId !== expected.attemptId ||
      proof.method !== expected.method ||
      proof.amountPoisha !== expected.amountPoisha ||
      proof.evidenceRef !== request.evidenceRef ||
      proof.transferReference !== request.transferReference ||
      (expected.consentRequired &&
        (!proof.consentDigest || !proof.consentAt || proof.consentAt > proof.transferredAt))
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    const after = await read()
    if (
      before.actorId !== after.actorId ||
      JSON.stringify(before.snapshot) !== JSON.stringify(after.snapshot)
    )
      throw new ApiError('STATE_CONFLICT')
    return {
      state: 'evidence_verified' as const,
      evidenceDigest: proof.evidenceDigest,
      transferredAt: proof.transferredAt,
      ...(proof.consentDigest ? { consentDigest: proof.consentDigest } : {}),
    }
  }
}

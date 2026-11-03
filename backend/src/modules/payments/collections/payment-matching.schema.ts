import { z } from 'zod'
import { codCollectionSummary } from './cod-collection.schema.js'

type MatchingFacts = z.output<typeof matchingProof>

const matchingId = z.string().regex(/^[a-f0-9]{24}$/)

const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const text = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) =>
    [...value].every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    ),
  )

const receiptLinkInput = z.strictObject({
  orderId: matchingId,
  attemptId: matchingId.optional(),
  reason: text,
  matchingEvidenceRef: text,
})

const collectionAllocationInput = z.strictObject({
  merchandisePoisha: money,
  correctionPoisha: money,
  unassignedPoisha: money,
  reason: text,
  matchingEvidenceRef: text,
})

const linkedReceipt = z.strictObject({
  linkedCollectionId: matchingId,
  matchingStatus: z.literal('linked'),
})

const collectionSummary = codCollectionSummary.extend({
  provider: z.enum(['sslcommerz', 'cod_manual']),
  sourceKind: z.enum(['sslcommerz', 'cod_manual']),
  revision: money,
})

const matchingProof = z.strictObject({
  operation: z.enum(['link', 'allocate']),
  targetId: matchingId,
  orderId: matchingId,
  attemptId: matchingId.optional(),
  amountPoisha: money.min(1),
  evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  matchingEvidenceRef: text,
  merchandisePoisha: money.optional(),
  correctionPoisha: money.optional(),
  unassignedPoisha: money.optional(),
  verifiedAt: z.iso.datetime({ offset: true }),
})

export type { MatchingFacts }
export {
  collectionAllocationInput,
  collectionSummary,
  linkedReceipt,
  matchingId,
  matchingProof,
  receiptLinkInput,
}

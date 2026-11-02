import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import { readProtectedFile } from '../../shared/protected-file.js'
import { refundOutcomeProof } from './refund-outcome.schema.js'

// Operator-owned registry binds immutable independent settlement artifacts; no HTTP proof authority.
export function protectedRefundEvidence(path: string) {
  return async (input: { refundId: string; attemptId: string }) => {
    assertOutsideTransaction()
    const registry = z
      .strictObject({
        version: z.literal(1),
        entries: z
          .array(
            z.strictObject({
              refundId: z.string().regex(/^[a-f0-9]{24}$/),
              attemptId: z.string().regex(/^[a-f0-9]{24}$/),
              artifactFile: z.string().min(1),
              evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
            }),
          )
          .max(10000),
      })
      .parse(JSON.parse((await readProtectedFile(path, 2_000_000)).toString('utf8')))
    if (
      new Set(registry.entries.map((e) => `${e.refundId}:${e.attemptId}`)).size !==
      registry.entries.length
    )
      throw new Error('Ambiguous proof')
    const entry = registry.entries.find(
      (e) => e.refundId === input.refundId && e.attemptId === input.attemptId,
    )
    if (!entry) return undefined
    const bytes = await readProtectedFile(resolve(dirname(path), entry.artifactFile), 1000000)
    if (createHash('sha256').update(bytes).digest('hex') !== entry.evidenceDigest)
      throw new Error('Proof digest mismatch')
    const raw = JSON.parse(bytes.toString('utf8'))
    const timestamp = z.iso.datetime({ offset: true })
    const proof = refundOutcomeProof.parse({
      ...raw,
      evidenceDigest: entry.evidenceDigest,
      checkedAt: new Date(timestamp.parse(raw.checkedAt)),
      ...(raw.paidAt ? { paidAt: new Date(timestamp.parse(raw.paidAt)) } : {}),
      ...(raw.consentAt ? { consentAt: new Date(timestamp.parse(raw.consentAt)) } : {}),
    })
    if (proof.refundId !== input.refundId || proof.attemptId !== input.attemptId)
      throw new Error('Proof identity mismatch')
    return proof
  }
}

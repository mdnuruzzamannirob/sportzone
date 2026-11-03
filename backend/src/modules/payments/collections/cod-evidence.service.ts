import { readProtectedFile } from '../../../shared/protected-file.js'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { codCollectionInput, codCollectionProof } from './cod-collection.schema.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { assertOutsideTransaction } from '../../../shared/database/transaction.js'

const date = z.iso.datetime({ offset: true })

const receipt = codCollectionProof.omit({ collectedAt: true }).extend({
  collectedAt: date,
  verifiedAt: date,
  verifiedBy: z.string().trim().min(1).max(120),
  artifactPath: z.string().min(1).max(4096).refine(isAbsolute),
})

const source = z.strictObject({ version: z.literal(1), receipts: z.array(receipt).max(1000) })

// This verifies integrity/binding of an operator's original receipt, not whether an invented
// document represents actual cash. No default receipt, approval, account or amount is supplied.
function protectedCodCollectionEvidence(path: string, clock: () => Date = () => new Date()) {
  return async (
    raw: z.output<typeof codCollectionInput> & {
      paymentId: string
    },
  ) => {
    assertOutsideTransaction()
    const input = codCollectionInput
      .extend({ paymentId: codCollectionProof.shape.paymentId })
      .parse(raw)
    try {
      const records = source.parse(
        JSON.parse((await readProtectedFile(path, 1000000)).toString('utf8')),
      )
      const references = records.receipts.map((row) => row.collectionReference)
      const evidenceRefs = records.receipts.map((row) => row.evidenceRef)
      if (
        new Set(references).size !== references.length ||
        new Set(evidenceRefs).size !== evidenceRefs.length
      )
        throw new Error('Ambiguous receipt source')
      const row = records.receipts.find(
        (row) => row.collectionReference === input.collectionReference,
      )
      if (!row) throw new ApiError('BUSINESS_RULE_VIOLATION')
      if (
        row.paymentId !== input.paymentId ||
        row.amountPoisha !== input.amountPoisha ||
        row.evidenceRef !== input.evidenceRef
      )
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      const now = clock().getTime()
      if (
        !Number.isFinite(now) ||
        Date.parse(row.verifiedAt) > now ||
        Date.parse(row.collectedAt) > Date.parse(row.verifiedAt)
      )
        throw new Error('Invalid receipt time')
      const bytes = await readProtectedFile(row.artifactPath, 10000000)
      if (createHash('sha256').update(bytes).digest('hex') !== row.digest)
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      return codCollectionProof.parse({
        paymentId: row.paymentId,
        amountPoisha: row.amountPoisha,
        collectionReference: row.collectionReference,
        evidenceRef: row.evidenceRef,
        collectedAt: new Date(row.collectedAt),
        digest: row.digest,
      })
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
}

export { protectedCodCollectionEvidence }

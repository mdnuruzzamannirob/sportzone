import { z } from 'zod'
import { lifecycleText } from '../../orders/order-lifecycle.schema.js'

const id = z.string().regex(/^[a-f0-9]{24}$/),
  money = z.int().positive().max(Number.MAX_SAFE_INTEGER)

const codCollectionInput = z.strictObject({
  amountPoisha: money,
  collectionReference: lifecycleText.max(128),
  evidenceRef: lifecycleText,
  reason: lifecycleText,
})

const codCollectionProof = z.strictObject({
  paymentId: id,
  amountPoisha: money,
  collectionReference: lifecycleText.max(128),
  evidenceRef: lifecycleText,
  collectedAt: z.date(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
})

const codCollectionSummary = z.strictObject({
  id,
  paymentId: id,
  orderId: id,
  provider: z.literal('cod_manual'),
  sourceKind: z.literal('cod_manual'),
  merchandiseAllocatedPoisha: z.int().nonnegative(),
  correctionAllocatedPoisha: z.int().nonnegative(),
  unassignedAllocatedPoisha: z.int().nonnegative(),
  merchandiseRefundHeldPoisha: z.int().nonnegative(),
  merchandiseRefundCompletedPoisha: z.int().nonnegative(),
  correctionRefundHeldPoisha: z.int().nonnegative(),
  correctionRefundCompletedPoisha: z.int().nonnegative(),
  amountPoisha: money,
  currency: z.literal('BDT'),
  collectedAt: z.iso.datetime(),
})

export { codCollectionInput, codCollectionProof, codCollectionSummary }

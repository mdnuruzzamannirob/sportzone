import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { paymentStates } from './payment.model.js'
export const monitorId = z.string().regex(/^[a-f0-9]{24}$/)
export const paymentMonitorQuery = paginationSchema.safeExtend({
  attemptId: monitorId.optional(),
  collectionId: monitorId.optional(),
  orderId: monitorId.optional(),
  paymentStatus: z.enum(paymentStates).optional(),
  riskStatus: z.enum(['clear', 'review', 'rejected']).optional(),
  method: z.enum(['online', 'cod']).optional(),
  view: z.enum(['payments', 'unmatched', 'quarantined']).default('payments'),
})
export const paymentMonitorPage = paginationSchema
export const paymentReconcileInput = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
})
export const paymentReconcileResult = z.strictObject({ state: z.literal('pending') })
const money = z.int().nonnegative(),
  date = z.iso.datetime(),
  id = monitorId
const meta = z.strictObject({
  page: z.int().positive(),
  pageSize: z.int().positive(),
  totalItems: z.int().nonnegative(),
  totalPages: z.int().nonnegative(),
})
export const paymentMonitorSummary = z.strictObject({
  id,
  orderId: id,
  method: z.enum(['online', 'cod']),
  paymentStatus: z.enum(paymentStates),
  riskStatus: z.enum(['clear', 'review', 'rejected']),
  expectedPoisha: money,
  verifiedCollectedPoisha: money,
  merchandiseFundedPoisha: money,
  correctionCollectedPoisha: money,
  unassignedCollectedPoisha: money,
  currency: z.literal('BDT'),
  revision: money,
})
const receipt = z.strictObject({
  id,
  amountPoisha: money,
  currency: z.literal('BDT'),
  matchingStatus: z.enum(['linked', 'unmatched', 'quarantined']),
  collectedAt: date,
  verifiedAt: date,
  linkedCollectionId: id.optional(),
})
export const paymentMonitorList = z.strictObject({
  items: z.array(paymentMonitorSummary),
  intake: z.array(receipt),
  pagination: meta,
})
export const paymentMonitorDetail = z.strictObject({
  payment: paymentMonitorSummary,
  attempts: z.array(
    z.strictObject({
      id,
      state: z.string(),
      amountDisposition: z.string(),
      expectedAmountPoisha: money,
      lastCheckedAt: date.optional(),
      expiresAt: date.optional(),
    }),
  ),
  collections: z.array(
    z.strictObject({
      id,
      attemptId: id.optional(),
      intakeId: id.optional(),
      amountPoisha: money,
      merchandiseAllocatedPoisha: money,
      correctionAllocatedPoisha: money,
      unassignedAllocatedPoisha: money,
      collectedAt: date,
    }),
  ),
  corrections: z.array(
    z.strictObject({
      id,
      sourceCollectionId: id,
      amountPoisha: money,
      status: z.string(),
      capacityStatus: z.string(),
    }),
  ),
  audit: z.array(
    z.strictObject({ id, action: z.string(), occurredAt: date, actorType: z.string() }),
  ),
  pagination: z.strictObject({ attempts: meta, collections: meta, corrections: meta, audit: meta }),
})

import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
const id = z.string().regex(/^[a-f0-9]{24}$/),
  money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const refundStatus = z.enum([
  'requested',
  'under_review',
  'approved',
  'processing',
  'completed',
  'failed',
  'rejected',
])
export const refundClassification = z.enum(['merchandise', 'payment_correction'])
export const refundMethod = z.enum([
  'gateway',
  'manual_bkash',
  'manual_nagad',
  'manual_rocket',
  'manual_bank',
])
export const refundHistoryQuery = paginationSchema.safeExtend({
  status: refundStatus.optional(),
  classification: refundClassification.optional(),
})
export const refundAdminQuery = refundHistoryQuery.safeExtend({ sourceCollectionId: id.optional() })
const timing = z.strictObject({
  status: z.enum(['awaiting_approval', 'under_review', 'calculated']),
  targetBusinessDays: z.int().min(1).max(7),
  timezone: z.literal('Asia/Dhaka'),
  policyVersion: z.string().optional(),
  calendarVersion: z.string().optional(),
  targetAt: z.iso.datetime().optional(),
})
export const refundHistoryView = z.strictObject({
  id,
  orderId: id,
  sourceCollectionId: id,
  refundGroupKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  classification: refundClassification,
  basis: z.enum([
    'physical_return',
    'shortage',
    'cancellation',
    'delivery_exception',
    'payment_correction',
  ]),
  amountPoisha: money,
  method: refundMethod.optional(),
  status: refundStatus,
  capacityStatus: z.enum(['not_reserved', 'reserved', 'completed', 'released']),
  investigationStatus: z.enum(['under_review', 'none']),
  requestedAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  items: z.array(z.strictObject({ orderItemId: id, amountPoisha: money })).max(50),
  timing,
  timeline: z.array(z.strictObject({ status: refundStatus, at: z.iso.datetime() })).max(40),
})
const summary = z.strictObject({ heldPoisha: money, completedPoisha: money })
export const refundOrderHistory = z.strictObject({
  refunds: z.array(refundHistoryView),
  merchandiseSummary: summary,
  correctionSummary: summary,
})
export const refundAdminView = refundHistoryView.omit({ investigationStatus: true }).extend({
  basisRefId: id.optional(),
  merchandiseAmountPoisha: money,
  deliveryAmountPoisha: money,
  correctionAmountPoisha: money,
  policyVersion: z.string().optional(),
})
export const refundAttemptState = z.enum([
  'created',
  'submitted',
  'uncertain',
  'confirmed',
  'failed',
])
const capacity = z.strictObject({
  allocatedPoisha: money,
  heldPoisha: money,
  completedPoisha: money,
})
export const refundAdminDetail = refundAdminView.extend({
  sourceCapacity: capacity,
  orderCapacity: capacity,
  attempts: z
    .array(
      z.strictObject({
        id,
        attemptNumber: z.int().positive(),
        provider: z.enum(['sslcommerz', 'manual']),
        state: refundAttemptState,
        amountPoisha: money,
        initiatedAt: z.iso.datetime(),
        failureCode: z.string().optional(),
        refundTransId: z.string().optional(),
        refundRefId: z.string().optional(),
        lastCheckedAt: z.iso.datetime().optional(),
      }),
    )
    .max(50),
})
export const refundGroupView = z.strictObject({
  refundGroupKey: z.string().regex(/^[a-f0-9]{64}$/),
  refunds: z.array(refundAdminDetail),
  status: refundStatus,
})
export const refundReasonInput = z.strictObject({ reason: z.string().trim().min(1).max(2000) })
// Preserve the established normalized key order: audit idempotency digests use JSON.stringify.
export const refundReviewInput = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  reason: refundReasonInput.shape.reason,
  method: refundMethod.optional(),
  consentEvidenceRef: z.string().min(1).max(256).optional(),
})
export const refundPayoutInput = z.strictObject({
  method: refundMethod,
  reason: refundReasonInput.shape.reason,
})
export const refundPayoutView = z.strictObject({ attemptId: id, state: refundAttemptState })
export const refundReconcileView = z.strictObject({
  status: refundStatus,
  attemptState: refundAttemptState,
  attemptId: id,
})
const manualText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
export const refundManualInput = z.strictObject({
  transferReference: manualText,
  evidenceRef: manualText,
  reason: manualText,
})

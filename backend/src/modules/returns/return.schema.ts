import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'

const claimId = z.string().regex(/^[a-f0-9]{24}$/)

const claimText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))

const claimCommand = z.strictObject({
  claimId,
  orderId: claimId,
  claimType: z.enum(['physical_return', 'shortage']),
  description: claimText.optional(),
  items: z
    .array(
      z.strictObject({
        orderItemId: claimId,
        quantity: z.int().min(1).max(50),
        reason: claimText,
        evidenceAssetIds: z
          .array(claimId)
          .max(5)
          .refine((ids) => new Set(ids).size === ids.length)
          .optional(),
      }),
    )
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.orderItemId)).size === items.length),
})

const claimAuthority = z.strictObject({
  requestedBy: z.strictObject({
    type: z.enum(['customer', 'guest']),
    id: claimId,
  }),
  eligibilitySnapshot: z.strictObject({
    policyVersion: z.string().min(1).max(100),
    deliveredAt: z.date().optional(),
    requestDeadlineAt: z.date().optional(),
    exceptionBasis: claimText.optional(),
  }),
})

const claimStatus = z.enum([
  'requested',
  'under_review',
  'approved',
  'awaiting_return',
  'received',
  'inspected',
  'completed',
  'rejected',
])

const claimHistoryQuery = paginationSchema.safeExtend({
  claimType: claimCommand.shape.claimType.optional(),
  status: claimStatus.optional(),
})

const quantity = z.int().min(0).max(50)

const claimHistoryView = z.strictObject({
  id: claimId,
  orderId: claimId,
  claimType: claimCommand.shape.claimType,
  status: claimStatus,
  requestedAt: z.iso.datetime(),
  description: claimText.optional(),
  items: z
    .array(
      z.strictObject({
        orderItemId: claimId,
        requestedQty: quantity,
        approvedQty: quantity.optional(),
        reason: claimText,
        receivedQty: quantity,
        inspectedQty: quantity,
        acceptedQty: quantity,
        resellableQty: quantity,
      }),
    )
    .max(50),
  evidence: z
    .array(
      z.strictObject({
        assetId: claimId,
        orderItemId: claimId,
        mimeType: z.string(),
        size: z.int().positive(),
      }),
    )
    .max(250),
})

const claimAdminView = claimHistoryView.extend({
  eligibility: z.strictObject({
    policyVersion: z.string(),
    deliveredAt: z.iso.datetime().optional(),
    requestDeadlineAt: z.iso.datetime().optional(),
  }),
})

const claimEligibilityView = z.strictObject({
  items: z
    .array(z.strictObject({ orderItemId: claimId, quantity, claimableQty: quantity }))
    .max(50),
  eligibleTypes: z.array(claimCommand.shape.claimType).max(2),
  policyVersion: z.string().optional(),
  requestDeadlineAt: z.iso.datetime().optional(),
  reasons: z
    .array(z.strictObject({ claimType: claimCommand.shape.claimType, code: z.string() }))
    .max(2),
})

const claimReviewInput = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    approvedItems: z
      .array(z.strictObject({ orderItemId: claimId, quantity }))
      .min(1)
      .max(50)
      .refine((items) => new Set(items.map((item) => item.orderItemId)).size === items.length)
      .optional(),
    reason: claimText,
  })
  .refine((input) => (input.decision === 'approve') === Boolean(input.approvedItems))

const claimReceiptInput = z.strictObject({
  receivedItems: z
    .array(z.strictObject({ orderItemId: claimId, quantity }))
    .min(1)
    .max(50),
  receiptReference: claimText,
  notes: claimText.optional(),
})

const claimInspectionInput = z.strictObject({
  items: z
    .array(
      z.strictObject({
        orderItemId: claimId,
        acceptedQty: quantity,
        resellableQty: quantity,
        reason: claimText,
      }),
    )
    .min(1)
    .max(50),
  notes: claimText.optional(),
})

const claimCompleteInput = z.strictObject({ reason: claimText.optional() })

const claimUploadInput = z.strictObject({
  claimType: claimCommand.shape.claimType,
  orderItemIds: z
    .array(claimId)
    .min(1)
    .max(40)
    .refine((ids) => new Set(ids).size === ids.length),
})

const claimUploadResult = z.strictObject({
  assetId: claimId,
  orderId: claimId,
  status: z.literal('private'),
  expiresAt: z.iso.datetime().optional(),
})

const claimPrivateUrl = z.strictObject({ url: z.url() })

export {
  claimAdminView,
  claimAuthority,
  claimCommand,
  claimCompleteInput,
  claimEligibilityView,
  claimHistoryQuery,
  claimHistoryView,
  claimId,
  claimInspectionInput,
  claimPrivateUrl,
  claimReceiptInput,
  claimReviewInput,
  claimStatus,
  claimText,
  claimUploadInput,
  claimUploadResult,
}

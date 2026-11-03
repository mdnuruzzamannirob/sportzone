import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { singleLineText as lifecycleText, resourceId as orderId } from '../../shared/validation.js'

const cancellationInput = z.strictObject({ reason: lifecycleText })

const cancellationDecision = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  reason: lifecycleText,
  dispatchNotStartedConfirmed: z.boolean().optional(),
})

const cancellationView = z.strictObject({
  id: orderId,
  orderId,
  status: z.enum(['requested', 'approved', 'rejected']),
  reason: lifecycleText,
  requestedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().optional(),
})

const cancellationQuery = paginationSchema.safeExtend({
  status: cancellationView.shape.status.optional(),
})

export { cancellationDecision, cancellationInput, cancellationQuery, cancellationView }

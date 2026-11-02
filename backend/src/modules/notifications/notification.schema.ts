import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { ConfigurationError } from '../../shared/errors/configuration-error.js'

const policy = z
  .strictObject({
    maxAttempts: z.int().min(1).max(10),
    baseDelayMs: z.int().min(100).max(3600000),
    maxDelayMs: z.int().min(100).max(86400000),
    claimTtlMs: z.int().min(1000).max(3600000),
    batchSize: z.int().min(1).max(100),
  })
  .refine((value) => value.maxDelayMs >= value.baseDelayMs)
export type RetryPolicy = z.infer<typeof policy>
export function validateRetryPolicy(input: RetryPolicy) {
  const result = policy.safeParse(input)
  if (!result.success) throw new ConfigurationError(['notification_retry_policy'])
  return Object.freeze(result.data)
}

export const notificationStatus = z.enum([
  'queued',
  'sending',
  'sent',
  'retry_wait',
  'failed',
  'delivery_uncertain',
])
export const notificationEvent = z.enum([
  'registration',
  'password_reset',
  'email_verification',
  'email_change',
  'guest_order_access',
  'order_received',
  'order_confirmation',
  'order_cancellation',
  'shipment_update',
  'delivery_completion',
  'payment_success',
  'payment_failure',
  'payment_pending',
  'return_update',
  'refund_update',
])
export const notificationAdminQuery = paginationSchema.safeExtend({
  status: notificationStatus.optional(),
  eventType: notificationEvent.optional(),
})
export const notificationAdminView = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  eventType: notificationEvent,
  status: notificationStatus,
  attemptCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().optional(),
})
export const notificationRetryInput = z.strictObject({ reason: z.string().trim().min(1).max(2000) })
export const notificationRetryResult = z.strictObject({ status: notificationStatus })

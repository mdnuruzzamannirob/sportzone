import { z } from 'zod'
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

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { assertOutsideTransaction } from '../../db/transaction.js'
import { ConfigurationError } from '../../config/environment.js'
import {
  createResendAdapter,
  validateEmailOptions,
  type EmailAdapter,
} from './email.js'
import type { RegistrationNotifications } from './registration.js'

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
  if (!result.success)
    throw new ConfigurationError(['notification_retry_policy'])
  return Object.freeze(result.data)
}
export function loadNotificationWorker(environment: NodeJS.ProcessEnv) {
  const number = (name: string) =>
    /^[1-9]\d*$/.test(environment[name] ?? '') ? Number(environment[name]) : NaN
  if (
    environment.EMAIL_DELIVERY_ENABLED !== 'true' ||
    environment.EMAIL_PROVIDER !== 'resend'
  )
    throw new ConfigurationError(['email_activation'])
  const production = environment.APP_ENV === 'production'
  if (
    !['local', 'test', 'staging', 'production'].includes(
      environment.APP_ENV ?? '',
    ) ||
    environment.EMAIL_MODE !== (production ? 'live' : 'test')
  )
    throw new ConfigurationError(['EMAIL_MODE'])
  if (
    !production &&
    !z.email().safeParse(environment.EMAIL_TEST_RECIPIENT).success
  )
    throw new ConfigurationError(['EMAIL_TEST_RECIPIENT'])
  const email = validateEmailOptions({
    apiKey: environment.RESEND_API_KEY ?? '',
    from: environment.EMAIL_FROM ?? '',
    timeoutMs: number('EMAIL_TIMEOUT_MS'),
    ...(!production
      ? { recipientOverride: environment.EMAIL_TEST_RECIPIENT ?? '' }
      : {}),
  })
  const settings = validateRetryPolicy({
    maxAttempts: number('EMAIL_MAX_ATTEMPTS'),
    baseDelayMs: number('EMAIL_RETRY_BASE_MS'),
    maxDelayMs: number('EMAIL_RETRY_MAX_MS'),
    claimTtlMs: number('EMAIL_CLAIM_TTL_MS'),
    batchSize: number('EMAIL_BATCH_SIZE'),
  })
  if (settings.claimTtlMs <= email.timeoutMs + 1000)
    throw new ConfigurationError(['EMAIL_CLAIM_TTL_MS'])
  return { adapter: createResendAdapter(email), settings }
}
export function createNotificationWorker(
  store: RegistrationNotifications,
  adapter: EmailAdapter,
  input: RetryPolicy,
  clock: () => Date = () => new Date(),
) {
  const settings = validateRetryPolicy(input)
  return {
    async runBatch() {
      assertOutsideTransaction()
      const now = clock()
      if (!Number.isFinite(now.getTime()))
        throw new Error('Invalid notification clock.')
      await store.recover(now, settings.batchSize, settings.maxAttempts)
      let processed = 0
      for (; processed < settings.batchSize; processed++) {
        const claim = await store.claim(
          clock(),
          settings.claimTtlMs,
          settings.maxAttempts,
        )
        if (!claim) break
        if (!(await store.currentClaim(claim.id, claim.claimId, clock()))) {
          await store.recover(clock(), settings.batchSize, settings.maxAttempts)
          continue
        }
        const idempotencyKey = `sz-notification-${createHash('sha256').update(claim.eventKey).digest('hex')}`
        // Only this server-owned template is enabled. No proof, URL or arbitrary HTML from the outbox.
        const outcome = await adapter
          .send({
            to: claim.recipient,
            subject: 'Welcome to SportZone',
            text: 'Your SportZone account has been created. Email verification is a separate step.',
            idempotencyKey,
          })
          .catch(() => ({
            kind: 'uncertain' as const,
            code: 'PROVIDER_UNCERTAIN' as const,
          }))
        const delay = Math.min(
          settings.maxDelayMs,
          settings.baseDelayMs * 2 ** (claim.attemptCount - 1),
        )
        await store.finish(
          claim.id,
          claim.claimId,
          outcome,
          clock(),
          settings.maxAttempts,
          delay,
        )
      }
      return { processed }
    },
  }
}

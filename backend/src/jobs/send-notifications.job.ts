import { createHash } from 'node:crypto'
import { z } from 'zod'
import { assertOutsideTransaction } from '../shared/database/transaction.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
import type { EmailAdapter, EmailMessage } from '../modules/notifications/notification.types.js'
import type { ResetDelivery } from '../modules/auth/verification/proof-delivery.service.js'
import type { RegistrationNotifications } from '../modules/notifications/notification.service.js'

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
export function createNotificationWorker(
  store: RegistrationNotifications,
  adapter: EmailAdapter,
  input: RetryPolicy,
  clock: () => Date = () => new Date(),
  resetDelivery?: ResetDelivery,
  emailChangeDelivery?: ResetDelivery,
  adminResetDelivery?: ResetDelivery,
) {
  const settings = validateRetryPolicy(input)
  return {
    async runBatch() {
      assertOutsideTransaction()
      const now = clock()
      if (!Number.isFinite(now.getTime())) throw new Error('Invalid notification clock.')
      await (resetDelivery ?? emailChangeDelivery ?? adminResetDelivery)?.cleanup(
        settings.batchSize,
      )
      await store.recover(now, settings.batchSize, settings.maxAttempts)
      let processed = 0
      for (; processed < settings.batchSize; processed++) {
        const claim = await store.claim(
          clock(),
          settings.claimTtlMs,
          settings.maxAttempts,
          Boolean(resetDelivery),
          Boolean(emailChangeDelivery),
          Boolean(adminResetDelivery),
        )
        if (!claim) break
        if (!(await store.currentClaim(claim.id, claim.claimId, clock()))) {
          await store.recover(clock(), settings.batchSize, settings.maxAttempts)
          continue
        }
        const idempotencyKey = `sz-notification-${createHash('sha256').update(claim.eventKey).digest('hex')}`
        let message: Omit<EmailMessage, 'idempotencyKey'> | undefined
        try {
          message =
            claim.templateVersion === 'admin-password-reset-v1'
              ? await adminResetDelivery?.message(claim)
              : claim.eventType === 'email_change'
                ? await emailChangeDelivery?.message(claim)
                : claim.eventType === 'password_reset'
                  ? await resetDelivery?.message(claim)
                  : {
                      to: claim.recipient,
                      subject: 'Welcome to SportZone',
                      text: 'Your SportZone account has been created. Email verification is a separate step.',
                    }
        } catch {
          /* Missing/tampered/expired proof fails closed without a provider call. */
        }
        if (!message) {
          await store.finish(
            claim.id,
            claim.claimId,
            { kind: 'rejected', retryable: false, code: 'PROOF_UNAVAILABLE' },
            clock(),
            settings.maxAttempts,
            0,
          )
          continue
        }
        if (!(await store.currentClaim(claim.id, claim.claimId, clock()))) continue
        const outcome = await adapter.send({ ...message, idempotencyKey }).catch(() => ({
          kind: 'uncertain' as const,
          code: 'PROVIDER_UNCERTAIN' as const,
        }))
        const delay = Math.min(
          settings.maxDelayMs,
          settings.baseDelayMs * 2 ** (claim.attemptCount - 1),
        )
        await store.finish(claim.id, claim.claimId, outcome, clock(), settings.maxAttempts, delay)
      }
      return { processed }
    },
  }
}

import type { paymentMessageService } from './payment-message.service.js'
import type { GuestProofDelivery } from '../auth/guest-access/guest-proof-delivery.service.js'
import { createHash } from 'node:crypto'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import { validateRetryPolicy, type RetryPolicy } from './notification.schema.js'
import type { EmailAdapter, EmailMessage } from './notification.types.js'
import type { ResetDelivery } from '../auth/verification/proof-delivery.service.js'
import type { RegistrationNotifications } from './notification.service.js'

export function createNotificationDeliveryService(
  store: RegistrationNotifications,
  adapter: EmailAdapter,
  input: RetryPolicy,
  clock: () => Date = () => new Date(),
  resetDelivery?: ResetDelivery,
  emailChangeDelivery?: ResetDelivery,
  adminResetDelivery?: ResetDelivery,
  guestDelivery?: GuestProofDelivery,
  paymentDelivery?: ReturnType<typeof paymentMessageService>,
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
      await guestDelivery?.cleanup(settings.batchSize)
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
          Boolean(guestDelivery),
          Boolean(paymentDelivery),
        )
        if (!claim) break
        if (!(await store.currentClaim(claim.id, claim.claimId, clock()))) {
          await store.recover(clock(), settings.batchSize, settings.maxAttempts)
          continue
        }
        const idempotencyKey = `sz-notification-${createHash('sha256').update(claim.eventKey).digest('hex')}`
        let message: Omit<EmailMessage, 'idempotencyKey'> | undefined
        try {
          const userClaim = claim.userId ? { ...claim, userId: claim.userId } : undefined
          message = claim.eventType.startsWith('payment_')
            ? await paymentDelivery?.message(claim)
            : claim.eventType === 'guest_order_access'
              ? await guestDelivery?.message(claim)
              : !userClaim
                ? undefined
                : claim.templateVersion === 'admin-password-reset-v1'
                  ? await adminResetDelivery?.message(userClaim)
                  : claim.eventType === 'email_change'
                    ? await emailChangeDelivery?.message(userClaim)
                    : claim.eventType === 'password_reset'
                      ? await resetDelivery?.message(userClaim)
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

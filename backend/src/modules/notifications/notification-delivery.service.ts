import { createHash } from 'node:crypto'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import type { GuestProofDelivery, ResetDelivery } from '../auth/auth.public.js'
import { type RetryPolicy, validateRetryPolicy } from './notification.schema.js'
import type { NotificationService } from './notification.service.js'
import type { EmailAdapter, EmailMessage } from './notification.types.js'
import type {
  createOrderMessageService,
  createPaymentMessageService,
  createRefundMessageService,
  createReturnMessageService,
} from './notification-template.js'

function createNotificationDeliveryService(
  store: NotificationService,
  adapter: EmailAdapter,
  input: RetryPolicy,
  clock: () => Date = () => new Date(),
  resetDelivery?: ResetDelivery,
  emailChangeDelivery?: ResetDelivery,
  adminResetDelivery?: ResetDelivery,
  guestDelivery?: GuestProofDelivery,
  paymentDelivery?: ReturnType<typeof createPaymentMessageService>,
  commerceDelivery?: ReturnType<typeof createOrderMessageService>,
  returnDelivery?: ReturnType<typeof createReturnMessageService>,
  refundDelivery?: ReturnType<typeof createRefundMessageService>,
  emailVerificationDelivery?: ResetDelivery,
) {
  const settings = validateRetryPolicy(input)
  return {
    async runBatch() {
      assertOutsideTransaction()
      const now = clock()
      if (!Number.isFinite(now.getTime())) throw new Error('Invalid notification clock.')
      await (
        resetDelivery ??
        emailChangeDelivery ??
        adminResetDelivery ??
        emailVerificationDelivery
      )?.cleanup(settings.batchSize)
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
          Boolean(commerceDelivery),
          Boolean(returnDelivery),
          Boolean(refundDelivery),
          Boolean(emailVerificationDelivery),
        )
        if (!claim) break
        if (!(await store.currentClaim(claim.id, claim.claimId, clock()))) {
          await store.recover(clock(), settings.batchSize, settings.maxAttempts)
          continue
        }
        const idempotencyKey = `sz-notification-${createHash('sha256').update(claim.eventKey).digest('hex')}`
        let message: Omit<EmailMessage, 'idempotencyKey'> | undefined
        try {
          const userClaim = claim.userId
            ? {
                id: claim.id.toHexString(),
                userId: claim.userId.toHexString(),
                challengeId: claim.challengeId?.toHexString(),
                recipient: claim.recipient,
              }
            : undefined
          message = [
            'order_received',
            'order_confirmation',
            'order_cancellation',
            'shipment_update',
            'delivery_completion',
          ].includes(claim.eventType)
            ? await commerceDelivery?.message(claim)
            : claim.eventType === 'refund_update'
              ? await refundDelivery?.message(claim)
              : claim.eventType === 'return_update'
                ? await returnDelivery?.message(claim)
                : claim.eventType.startsWith('payment_')
                  ? await paymentDelivery?.message(claim)
                  : claim.eventType === 'guest_order_access'
                    ? await guestDelivery?.message({
                        id: claim.id.toHexString(),
                        orderId: claim.orderId?.toHexString(),
                        challengeId: claim.challengeId?.toHexString(),
                        recipient: claim.recipient,
                      })
                    : !userClaim
                      ? undefined
                      : claim.templateVersion === 'admin-password-reset-v1'
                        ? await adminResetDelivery?.message(userClaim)
                        : claim.eventType === 'email_verification'
                          ? await emailVerificationDelivery?.message(userClaim)
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

export { createNotificationDeliveryService }

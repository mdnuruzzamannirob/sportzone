import { z } from 'zod'
import { validateRetryPolicy } from '../modules/notifications/notification.schema.js'
import { validateEmailOptions } from '../providers/email/resend.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'

export function loadNotificationWorker(environment: NodeJS.ProcessEnv) {
  const number = (name: string) =>
    /^[1-9]\d*$/.test(environment[name] ?? '') ? Number(environment[name]) : NaN
  if (environment.EMAIL_DELIVERY_ENABLED !== 'true' || environment.EMAIL_PROVIDER !== 'resend')
    throw new ConfigurationError(['email_activation'])
  const production = environment.APP_ENV === 'production'
  if (
    !['local', 'test', 'staging', 'production'].includes(environment.APP_ENV ?? '') ||
    environment.EMAIL_MODE !== (production ? 'live' : 'test')
  )
    throw new ConfigurationError(['EMAIL_MODE'])
  if (!production && !z.email().safeParse(environment.EMAIL_TEST_RECIPIENT).success)
    throw new ConfigurationError(['EMAIL_TEST_RECIPIENT'])
  const email = validateEmailOptions({
    apiKey: environment.RESEND_API_KEY ?? '',
    from: environment.EMAIL_FROM ?? '',
    timeoutMs: number('EMAIL_TIMEOUT_MS'),
    ...(!production ? { recipientOverride: environment.EMAIL_TEST_RECIPIENT ?? '' } : {}),
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
  const paymentsEnabled = environment.PAYMENT_NOTIFICATIONS_ENABLED === 'true'
  if (
    (environment.PAYMENT_NOTIFICATIONS_ENABLED !== undefined &&
      !['true', 'false'].includes(environment.PAYMENT_NOTIFICATIONS_ENABLED)) ||
    (paymentsEnabled && !['local', 'test'].includes(environment.APP_ENV ?? ''))
  )
    throw new ConfigurationError(['payment_notification_activation'])
  const commerceEnabled = environment.ORDER_NOTIFICATIONS_ENABLED === 'true'
  if (
    (environment.ORDER_NOTIFICATIONS_ENABLED !== undefined &&
      !['true', 'false'].includes(environment.ORDER_NOTIFICATIONS_ENABLED)) ||
    (commerceEnabled && !['local', 'test'].includes(environment.APP_ENV ?? ''))
  )
    throw new ConfigurationError(['order_notification_activation'])
  return { email, settings, paymentsEnabled, commerceEnabled }
}

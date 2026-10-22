import { createResendAdapter } from './providers/email/resend.client.js'
import type { EmailAdapter } from './modules/notifications/notification.types.js'
import type { RetryPolicy } from './jobs/send-notifications.job.js'
import type { MediaDependencies } from './modules/media/media.composition.js'
import type { loadNotificationWorker } from './config/notifications.js'
import type { Connection } from 'mongoose'
import { createApp } from './app.js'
import type { RuntimeConfig } from './config/env.js'
import { createAuthRuntime, composeProofDeliveries } from './modules/auth/auth.service.js'
import type { HealthDependencies } from './modules/health/health.service.js'
import { createRegistrationNotifications } from './modules/notifications/notification.service.js'
import { createNotificationWorker } from './jobs/send-notifications.job.js'
import type { Logger } from './shared/logger.js'
import { createApiRouter } from './routes.js'
import { createAddressCoverage } from './modules/delivery/delivery-coverage.service.js'
import { createProfileService } from './modules/customers/customer.service.js'
import { profileRoutes } from './modules/customers/customer.routes.js'
import { composeMediaService } from './modules/media/media.composition.js'
import { mediaRoutes } from './modules/media/media.routes.js'
import { verifyMediaPersistence } from './modules/media/media.service.js'

// Only the root composition coordinates independent domain routers and capabilities.
export async function composeIdentityRoutes(
  connection: Connection,
  config: RuntimeConfig,
  media?: MediaDependencies,
) {
  const notifications = createRegistrationNotifications(connection)
  const auth = await createAuthRuntime(connection, config, notifications)
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      profileRoutes(
        createProfileService(auth.customerAccounts, createAddressCoverage(connection)),
        auth.security,
        auth.sessions,
      ),
    )
  if (media) {
    if (!config.ADMIN_AUTH_ENABLED) throw new Error('Admin authentication required for media.')
    await verifyMediaPersistence(connection)
    auth.router.use(
      mediaRoutes(
        composeMediaService(connection, auth.mediaAdmin, media),
        auth.security,
        auth.sessions,
        media.policy.maxBytes,
        auth.throttle.middleware('admin', 'media'),
      ),
    )
  }
  return auth.router
}

export async function composeApplication(
  connection: Connection,
  config: RuntimeConfig,
  health: HealthDependencies,
  logger: Logger,
  media?: MediaDependencies,
) {
  const identity =
    config.CUSTOMER_AUTH_ENABLED || config.ADMIN_AUTH_ENABLED
      ? await composeIdentityRoutes(connection, config, media)
      : undefined
  const apiRouter = createApiRouter(health, identity ? [identity] : [])
  if (media && !config.ADMIN_AUTH_ENABLED)
    throw new Error('Admin authentication required for media.')
  return createApp({ logger, apiRouter, mediaUploadsEnabled: Boolean(media) })
}

export async function composeNotificationWorker(
  connection: Connection,
  config: RuntimeConfig,
  options:
    | ReturnType<typeof loadNotificationWorker>
    | { adapter: EmailAdapter; settings: RetryPolicy },
) {
  const { settings } = options
  const adapter = 'adapter' in options ? options.adapter : createResendAdapter(options.email)
  const store = createRegistrationNotifications(connection)
  await store.verifyIndexes()
  const delivery = composeProofDeliveries(connection, config.identity)
  return createNotificationWorker(
    store,
    adapter,
    settings,
    undefined,
    delivery.reset,
    delivery.emailChange,
    delivery.adminReset,
  )
}

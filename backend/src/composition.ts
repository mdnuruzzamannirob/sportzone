import type { MediaDependencies } from './modules/media/media.composition.js'
import type { loadNotificationWorker } from './config/notifications.js'
import type { Connection } from 'mongoose'
import { createApp } from './app.js'
import type { RuntimeConfig } from './config/environment.js'
import {
  composeCustomerRoutes,
  composeProofDeliveries,
} from './modules/auth/auth.composition.js'
import type { HealthDependencies } from './modules/health/health.service.js'
import { createRegistrationNotifications } from './modules/notifications/notification.service.js'
import {
  createNotificationWorker,
} from './modules/notifications/notification-worker.service.js'
import type { Logger } from './observability/logger.js'
import { createApiRouter } from './routes/index.js'

export async function composeApplication(
  connection: Connection,
  config: RuntimeConfig,
  health: HealthDependencies,
  logger: Logger,
  media?: MediaDependencies,
) {
  const apiRouter = createApiRouter(health)
  if (config.CUSTOMER_AUTH_ENABLED || config.ADMIN_AUTH_ENABLED)
    apiRouter.use(await composeCustomerRoutes(connection, config, media))
  if (media && !config.ADMIN_AUTH_ENABLED)
    throw new Error('Admin authentication required for media.')
  return createApp({ logger, apiRouter, mediaUploadsEnabled: Boolean(media) })
}

export async function composeNotificationWorker(
  connection: Connection,
  config: RuntimeConfig,
  { adapter, settings }: ReturnType<typeof loadNotificationWorker>,
) {
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

import type { Connection } from 'mongoose'
import { createApp } from './app.js'
import type { RuntimeConfig } from './config/environment.js'
import {
  composeCustomerRoutes,
  composeProofDeliveries,
} from './modules/auth/composition.js'
import type { HealthDependencies } from './modules/health/service.js'
import { createRegistrationNotifications } from './modules/notifications/registration.js'
import {
  createNotificationWorker,
  type loadNotificationWorker,
} from './modules/notifications/worker.js'
import type { Logger } from './observability/logger.js'
import { createApiRouter } from './routes/index.js'

export async function composeApplication(
  connection: Connection,
  config: RuntimeConfig,
  health: HealthDependencies,
  logger: Logger,
) {
  const apiRouter = createApiRouter(health)
  if (config.CUSTOMER_AUTH_ENABLED || config.ADMIN_AUTH_ENABLED)
    apiRouter.use(await composeCustomerRoutes(connection, config))
  return createApp({ logger, apiRouter })
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

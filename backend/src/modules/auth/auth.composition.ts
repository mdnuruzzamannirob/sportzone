import { Router } from 'express'
import type { Connection } from 'mongoose'
import type { IdentityConfig, RuntimeConfig } from '../../config/env.js'
import type { RegistrationNotifications } from '../notifications/notification.service.js'
import { createIdentityModels } from './auth.model.js'
import { adminRoutes } from './credentials/admin-auth.routes.js'
import { createCustomerService } from './credentials/credentials.service.js'
import { customerRoutes } from './credentials/customer-auth.routes.js'
import { createCustomerAccountAccess } from './customer-account.service.js'
import { verifyIdentityPersistence } from './identity.persistence.js'
import { createMediaAdminAccess } from './media-access.service.js'
import { recoveryRoutes } from './recovery/password-recovery.routes.js'
import { createRecoveryService } from './recovery/password-recovery.service.js'
import { createAuthQuotaStore } from './sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from './sessions/auth-throttle.service.js'
import { browserSecurityRoutes } from './sessions/browser-security.routes.js'
import { createBrowserSecurity } from './sessions/browser-security.service.js'
import { createSessionService } from './sessions/session.service.js'
import { emailChangeRoutes } from './verification/email-change.routes.js'
import { createEmailChangeService } from './verification/email-change.service.js'
import {
  createAdminResetDelivery,
  createEmailChangeDelivery,
  createResetDelivery,
} from './verification/proof-delivery.service.js'

export async function createAuthRuntime(
  connection: Connection,
  config: RuntimeConfig,
  notifications: RegistrationNotifications,
) {
  const models = createIdentityModels(connection)
  await verifyIdentityPersistence(connection, models)
  await notifications.verifyIndexes()
  const options = config.identity
  if (!options) throw new Error('Validated identity configuration required.')
  const sessions = createSessionService(connection, models, options.sessions)
  const security = createBrowserSecurity(
    connection,
    models,
    sessions,
    options.browser,
  )
  const quota = createAuthQuotaStore(connection)
  await quota.verify()
  const throttle = createAuthThrottle(quota, config.SESSION_SECRET)
  const router = Router()
  // Separate bootstrap adapters select their audience from the registered route.
  router.use(
    browserSecurityRoutes(security, sessions, undefined, (req, res, next) =>
      throttle.middleware(
        req.path.startsWith('/admin/') ? 'admin' : 'customer',
        'bootstrap',
      )(req, res, next),
    ),
  )
  if (config.CUSTOMER_AUTH_ENABLED)
    router.use(
      customerRoutes(
        createCustomerService(models, sessions, security, notifications),
        security,
        sessions,
        throttle.middleware('customer', 'credentials'),
      ),
    )
  if (options.recovery)
    router.use(
      recoveryRoutes(
        createRecoveryService(
          connection,
          models,
          sessions,
          security,
          notifications,
          options.recovery,
        ),
        security,
        sessions,
        throttle.middleware('customer', 'recovery'),
      ),
    )
  if (options.emailChange)
    router.use(
      emailChangeRoutes(
        createEmailChangeService(
          connection,
          models,
          sessions,
          notifications,
          options.emailChange,
        ),
        security,
        sessions,
        throttle.middleware('customer', 'email'),
      ),
    )
  if (options.adminRecovery)
    router.use(
      adminRoutes(
        createCustomerService(
          models,
          sessions,
          security,
          notifications,
          'admin',
        ),
        createRecoveryService(
          connection,
          models,
          sessions,
          security,
          notifications,
          options.adminRecovery,
          undefined,
          'admin',
        ),
        security,
        sessions,
        (req, res, next) =>
          throttle.middleware(
            'admin',
            req.path.includes('/password-resets') ? 'recovery' : 'credentials',
          )(req, res, next),
      ),
    )
  return {
    router,
    sessions,
    security,
    throttle,
    customerAccounts: createCustomerAccountAccess(connection, models, sessions),
    mediaAdmin: createMediaAdminAccess(models, sessions),
  }
}

// Keep private model construction inside auth; callers receive narrow delivery capabilities.
export function composeProofDeliveries(
  connection: Connection,
  options: IdentityConfig | undefined,
) {
  const models = createIdentityModels(connection)
  return {
    reset: options?.recovery
      ? createResetDelivery(models, options.recovery)
      : undefined,
    emailChange: options?.emailChange
      ? createEmailChangeDelivery(models, options.emailChange)
      : undefined,
    adminReset: options?.adminRecovery
      ? createAdminResetDelivery(models, options.adminRecovery)
      : undefined,
  }
}

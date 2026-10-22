import { createMediaAdminAccess } from './media-access.service.js'
import { composeMediaService, type MediaDependencies } from '../media/media.composition.js'
import { mediaRoutes } from '../media/media.routes.js'
import { verifyMediaPersistence } from '../media/media.service.js'
import { createCustomerAccountAccess } from './customer-account.service.js'
import {
  createAdminResetDelivery,
  createEmailChangeDelivery,
  createResetDelivery,
} from './proof-delivery.service.js'
import { createAuthQuotaStore } from './auth-throttle.persistence.js'
import { createAuthThrottle } from './auth-throttle.service.js'
import { adminRoutes } from './admin-auth.routes.js'
import { createEmailChangeService } from './email-change.service.js'
import { emailChangeRoutes } from './email-change.routes.js'
import { createRecoveryService } from './password-recovery.service.js'
import { recoveryRoutes } from './password-recovery.routes.js'
import { Router } from 'express'
import { createAddressCoverage } from '../delivery/delivery-coverage.service.js'
import { createProfileService } from '../customers/customer.service.js'
import { profileRoutes } from '../customers/customer.routes.js'
import type { Connection } from 'mongoose'
import type { IdentityConfig, RuntimeConfig } from '../../config/environment.js'
import { createRegistrationNotifications } from '../notifications/notification.service.js'
import { browserSecurityRoutes } from './browser-security.routes.js'
import { createBrowserSecurity } from './browser-security.service.js'
import { verifyIdentityPersistence } from './identity.persistence.js'
import { customerRoutes } from './customer-auth.routes.js'
import { createCustomerService } from './credentials.service.js'
import { createIdentityModels } from './auth.model.js'
import { createSessionService } from './session.service.js'

export async function composeCustomerRoutes(
  connection: Connection,
  config: RuntimeConfig,
  media?: MediaDependencies,
) {
  const models = createIdentityModels(connection)
  await verifyIdentityPersistence(connection, models)
  const notifications = createRegistrationNotifications(connection)
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
  if (config.CUSTOMER_AUTH_ENABLED)
    router.use(
      profileRoutes(
        createProfileService(
          createCustomerAccountAccess(connection, models, sessions),
          createAddressCoverage(connection),
        ),
        security,
        sessions,
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
  if (media) {
    if (!config.ADMIN_AUTH_ENABLED) throw new Error('Admin authentication required for media.')
    await verifyMediaPersistence(connection)
    router.use(
      mediaRoutes(
        composeMediaService(
          connection,
          createMediaAdminAccess(models, sessions),
          media,
        ),
        security,
        sessions,
        media.policy.maxBytes,
        throttle.middleware('admin', 'media'),
      ),
    )
  }
  return router
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

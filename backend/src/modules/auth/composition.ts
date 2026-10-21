import { createAuthQuotaStore } from './rate-limit-store.js'
import { createAuthThrottle } from './rate-limit.js'
import { loadAdminRecoveryOptions } from '../../config/recovery.js'
import { adminRoutes } from './admin-routes.js'
import { loadEmailChangeOptions } from '../../config/recovery.js'
import { createEmailChangeService } from './email-change.js'
import { emailChangeRoutes } from './email-change-routes.js'
import { createRecoveryService, loadRecoveryOptions } from './recovery.js'
import { recoveryRoutes } from './recovery-routes.js'
import { Router } from 'express'
import { createAddressCoverage } from '../settings/coverage.js'
import { createProfileService } from './profile.js'
import { profileRoutes } from './profile-routes.js'
import type { Connection } from 'mongoose'
import type { RuntimeConfig } from '../../config/environment.js'
import { createRegistrationNotifications } from '../notifications/registration.js'
import { browserSecurityRoutes } from './browser-routes.js'
import {
  createBrowserSecurity,
  loadBrowserSecurityOptions,
} from './browser-security.js'
import { verifyIdentityPersistence } from './collection-validators.js'
import { customerRoutes } from './customer-routes.js'
import { createCustomerService } from './customer.js'
import { createIdentityModels } from './models.js'
import { createSessionService, loadSessionOptions } from './sessions.js'

export async function composeCustomerRoutes(
  connection: Connection,
  config: RuntimeConfig,
) {
  const models = createIdentityModels(connection)
  await verifyIdentityPersistence(connection, models)
  const notifications = createRegistrationNotifications(connection)
  await notifications.verifyIndexes()
  const environment = {
    ...config,
    CUSTOMER_AUTH_ENABLED: String(config.CUSTOMER_AUTH_ENABLED),
    ADMIN_AUTH_ENABLED: String(config.ADMIN_AUTH_ENABLED),
    PASSWORD_RECOVERY_ENABLED: String(config.PASSWORD_RECOVERY_ENABLED),
    EMAIL_CHANGE_ENABLED: String(config.EMAIL_CHANGE_ENABLED),
    PORT: String(config.PORT),
    CORS_ALLOWED_ORIGINS: config.CORS_ALLOWED_ORIGINS.join(','),
  }
  const sessions = createSessionService(
    connection,
    models,
    loadSessionOptions(environment),
  )
  const security = createBrowserSecurity(
    connection,
    models,
    sessions,
    loadBrowserSecurityOptions(environment, sessions.cookiePolicy.secure),
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
  if (config.PASSWORD_RECOVERY_ENABLED)
    router.use(
      recoveryRoutes(
        createRecoveryService(
          connection,
          models,
          sessions,
          security,
          notifications,
          loadRecoveryOptions(environment),
        ),
        security,
        sessions,
        throttle.middleware('customer', 'recovery'),
      ),
    )
  if (config.EMAIL_CHANGE_ENABLED)
    router.use(
      emailChangeRoutes(
        createEmailChangeService(
          connection,
          models,
          sessions,
          notifications,
          loadEmailChangeOptions(environment),
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
          connection,
          models,
          sessions,
          createAddressCoverage(connection),
        ),
        security,
        sessions,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
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
          loadAdminRecoveryOptions(environment),
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
  return router
}

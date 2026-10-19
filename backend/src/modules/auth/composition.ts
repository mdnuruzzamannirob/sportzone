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
import { isDeepStrictEqual } from 'node:util'
import type { RuntimeConfig } from '../../config/environment.js'
import { verifyDeclaredIndexes } from '../../db/indexes.js'
import { createRegistrationNotifications } from '../notifications/registration.js'
import { browserSecurityRoutes } from './browser-routes.js'
import {
  createBrowserSecurity,
  loadBrowserSecurityOptions,
} from './browser-security.js'
import { identityCollectionValidators } from './collection-validators.js'
import { customerRoutes } from './customer-routes.js'
import { createCustomerService } from './customer.js'
import { createIdentityModels } from './models.js'
import { createSessionService, loadSessionOptions } from './sessions.js'

export async function composeCustomerRoutes(
  connection: Connection,
  config: RuntimeConfig,
) {
  const models = createIdentityModels(connection)
  if (!connection.db) throw new Error('Identity persistence unavailable.')
  for (const [name, validator] of Object.entries(
    identityCollectionValidators,
  )) {
    const existing = await connection.db
      .listCollections({ name }, { nameOnly: false })
      .next()
    if (
      !existing ||
      !isDeepStrictEqual(existing.options?.validator, validator) ||
      existing.options?.validationLevel !== 'strict' ||
      existing.options?.validationAction !== 'error'
    )
      throw new Error(
        'Identity persistence requires reviewed bootstrap/migration.',
      )
  }
  for (const model of Object.values(models)) await verifyDeclaredIndexes(model)
  const notifications = createRegistrationNotifications(connection)
  await notifications.verifyIndexes()
  const environment = {
    ...config,
    CUSTOMER_AUTH_ENABLED: String(config.CUSTOMER_AUTH_ENABLED),
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
  const router = Router()
  router.use(browserSecurityRoutes(security, sessions))
  router.use(
    customerRoutes(
      createCustomerService(models, sessions, security, notifications),
      security,
      sessions,
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
      ),
    )
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
  return router
}

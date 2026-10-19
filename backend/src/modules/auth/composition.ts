import { Router } from 'express'
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
  return router
}

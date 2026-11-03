import { Router } from 'express'
import type { Connection } from 'mongoose'
import type { IdentityConfig, RuntimeConfig } from '../../config/env.js'
import type { AuditOperationReader, AuditWriter } from '../audit/audit.public.js'
import type { IdentityNotifications } from '../notifications/notification.public.js'
import type { GuestOrderAccess } from '../orders/order.public.js'
import {
  adminTransactionAccess,
  createAdminAccountAccess,
  createCustomerAccountAccess,
  createMediaAdminAccess,
} from './account-access.service.js'
import {
  createAccountManagementService,
  customerReportAccess,
} from './account-management.service.js'
import { createIdentityModels } from './auth.model.js'
import type {
  AdminAccountAccess,
  CustomerHistories,
  SessionCookies,
  SessionHttp,
} from './auth.public.js'
import {
  createAdminCredentialRoutes,
  createCustomerCredentialRoutes,
} from './credentials/credential.routes.js'
import { createCredentialService } from './credentials/credential.service.js'
import { createGuestAccessRoutes } from './guest-access/guest-access.routes.js'
import { createGuestAccessService } from './guest-access/guest-access.service.js'
import { guestProofDelivery } from './guest-access/guest-proof-delivery.service.js'
import { createGuestSessionService, readGuestCookie } from './guest-access/guest-session.service.js'
import { verifyIdentityPersistence } from './identity.persistence.js'
import { createRecoveryRoutes } from './recovery/password-recovery.routes.js'
import { createRecoveryService } from './recovery/password-recovery.service.js'
import { createAuthQuotaStore } from './sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from './sessions/auth-throttle.service.js'
import { createBrowserSecurityRoutes } from './sessions/browser-security.routes.js'
import { createBrowserSecurity, readContextCookie } from './sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from './sessions/session.http.js'
import { createSessionService } from './sessions/session.service.js'
import { createEmailChangeRoutes } from './verification/email-change.routes.js'
import { createEmailChangeService } from './verification/email-change.service.js'
import { createEmailVerificationRoutes } from './verification/email-verification.routes.js'
import { createEmailVerificationService } from './verification/email-verification.service.js'
import {
  createAdminResetDelivery,
  createEmailChangeDelivery,
  createEmailVerificationDelivery,
  createResetDelivery,
} from './verification/proof-delivery.service.js'

const sessionCookies: SessionCookies = { readSessionCookie, readContextCookie, readGuestCookie }

async function createAuthRuntime(
  connection: Connection,
  config: RuntimeConfig,
  notifications: IdentityNotifications,
  guestOrders: GuestOrderAccess,
) {
  const models = createIdentityModels(connection)
  await verifyIdentityPersistence(connection, models)
  await notifications.verifyIndexes()
  const options = config.identity
  if (!options) throw new Error('Validated identity configuration required.')
  const sessions = createSessionService(connection, models, options.sessions)
  const http: SessionHttp = { ...createSessionHttp(sessions), ...sessionCookies }
  const security = createBrowserSecurity(connection, models, sessions, options.browser)
  const quota = createAuthQuotaStore(connection)
  await quota.verify()
  const throttle = createAuthThrottle(quota, config.SESSION_SECRET)
  const guestSessions = options.guest
    ? createGuestSessionService(
        connection,
        models,
        options.sessions,
        options.guest.sessionTtlSeconds,
        guestOrders.verify,
      )
    : undefined
  if (options.guest) await guestOrders.verifyPersistence()
  const router = Router()
  // Separate bootstrap adapters select their audience from the registered route.
  router.use(
    createBrowserSecurityRoutes(security, sessions, guestSessions, (req, res, next) =>
      throttle.middleware(req.path.startsWith('/admin/') ? 'admin' : 'customer', 'bootstrap')(
        req,
        res,
        next,
      ),
    ),
  )
  if (options.guest && guestSessions)
    router.use(
      createGuestAccessRoutes(
        createGuestAccessService(
          models,
          security,
          guestSessions,
          guestOrders,
          notifications,
          options.guest,
        ),
        guestSessions,
        security,
        throttle.middleware('customer', 'guest'),
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED)
    router.use(
      createCustomerCredentialRoutes(
        createCredentialService(models, sessions, security, notifications),
        security,
        sessions,
        throttle.middleware('customer', 'credentials'),
      ),
    )
  if (options.emailVerification)
    router.use(
      createEmailVerificationRoutes(
        createEmailVerificationService(
          connection,
          models,
          security,
          notifications,
          options.emailVerification,
        ),
        security,
        throttle.middleware('customer', 'email'),
      ),
    )
  if (options.recovery)
    router.use(
      createRecoveryRoutes(
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
      createEmailChangeRoutes(
        createEmailChangeService(connection, models, sessions, notifications, options.emailChange),
        security,
        sessions,
        throttle.middleware('customer', 'email'),
      ),
    )
  if (options.adminRecovery)
    router.use(
      createAdminCredentialRoutes(
        createCredentialService(models, sessions, security, notifications, 'admin'),
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
    http,
    sessions,
    security,
    throttle,
    adminAccounts: createAdminAccountAccess(connection, models, sessions),
    adminTransaction: adminTransactionAccess(models, sessions),
    customerAccounts: createCustomerAccountAccess(connection, models, sessions),
    mediaAdmin: createMediaAdminAccess(models, sessions),
    // Session minting stays inside auth; business consumers receive owned scope only.
    guestAccounts: guestSessions
      ? { owned: guestSessions.owned, authorizeInSession: guestSessions.authorizeInSession }
      : undefined,
  }
}

// Keep private model construction inside auth; callers receive narrow delivery capabilities.
function composeProofDeliveries(
  connection: Connection,
  options: IdentityConfig | undefined,
  guestOrders: GuestOrderAccess,
) {
  const models = createIdentityModels(connection)
  return {
    verify: options?.emailVerification
      ? createEmailVerificationDelivery(models, options.emailVerification)
      : undefined,
    guest: options?.guest ? guestProofDelivery(models, guestOrders, options.guest) : undefined,
    reset: options?.recovery ? createResetDelivery(models, options.recovery) : undefined,
    emailChange: options?.emailChange
      ? createEmailChangeDelivery(models, options.emailChange)
      : undefined,
    adminReset: options?.adminRecovery
      ? createAdminResetDelivery(models, options.adminRecovery)
      : undefined,
  }
}

function customerAdministrationAccess(
  connection: Connection,
  admins: AdminAccountAccess,
  clock: () => Date,
  histories: CustomerHistories,
  audit: AuditWriter,
  lookup: AuditOperationReader,
) {
  const models = createIdentityModels(connection)
  return {
    customers: createAccountManagementService(
      connection,
      models,
      admins,
      audit,
      lookup,
      clock,
      histories,
    ),
    registeredCustomers: customerReportAccess(connection, models),
  }
}

export { composeProofDeliveries, createAuthRuntime, customerAdministrationAccess, sessionCookies }

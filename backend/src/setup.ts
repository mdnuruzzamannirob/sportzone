import { deliveryService } from './modules/delivery/delivery.service.js'
import { deliveryRoutes } from './modules/delivery/delivery.routes.js'
import { deliverySettingsGuard } from './modules/settings/delivery-settings.service.js'
import type { Connection } from 'mongoose'
import { createApp } from './app.js'
import type { RuntimeConfig } from './config/env.js'
import type { loadNotificationWorker } from './config/notifications.js'
import type { PolicyApproval } from './config/settings.js'
import { createAuditWriter } from './modules/audit/audit.service.js'
import { composeProofDeliveries, createAuthRuntime } from './modules/auth/auth.composition.js'
import { cartRoutes } from './modules/cart/cart.routes.js'
import { cartService } from './modules/cart/cart.service.js'
import { wishlistRoutes } from './modules/cart/wishlist.routes.js'
import { wishlistService } from './modules/cart/wishlist.service.js'
import { catalogRoutes } from './modules/catalog/catalog.routes.js'
import { catalogService } from './modules/catalog/catalog.service.js'
import { categoryAdminRoutes } from './modules/catalog/categories/category-admin.routes.js'
import { categoryAdminService } from './modules/catalog/categories/category-admin.service.js'
import { productAdminRoutes } from './modules/catalog/products/product-admin.routes.js'
import { productAdminService } from './modules/catalog/products/product-admin.service.js'
import {
  variantInventoryAccess,
  variantStockAccess,
} from './modules/catalog/variants/variant.service.js'
import { profileRoutes } from './modules/customers/customer.routes.js'
import { createProfileService } from './modules/customers/customer.service.js'
import { createAddressCoverage } from './modules/delivery/delivery-coverage.service.js'
import type { HealthDependencies } from './modules/health/health.service.js'
import { inventoryAdminRoutes } from './modules/inventory/inventory-admin.routes.js'
import { inventoryAdminService } from './modules/inventory/inventory-admin.service.js'
import { inventoryService } from './modules/inventory/inventory.service.js'
import { mediaRoutes } from './modules/media/media.routes.js'
import {
  createMediaService,
  verifyMediaPersistence,
  type MediaDependencies,
} from './modules/media/media.service.js'
import { publicMediaService } from './modules/media/public-media.service.js'
import { createNotificationDeliveryService } from './modules/notifications/notification-delivery.service.js'
import type { RetryPolicy } from './modules/notifications/notification.schema.js'
import { createRegistrationNotifications } from './modules/notifications/notification.service.js'
import type { EmailAdapter } from './modules/notifications/notification.types.js'
import { couponAdminRoutes } from './modules/promotions/coupon-admin.routes.js'
import { couponAdminService } from './modules/promotions/coupon-admin.service.js'
import { policyService } from './modules/settings/policy.service.js'
import { settingsAdminRoutes, settingsPublicRoutes } from './modules/settings/settings.routes.js'
import { settingsService } from './modules/settings/settings.service.js'
import { stockSettingsReader } from './modules/settings/stock-settings.service.js'
import { createResendAdapter } from './providers/email/resend.client.js'
import { createApiRouter } from './routes.js'
import { ApiError } from './shared/errors/app-error.js'
import type { Logger } from './shared/logger.js'

// Only the root composition coordinates independent domain routers and capabilities.
export async function composeIdentityRoutes(
  connection: Connection,
  config: RuntimeConfig,
  media?: MediaDependencies,
  approvals: readonly PolicyApproval[] = [],
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
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      cartRoutes(
        cartService(
          connection,
          auth.customerAccounts,
          catalogService(connection, publicMediaService(connection, media?.provider)),
        ),
        auth.security,
        auth.sessions,
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      wishlistRoutes(
        wishlistService(
          connection,
          auth.customerAccounts,
          catalogService(connection, publicMediaService(connection, media?.provider)),
        ),
        auth.security,
        auth.sessions,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      inventoryAdminRoutes(
        inventoryAdminService(
          connection,
          auth.adminAccounts,
          inventoryService(connection, variantStockAccess(connection)),
          variantInventoryAccess(connection),
          stockSettingsReader(connection),
          createAuditWriter(connection),
        ),
        auth.security,
        auth.sessions,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      couponAdminRoutes(
        couponAdminService(connection, auth.adminAccounts, createAuditWriter(connection)),
        auth.security,
        auth.sessions,
      ),
    )
  let mediaService: ReturnType<typeof createMediaService> | undefined
  if (media) {
    if (!config.ADMIN_AUTH_ENABLED) throw new Error('Admin authentication required for media.')
    await verifyMediaPersistence(connection)
    mediaService = createMediaService(connection, {
      ...media,
      access: {
        admin: auth.mediaAdmin,
        evidence:
          media.evidence ??
          (async () => {
            throw new ApiError('FORBIDDEN')
          }),
      },
    })
    auth.router.use(
      mediaRoutes(
        mediaService,
        auth.security,
        auth.sessions,
        media.policy.maxBytes,
        auth.throttle.middleware('admin', 'media'),
      ),
    )
  }
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      categoryAdminRoutes(
        categoryAdminService(
          connection,
          auth.adminAccounts,
          createAuditWriter(connection),
          mediaService,
        ),
        auth.security,
        auth.sessions,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      productAdminRoutes(
        productAdminService(
          connection,
          auth.adminAccounts,
          createAuditWriter(connection),
          mediaService,
        ),
        auth.security,
        auth.sessions,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      deliveryRoutes(
        deliveryService(
          connection,
          auth.adminAccounts,
          deliverySettingsGuard(connection),
          createAuditWriter(connection),
        ),
        auth.security,
        auth.sessions,
      ),
    )
  const settings = settingsService(
    connection,
    auth.adminAccounts,
    createAuditWriter(connection),
    mediaService,
  )
  const policies = policyService(
    connection,
    auth.adminAccounts,
    createAuditWriter(connection),
    approvals,
  )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(settingsAdminRoutes(settings, policies, auth.security, auth.sessions))
  return auth.router
}

export async function composeApplication(
  connection: Connection,
  config: RuntimeConfig,
  health: HealthDependencies,
  logger: Logger,
  media?: MediaDependencies,
  approvals: readonly PolicyApproval[] = [],
) {
  const identity =
    config.CUSTOMER_AUTH_ENABLED || config.ADMIN_AUTH_ENABLED
      ? await composeIdentityRoutes(connection, config, media, approvals)
      : undefined
  const catalog = catalogRoutes(
    catalogService(connection, publicMediaService(connection, media?.provider)),
    config.CORS_ALLOWED_ORIGINS,
  )
  const unavailable = async (): Promise<never> => {
    throw new ApiError('AUTH_REQUIRED')
  }
  const publicAccess = { owned: unavailable }
  const content = settingsPublicRoutes(
    settingsService(connection, publicAccess, unavailable),
    policyService(connection, publicAccess, unavailable),
    config.CORS_ALLOWED_ORIGINS,
  )
  const apiRouter = createApiRouter(health, [catalog, content, ...(identity ? [identity] : [])])
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
  return createNotificationDeliveryService(
    store,
    adapter,
    settings,
    undefined,
    delivery.reset,
    delivery.emailChange,
    delivery.adminReset,
  )
}

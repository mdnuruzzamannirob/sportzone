import { paymentRiskRoutes } from './modules/payments/payment-risk.routes.js'
import { paymentRiskService } from './modules/payments/payment-risk.service.js'
import { paymentSettlementService } from './modules/payments/payment-settlement.service.js'
import { createHash } from 'node:crypto'
import { paymentProcessingService } from './modules/payments/payment-processing.service.js'
import { paymentVerificationService } from './modules/payments/payment-verification.service.js'
import { verifiedAllocationService } from './modules/checkout/verified-allocation.service.js'
import { verifiedFundingOrderAccess } from './modules/orders/order.service.js'
import { paymentCallbackRoutes } from './modules/payments/payment-callback.routes.js'
import {
  paymentCallbackService,
  type PaymentCallbackProcessor,
} from './modules/payments/payment-callback.service.js'
import {
  paymentCallbackOptions,
  type PaymentCallbackOptions,
} from './modules/payments/payment-callback.schema.js'
import { createPaymentCallbackThrottle } from './modules/auth/sessions/auth-throttle.service.js'
export type PaymentCallbackDependencies = {
  options: PaymentCallbackOptions
  process?: PaymentCallbackProcessor
  verificationGateway?: Pick<
    ReturnType<typeof createSslcommerzAdapter>,
    'validate' | 'queryTransaction'
  >
  clock?: () => Date
}
import { paymentInitiationChannelAccess } from './modules/payments/payment-eligibility.service.js'
import { paymentInitiationService } from './modules/payments/payment-initiation.service.js'
import { paymentInitiationRoutes } from './modules/payments/payment-initiation.routes.js'
import { paymentInitiationAuthAccess } from './modules/auth/checkout-access.service.js'
import { paymentAllocationService } from './modules/checkout/payment-allocation.service.js'
import {
  paymentAllocationOrderAccess,
  paymentInitiationOrderData,
} from './modules/orders/order.service.js'
import { paymentInitiationEligibilityAccess } from './modules/payments/payment.service.js'
import type { createSslcommerzAdapter } from './providers/sslcommerz/sslcommerz.client.js'
export type PaymentInitiationDependencies = {
  gateway: Pick<ReturnType<typeof createSslcommerzAdapter>, 'initiate'>
  validateRequest(request: unknown): boolean
  clock?: () => Date
}
import { paymentMethodsRoutes } from './modules/payments/payment-methods.routes.js'
import { paymentMethodsService } from './modules/payments/payment-methods.service.js'
import { paymentMethodOrderAccess } from './modules/orders/order.service.js'
import { paymentMethodAccess } from './modules/auth/checkout-access.service.js'
import { paymentChannelSettingsAccess } from './modules/settings/checkout-settings.service.js'
import { verifiedMerchantChannels } from './modules/payments/payment-eligibility.service.js'
import type { PaymentChannelApproval } from './modules/payments/payment-eligibility.schema.js'
import { checkoutIntentService } from './modules/checkout/checkout-intent.service.js'
import { checkoutCompletion } from './modules/checkout/checkout-completion.service.js'
import { deliveryAreaRoutes } from './modules/delivery/delivery.routes.js'
import { deliveryAreasAccess } from './modules/delivery/delivery-coverage.service.js'
import type { CheckoutOptions } from './config/checkout.js'
import { checkoutAccess } from './modules/auth/checkout-access.service.js'
import { checkoutQuoteService } from './modules/checkout/checkout-quote.service.js'
import { checkoutRoutes } from './modules/checkout/checkout.routes.js'
import { catalogCheckoutAccess } from './modules/catalog/catalog.service.js'
import { checkoutDeliveryAccess } from './modules/delivery/delivery-coverage.service.js'
import { checkoutSettingsAccess } from './modules/settings/checkout-settings.service.js'
import { createDeliveryDeadlineService } from './modules/orders/delivery-deadline.service.js'
import { couponQuoteAccess } from './modules/promotions/coupon.service.js'
import { paymentEligibility } from './modules/payments/payment-eligibility.service.js'
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
import { storefrontSettingsAccess, settingsService } from './modules/settings/settings.service.js'
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
  checkout?: CheckoutOptions,
  channelApprovals: readonly PaymentChannelApproval[] = [],
  paymentGateway?: PaymentInitiationDependencies,
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
  if (config.ADMIN_AUTH_ENABLED && ['local', 'test'].includes(config.APP_ENV)) {
    const orderAccess = verifiedFundingOrderAccess(connection)
    const settlement = paymentSettlementService(
      connection,
      orderAccess,
      verifiedAllocationService(connection),
    )
    auth.router.use(
      paymentRiskRoutes(
        paymentRiskService(connection, auth.adminAccounts, orderAccess, settlement),
        auth.security,
        auth.sessions,
      ),
    )
  }
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
  auth.router.use(
    paymentMethodsRoutes(
      paymentMethodsService(connection, {
        access: paymentMethodAccess(
          config.CUSTOMER_AUTH_ENABLED
            ? auth.customerAccounts
            : {
                owned: async () => {
                  throw new ApiError('AUTH_REQUIRED')
                },
              },
          auth.guestAccounts,
        ),
        order: paymentMethodOrderAccess(connection),
        settings: paymentChannelSettingsAccess(connection),
        verified: verifiedMerchantChannels(channelApprovals),
      }),
      [config.STOREFRONT_ORIGIN],
    ),
  )
  if (paymentGateway) {
    if (!config.CUSTOMER_AUTH_ENABLED || !['local', 'test'].includes(config.APP_ENV))
      throw new Error('Payment initiation is restricted to reviewed local/test composition.')
    const clock = paymentGateway.clock ?? (() => new Date()),
      settings = paymentChannelSettingsAccess(connection),
      orderData = paymentInitiationOrderData(connection),
      allocationOrder = paymentAllocationOrderAccess(
        connection,
        paymentInitiationEligibilityAccess(connection),
      ),
      allocation = paymentAllocationService(connection, allocationOrder, clock)
    const channel = paymentInitiationChannelAccess(settings, channelApprovals, clock)
    const initiation = paymentInitiationService(
      connection,
      {
        ...paymentInitiationAuthAccess(
          auth.customerAccounts,
          auth.sessions,
          paymentMethodOrderAccess(connection),
          auth.guestAccounts,
        ),
        metadata: orderData.metadata,
        redirectAllowed: orderData.redirectAllowed,
        authorize: orderData.authorize,
        channel,
        allocation: async (session, orderId, requested, amount) => {
          const capability = await channel(session, requested, amount),
            held = await allocation.ensure(session, orderId)
          return {
            orderId,
            channel: requested,
            heldAt: held.heldAt,
            expiresAt: held.expiresAt,
            minPoisha: capability.minPoisha,
            maxPoisha: capability.maxPoisha,
          }
        },
        shortfall: allocationOrder.shortfall,
      },
      paymentGateway.gateway,
      paymentGateway.validateRequest,
      clock,
    )
    auth.router.use(
      paymentInitiationRoutes(
        initiation,
        auth.security,
        auth.throttle.middleware('customer', 'checkout'),
        config.STOREFRONT_ORIGIN,
      ),
    )
  }
  if (checkout) {
    if (!config.CUSTOMER_AUTH_ENABLED)
      throw new Error('Customer authentication required for checkout quotes.')
    const access = checkoutAccess(auth.customerAccounts, auth.security)
    const quotes = checkoutQuoteService(
      connection,
      access,
      {
        catalog: catalogCheckoutAccess(connection),
        delivery: checkoutDeliveryAccess(connection),
        settings: checkoutSettingsAccess(connection, checkout.requiredPolicyTypes),
        deadline: createDeliveryDeadlineService(checkout.deadline),
        coupon: couponQuoteAccess(connection),
        methods: paymentEligibility(verifiedMerchantChannels(channelApprovals)),
      },
      {
        quoteTtlSeconds: checkout.quoteTtlSeconds,
        requiredPolicyTypes: checkout.requiredPolicyTypes,
      },
    )
    auth.router.use(
      checkoutRoutes(
        quotes,
        auth.security,
        auth.throttle.middleware('customer', 'checkout'),
        checkout.codEnabled
          ? checkoutIntentService(connection, access, quotes, checkoutCompletion(connection))
          : undefined,
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
  approvals: readonly PolicyApproval[] = [],
  checkout?: CheckoutOptions,
  channelApprovals: readonly PaymentChannelApproval[] = [],
  paymentGateway?: PaymentInitiationDependencies,
  callbacks?: PaymentCallbackDependencies,
) {
  if (paymentGateway && !config.CUSTOMER_AUTH_ENABLED)
    throw new Error('Customer auth required for payment initiation')
  if (checkout && !config.CUSTOMER_AUTH_ENABLED)
    throw new Error('Customer authentication required for checkout quotes.')
  const identity =
    config.CUSTOMER_AUTH_ENABLED || config.ADMIN_AUTH_ENABLED
      ? await composeIdentityRoutes(
          connection,
          config,
          media,
          approvals,
          checkout,
          channelApprovals,
          paymentGateway,
        )
      : undefined
  const unavailable = async (): Promise<never> => {
    throw new ApiError('AUTH_REQUIRED')
  }
  const publicAccess = { owned: unavailable }
  const images = publicMediaService(connection, media?.provider)
  const settings = settingsService(connection, publicAccess, unavailable)
  const policies = policyService(connection, publicAccess, unavailable)
  const catalog = catalogRoutes(
    catalogService(connection, images, {
      settings: storefrontSettingsAccess(connection, images),
      policies: policies.publicLinks,
    }),
    config.CORS_ALLOWED_ORIGINS,
  )
  const content = settingsPublicRoutes(settings, policies, config.CORS_ALLOWED_ORIGINS)
  const apiRouter = createApiRouter(health, [
    deliveryAreaRoutes(deliveryAreasAccess(connection), config.CORS_ALLOWED_ORIGINS),
    catalog,
    content,
    ...(!identity
      ? [
          paymentMethodsRoutes(
            paymentMethodsService(connection, {
              access: publicAccess,
              order: paymentMethodOrderAccess(connection),
              settings: paymentChannelSettingsAccess(connection),
              verified: verifiedMerchantChannels(channelApprovals),
            }),
            [config.STOREFRONT_ORIGIN],
          ),
        ]
      : []),
    ...(identity ? [identity] : []),
  ])
  if (media && !config.ADMIN_AUTH_ENABLED)
    throw new Error('Admin authentication required for media.')
  let providerCallbacks: import('express').Router | undefined
  if (callbacks) {
    if (!['local', 'test'].includes(config.APP_ENV))
      throw new Error('Payment callbacks require reviewed local/test composition')
    const options = paymentCallbackOptions.parse(callbacks.options)
    if (options.storefrontOrigin !== config.STOREFRONT_ORIGIN)
      throw new Error('Callback storefront mismatch')
    if (callbacks.process && callbacks.verificationGateway)
      throw new Error('Ambiguous callback processor')
    const clock = callbacks.clock ?? (() => new Date())
    const process = callbacks.verificationGateway
      ? paymentProcessingService(
          connection,
          paymentVerificationService(
            connection,
            callbacks.verificationGateway,
            createHash('sha256').update(`${options.mode}\0${options.storeId}`).digest('hex'),
          ),
          verifiedFundingOrderAccess(connection),
          verifiedAllocationService(connection, clock),
          clock,
        ).process
      : callbacks.process
    providerCallbacks = paymentCallbackRoutes(
      paymentCallbackService(connection, options, config.SESSION_SECRET, process),
      createPaymentCallbackThrottle(connection, config.SESSION_SECRET, options.rateLimit),
    )
  }
  return createApp({
    logger,
    apiRouter,
    mediaUploadsEnabled: Boolean(media),
    ...(providerCallbacks ? { providerCallbacks } : {}),
  })
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
    delivery.guest,
  )
}

import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import { Types } from 'mongoose'
import { createApp } from './app.js'
import type { CheckoutOptions } from './config/checkout.js'
import { loadCheckoutOptions } from './config/checkout.js'
import type { RuntimeConfig } from './config/env.js'
import { loadMediaConfiguration } from './config/media.js'
import type { loadNotificationWorker } from './config/notifications.js'
import type { OperationsOptions } from './config/operations.js'
import { loadOperationsOptions } from './config/operations.js'
import type { OrderOperationsOptions } from './config/order-operations.js'
import { loadOrderOperationsOptions } from './config/order-operations.js'
import {
  loadPaymentCallbackOptions,
  loadPaymentChannelApprovals,
  loadPaymentInitiationOptions,
  loadPaymentProcessingOptions,
  loadSslcommerzOptions,
} from './config/payments.js'
import {
  loadRefundOperationsOptions,
  type RefundOperationsOptions,
  refundOperationsOptions,
} from './config/refunds.js'
import type { ReturnOperationsOptions } from './config/returns.js'
import { loadAfterSalesHistory, loadReturnOperationsOptions } from './config/returns.js'
import type { PolicyApproval } from './config/settings.js'
import { loadPolicyApprovals } from './config/settings.js'
import type { HealthDependencies } from './health/health.service.js'
import type { AuditAccess } from './modules/audit/audit.public.js'
import { createAuditRoutes } from './modules/audit/audit.routes.js'
import {
  auditOperationReader,
  createAuditQueryService,
  createAuditWriter,
  orderAuditRefsAccess,
  paymentAuditAccess,
  refundStatusTimelineAccess,
  reviewModerationReceiptAccess,
} from './modules/audit/audit.service.js'
import {
  composeProofDeliveries,
  createAuthRuntime,
  customerAdministrationAccess,
  sessionCookies,
} from './modules/auth/auth.composition.js'
import {
  checkoutAccess,
  orderScopeAccess,
  paymentInitiationAuthAccess,
  paymentMethodAccess,
} from './modules/auth/checkout-access.service.js'
import { createPaymentCallbackThrottle } from './modules/auth/sessions/auth-throttle.service.js'
import { readSessionCookie } from './modules/auth/sessions/session.http.js'
import { createCartRoutes } from './modules/cart/cart.routes.js'
import { createCartSchemas } from './modules/cart/cart.schema.js'
import { createCartService } from './modules/cart/cart.service.js'
import { createCatalogRoutes } from './modules/catalog/catalog.routes.js'
import { createCatalogSchemas, productCard } from './modules/catalog/catalog.schema.js'
import {
  catalogCheckoutAccess,
  catalogReviewVisibility,
  createCatalogService,
} from './modules/catalog/catalog.service.js'
import { createCategoryAdminRoutes } from './modules/catalog/categories/category.routes.js'
import { createCategoryAdminService } from './modules/catalog/categories/category.service.js'
import { createProductAdminRoutes } from './modules/catalog/products/product.routes.js'
import {
  catalogReportAccess,
  createProductAdminService,
  productReviewAccess,
} from './modules/catalog/products/product.service.js'
import { attributes, variantStockView } from './modules/catalog/products/variant.schema.js'
import {
  variantInventoryAccess,
  variantStockAccess,
} from './modules/catalog/products/variant.service.js'
import { createCheckoutRoutes } from './modules/checkout/checkout.routes.js'
import { createCheckoutSchemas, quoteTotals } from './modules/checkout/checkout.schema.js'
import {
  createCheckoutCompletionService,
  createCheckoutIntentService,
  createCheckoutQuoteService,
  orderPolicySnapshotAccess,
} from './modules/checkout/checkout.service.js'
import { checkoutCommercialDigest } from './modules/checkout/checkout-consent.policy.js'
import { createCheckoutIntentSchemas } from './modules/checkout/checkout-intent.schema.js'
import {
  createCustomerAdminRoutes,
  createCustomerRoutes,
} from './modules/customers/customer.routes.js'
import { addressInput } from './modules/customers/customer.schema.js'
import { createCustomerService } from './modules/customers/customer.service.js'
import {
  createDeliveryAreaRoutes,
  createDeliveryRoutes,
} from './modules/delivery/delivery.routes.js'
import {
  checkoutDeliveryAccess,
  createAddressCoverage,
  createDeliveryService,
  deliveryAreasAccess,
} from './modules/delivery/delivery.service.js'
import { createInventoryAdminRoutes } from './modules/inventory/inventory.routes.js'
import { createInventorySchemas } from './modules/inventory/inventory.schema.js'
import {
  createAllocationService,
  createInventoryAdminService,
  createInventoryService,
  createRecoveryReceiptService,
  createReturnReceiptService,
} from './modules/inventory/inventory.service.js'
import { createPublicMediaService } from './modules/media/access.service.js'
import { claimEvidenceMetadataAccess } from './modules/media/attachment.service.js'
import { claimEvidenceMultipart } from './modules/media/media.controller.js'
import { createMediaRoutes } from './modules/media/media.routes.js'
import {
  createClaimMediaAccess,
  createMediaService,
  type MediaDependencies,
  verifyMediaPersistence,
} from './modules/media/media.service.js'
import { createNotificationRoutes } from './modules/notifications/notification.routes.js'
import type { RetryPolicy } from './modules/notifications/notification.schema.js'
import {
  createNotificationAdminService,
  createNotificationService,
} from './modules/notifications/notification.service.js'
import type { EmailAdapter } from './modules/notifications/notification.types.js'
import { createNotificationDeliveryService } from './modules/notifications/notification-delivery.service.js'
import {
  createOrderMessageService,
  createPaymentMessageService,
  createRefundMessageService,
  createReturnMessageService,
  refundDecisionNotifier,
  returnDecisionNotifier,
} from './modules/notifications/notification-template.js'
import { createCancellationService } from './modules/orders/cancellation.service.js'
import {
  deliveryDeadline,
  deliveryDeadlineBasis,
} from './modules/orders/delivery-deadline.schema.js'
import {
  createDeliveryDeadlineService,
  deliveryDeadlineApprovalAccess,
} from './modules/orders/delivery-deadline.service.js'
import { createDeliveryExceptionService } from './modules/orders/delivery-exception.service.js'
import {
  createCancellationRoutes,
  createDeliveryExceptionRoutes,
  createOrderAdminRoutes,
  createOrderReadRoutes,
} from './modules/orders/order.routes.js'
import {
  createOrderAllocationBindingSchema,
  createOrderSchemas,
  fulfillmentStatus,
} from './modules/orders/order.schema.js'
import {
  cancellationRefundSnapshotAccess,
  checkoutOrderReadAccess,
  claimEligibilitySnapshotAccess,
  claimQuantityAccess,
  claimRestockAccess,
  claimReviewQuantityAccess,
  closedRefundRequestAccess,
  codCollectionOrderAccess,
  complaintOrderAccess,
  createOrderService,
  customerAdminOrderHistoryAccess,
  customerOrderHistoryAccess,
  deliveryExceptionRefundSnapshotAccess,
  guestOrderAccess,
  initialOrderAllocationAccess,
  orderReportAccess,
  paymentAllocationOrderAccess,
  paymentInitiationOrderData,
  paymentMethodOrderAccess,
  refundOrderSnapshotAccess,
  refundRequestOrderAccess,
  refundUnitOutcomeAccess,
  refundUnitReservationAccess,
  returnNotificationOrderAccess,
  reviewPurchaseEligibilityAccess,
  stockExceptionQueueAccess,
  verifiedFundingOrderAccess,
} from './modules/orders/order.service.js'
import {
  createCancellationAllocationService,
  createFulfillmentAllocationService,
  createOrderAllocationService,
  createPaymentAllocationService,
  createVerifiedAllocationService,
} from './modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from './modules/orders/order-lifecycle.service.js'
import { orderNotificationAccess } from './modules/orders/order-notification.service.js'
import { createOrderReadSchemas } from './modules/orders/order-read.schema.js'
import { createOrderReadService } from './modules/orders/order-read.service.js'
import type { PaymentChannelApproval } from './modules/payments/attempts/payment-eligibility.schema.js'
import {
  paymentChannel,
  paymentMethodEligibility,
} from './modules/payments/attempts/payment-eligibility.schema.js'
import {
  paymentEligibility,
  paymentInitiationChannelAccess,
  verifiedMerchantChannels,
} from './modules/payments/attempts/payment-eligibility.service.js'
import { publicPaymentAttempt } from './modules/payments/attempts/payment-initiation.schema.js'
import { createPaymentInitiationService } from './modules/payments/attempts/payment-initiation.service.js'
import { createPaymentRetryService } from './modules/payments/attempts/payment-retry.service.js'
import { createCodCollectionService } from './modules/payments/collections/cod-collection.service.js'
import { protectedCodCollectionEvidence } from './modules/payments/collections/cod-evidence.service.js'
import {
  type PaymentCallbackOptions,
  paymentCallbackOptions,
} from './modules/payments/collections/payment-callback.schema.js'
import {
  createPaymentCallbackService,
  type PaymentCallbackProcessor,
} from './modules/payments/collections/payment-callback.service.js'
import {
  createPaymentMatchingService,
  protectedPaymentMatchingEvidence,
} from './modules/payments/collections/payment-matching.service.js'
import { createPaymentMonitorService } from './modules/payments/collections/payment-monitor.service.js'
import { paymentNotificationAccess } from './modules/payments/collections/payment-notification.service.js'
import { createPaymentProcessingService } from './modules/payments/collections/payment-processing.service.js'
import { createPaymentRiskService } from './modules/payments/collections/payment-risk.service.js'
import { createPaymentSettlementService } from './modules/payments/collections/payment-settlement.service.js'
import { createPaymentVerificationService } from './modules/payments/collections/payment-verification.service.js'
import type { PaymentGateway } from './modules/payments/payment.public.js'
import {
  createPaymentCallbackRoutes,
  createPaymentInitiationRoutes,
  createPaymentMatchingRoutes,
  createPaymentMethodsRoutes,
  createPaymentMonitorRoutes,
  createPaymentRiskRoutes,
} from './modules/payments/payment.routes.js'
import {
  cancellationPaymentAccess,
  checkoutPaymentAccess,
  customerPaymentSummaryAccess,
  fulfillmentPaymentAccess,
  paymentExceptionQueueAccess,
  paymentInitiationEligibilityAccess,
  paymentReportAccess,
  refundFundingAccess,
} from './modules/payments/payment.service.js'
import { createPaymentMethodsService } from './modules/payments/payment-methods.service.js'
import { calculatePricing } from './modules/promotions/pricing.js'
import { pricingInput } from './modules/promotions/pricing.schema.js'
import {
  createCouponAdminRoutes,
  createCouponPreviewRoutes,
} from './modules/promotions/promotion.routes.js'
import { couponCode } from './modules/promotions/promotion.schema.js'
import {
  couponGenerationAccess,
  couponQuoteAccess,
  createCouponAdminService,
  createCouponAllocationService,
  createCouponPreviewService,
} from './modules/promotions/promotion.service.js'
import { createCancellationRefundService } from './modules/refunds/obligations/cancellation-refund.service.js'
import {
  correctionMonitoringAccess,
  createCorrectionObligationService,
} from './modules/refunds/obligations/correction-obligation.service.js'
import { createRefundReservationService } from './modules/refunds/obligations/refund-reservation.service.js'
import { createRefundDispatchService } from './modules/refunds/payouts/refund-dispatch.service.js'
import { protectedRefundEvidence } from './modules/refunds/payouts/refund-evidence.service.js'
import type { RefundOutcomeVerifier } from './modules/refunds/payouts/refund-outcome.schema.js'
import {
  createRefundRecoveryService,
  refundNotificationProofAccess,
} from './modules/refunds/payouts/refund-recovery.service.js'
import {
  createRefundHistoryRoutes,
  createRefundRequestRoutes,
  createRefundRoutes,
} from './modules/refunds/refund.routes.js'
import {
  createRefundHistoryService,
  refundExceptionQueueAccess,
  refundReportAccess,
} from './modules/refunds/refund-history.service.js'
import { createRefundOperationsService } from './modules/refunds/refund-operations.service.js'
import { createReportRoutes } from './modules/reports/report.routes.js'
import { createReportSchemas } from './modules/reports/report.schema.js'
import {
  createOperationalQueueService,
  createReportService,
} from './modules/reports/report.service.js'
import { createReturnEligibilityService } from './modules/returns/return.policy.js'
import { createReturnHistoryRoutes, createReturnRoutes } from './modules/returns/return.routes.js'
import {
  createReturnHistoryService,
  createReturnLifecycleService,
  createReturnOperationsService,
  createReturnPhysicalService,
  refundClaimSelectionAccess,
  refundClaimSnapshotAccess,
  returnNotificationProofAccess,
  returnReportAccess,
} from './modules/returns/return.service.js'
import { createReviewRoutes } from './modules/reviews/review.routes.js'
import { createReviewQueryService, createReviewService } from './modules/reviews/review.service.js'
import {
  createSettingAdminRoutes,
  createSettingPublicRoutes,
} from './modules/settings/setting.routes.js'
import {
  paymentChannels,
  policyType,
  publicHomeSettings,
  publicPolicyLink,
} from './modules/settings/setting.schema.js'
import {
  checkoutSettingsAccess,
  createPolicyService,
  createSettingService,
  deliverySettingsGuard,
  paymentChannelSettingsAccess,
  reportThresholdAccess,
  stockSettingsReader,
  storefrontSettingsAccess,
} from './modules/settings/setting.service.js'
import { createSupportReadRoutes, createSupportRoutes } from './modules/support/support.routes.js'
import { createComplaintService } from './modules/support/support.service.js'
import { createWishlistRoutes } from './modules/wishlist/wishlist.routes.js'
import { createWishlistSchemas } from './modules/wishlist/wishlist.schema.js'
import { createWishlistService } from './modules/wishlist/wishlist.service.js'
import { createClamAvScanner } from './providers/antivirus/clamav.client.js'
import { createCloudinaryAdapter } from './providers/cloudinary/cloudinary.client.js'
import { createResendAdapter } from './providers/email/resend.client.js'
import { createSslcommerzAdapter } from './providers/sslcommerz/sslcommerz.client.js'
import { initiationInput } from './providers/sslcommerz/sslcommerz.schema.js'
import { createApiRouter } from './routes.js'
import { ApiError } from './shared/errors/app-error.js'
import type { Logger } from './shared/logger.js'

type PaymentCallbackDependencies = {
  options: PaymentCallbackOptions
  process?: PaymentCallbackProcessor
  verificationGateway?: Pick<PaymentGateway, 'validate' | 'queryTransaction'>
  clock?: () => Date
}

type PaymentInitiationDependencies = {
  reconciliationGateway?: Pick<PaymentGateway, 'validate' | 'queryTransaction'>
  gateway: Pick<PaymentGateway, 'initiate'>
  validateRequest(request: unknown): boolean
  clock?: () => Date
}

type OrderOperationsDependencies = {
  approvedDeadline: NonNullable<Parameters<typeof createOrderLifecycleService>[6]>
  cashEvidence:
    | NonNullable<Parameters<typeof createCodCollectionService>[5]>
    | { receiptFile: string }
  cancellationRefund: NonNullable<Parameters<typeof createCancellationService>[7]>
}

type RefundOperationsDependencies = {
  options: RefundOperationsOptions
  verifyEvidence?: RefundOutcomeVerifier
  gateway?: {
    client: Pick<PaymentGateway, 'initiateRefund'> & Partial<Pick<PaymentGateway, 'queryRefund'>>
    merchantAccountKey: string
  }
}

const checkoutSchemas = createCheckoutSchemas({
  deliveryDeadline,
  attributes: attributes,
  addressInput: addressInput,
  deliveryDeadlineBasis: deliveryDeadlineBasis,
  paymentChannel: paymentChannel,
  paymentMethodEligibility: paymentMethodEligibility,
  couponCode: couponCode,
  policyType: policyType,
})
const checkoutIntentSchemas = createCheckoutIntentSchemas({
  fulfillmentStatus,
  checkoutSubmitInput: checkoutSchemas.checkoutSubmitInput,
})
const orderReadSchemas = createOrderReadSchemas({
  quoteLine: checkoutSchemas.quoteLine,
  quotePolicyRef: checkoutSchemas.quotePolicyRef,
  quoteTotals: quoteTotals,
  checkoutOrderSummary: checkoutIntentSchemas.checkoutOrderSummary,
  publicPaymentAttempt: publicPaymentAttempt,
})
const reportSchemas = createReportSchemas({
  fulfillmentStatus,
  customerPaymentSummary: orderReadSchemas.customerPaymentSummary,
})
const orderAllocationBindingSchema = createOrderAllocationBindingSchema(pricingInput)

const catalogSchemas = createCatalogSchemas({
  publicHomeSettings: publicHomeSettings,
  publicPolicyLink: publicPolicyLink,
})
const cartSchemas = createCartSchemas({ productCard: productCard })
const wishlistSchemas = createWishlistSchemas({ productCard: productCard })
const inventorySchemas = createInventorySchemas({ stockView: variantStockView })

const orderSchemas = createOrderSchemas({
  checkoutCommercialSnapshot: checkoutSchemas.checkoutCommercialSnapshot,
})

// Explicit local/test composition for the owner-delegated return development workflow.
function composeAuditAccess(connection: Connection): AuditAccess {
  return {
    write: createAuditWriter(connection),
    replay: createAuditWriter(connection, true),
    lookup: auditOperationReader(connection),
  }
}

function configuredReturnMedia(env: NodeJS.ProcessEnv): MediaDependencies | undefined {
  if (env.MEDIA_ENABLED === undefined || env.MEDIA_ENABLED === 'false') return undefined
  if (env.RETURN_OPERATIONS_ENABLED !== 'true' || !['local', 'test'].includes(env.APP_ENV ?? ''))
    throw new ApiError('SERVICE_UNAVAILABLE')
  const options = loadMediaConfiguration(env)
  return {
    policy: options.policy,
    provider: createCloudinaryAdapter(options.cloud),
    scanner: createClamAvScanner(options.scanner),
    async canDelete(asset) {
      const now = new Date()
      return (
        asset.assetKind === 'claim_evidence' &&
        asset.access === 'private' &&
        asset.references.length === 0 &&
        !asset.legalHold &&
        Boolean(asset.expiresAt && asset.expiresAt <= now) &&
        (!asset.retainUntil || asset.retainUntil <= now)
      )
    },
  }
}

// Public-media admission does not depend on the unrelated return workflow switch.
function configuredPublicMedia(env: NodeJS.ProcessEnv): MediaDependencies | undefined {
  if (env.MEDIA_ENABLED === undefined || env.MEDIA_ENABLED === 'false') return undefined
  if (!['local', 'test'].includes(env.APP_ENV ?? '') || env.ADMIN_AUTH_ENABLED !== 'true')
    throw new ApiError('SERVICE_UNAVAILABLE')
  const options = loadMediaConfiguration(env)
  return {
    policy: options.policy,
    provider: createCloudinaryAdapter(options.cloud),
    scanner: createClamAvScanner(options.scanner),
    async canDelete(asset) {
      const now = new Date()
      return (
        asset.assetKind === 'public_media' &&
        asset.references.length === 0 &&
        !asset.legalHold &&
        Boolean(asset.expiresAt && asset.expiresAt <= now) &&
        (!asset.retainUntil || asset.retainUntil <= now)
      )
    },
  }
}

function composeReturnOperationsRoutes(
  connection: Connection,
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    | 'http'
    | 'customerAccounts'
    | 'adminAccounts'
    | 'guestAccounts'
    | 'sessions'
    | 'security'
    | 'adminTransaction'
    | 'throttle'
  >,
  storefrontOrigin: string,
  options: ReturnOperationsOptions,
  media?: MediaDependencies,
  clock: () => Date = () => new Date(),
) {
  const policy = structuredClone(options)
  const scope = orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts)
  const snapshot = claimEligibilitySnapshotAccess(connection)
  const eligibility = createReturnEligibilityService(
    async (session, orderId, principal) => {
      const facts = await snapshot(session, orderId, principal)
      return { status: facts.status, deliveredAt: facts.deliveredAt }
    },
    async (_session, input) => {
      const exception = policy.exceptions.find(
        (row) => row.orderId === input.orderId && row.claimType === input.claimType,
      )
      return {
        policyVersion: policy.policyVersion,
        ...(exception ? { exceptionBasis: exception.exceptionBasis } : {}),
      }
    },
    clock,
  )
  const history = createReturnHistoryService(
    connection,
    scope,
    complaintOrderAccess(connection),
    claimEvidenceMetadataAccess(connection),
    auth.adminAccounts,
    customerOrderHistoryAccess(connection),
  )
  const mediaFor = (
    credentials: import('./modules/auth/checkout-access.service.js').PaymentInitiationCredentials,
    orderId: string,
    mutating = false,
  ) => {
    if (!media) throw new ApiError('SERVICE_UNAVAILABLE')
    return createMediaService(
      connection,
      {
        ...media,
        access: {
          admin: async (token, session) => ({
            kind: 'admin',
            principalId: new Types.ObjectId(await auth.adminTransaction(token, session)),
          }),
          evidence: async (_token, requested, session) => {
            if (requested.orderId.toHexString() !== orderId) throw new ApiError('FORBIDDEN')
            const principal = await scope.inSession(credentials, orderId, session, mutating)
            const facts = await snapshot(session, orderId, principal)
            if (
              facts.status !== 'delivered' ||
              requested.orderItemIds.some(
                (id) => !facts.items.some((item) => item.orderItemId === id.toHexString()),
              )
            )
              throw new ApiError('FORBIDDEN')
            return {
              kind: principal.kind === 'customer' ? 'customer' : 'guest_order',
              principalId: new Types.ObjectId(
                principal.kind === 'customer' ? principal.userId : principal.orderId,
              ),
            }
          },
        },
      },
      clock,
    )
  }
  const lifecycle = createReturnLifecycleService(
    connection,
    auth.adminAccounts,
    claimReviewQuantityAccess(connection),
    composeAuditAccess(connection),
    clock,
    returnDecisionNotifier(
      returnNotificationOrderAccess(connection),
      createNotificationService(connection, clock),
    ),
  )
  const physical = createReturnPhysicalService(
    connection,
    auth.adminAccounts,
    claimRestockAccess(connection),
    createReturnReceiptService(connection, clock),
    composeAuditAccess(connection),
    clock,
  )
  const operations = createReturnOperationsService(
    connection,
    {
      scope,
      order: snapshot,
      quantities: claimQuantityAccess(connection),
      eligibility,
      history,
      policyVersion: policy.policyVersion,
      administration: { lifecycle, physical },
      ...(media
        ? {
            media: (credentials, orderId, mutating) =>
              createClaimMediaAccess(mediaFor(credentials, orderId, mutating)),
          }
        : {}),
    },
    composeAuditAccess(connection),
    clock,
  )
  return [
    createReturnHistoryRoutes(history, auth.security, auth.http),
    createReturnRoutes(
      operations,
      lifecycle,
      physical,
      history,
      auth.security,
      auth.http,
      storefrontOrigin,
      media?.policy.maxBytes ?? 1024,
      auth.throttle.middleware('customer', 'media'),
      async (token, claimId, assetId) => {
        const claim = await history.adminDetail(token, claimId)
        if (!claim.evidence.some((asset) => asset.assetId === assetId))
          throw new ApiError('NOT_FOUND')
        return mediaFor({ customerPresent: false }, claim.orderId).privateUrl(token, assetId, true)
      },
      claimEvidenceMultipart,
    ),
  ]
}

function configuredOrderOperations(
  connection: Connection,
  options: OrderOperationsOptions,
  clock: () => Date = () => new Date(),
): OrderOperationsDependencies {
  const authorizations = structuredClone(options.cancellationAuthorizations)
  return {
    approvedDeadline: deliveryDeadlineApprovalAccess([options.deadline], clock),
    cashEvidence: { receiptFile: options.cashReceiptFile },
    cancellationRefund: createCancellationRefundService(
      connection,
      cancellationRefundSnapshotAccess(connection),
      refundUnitReservationAccess(connection),
      refundFundingAccess(connection),
      composeAuditAccess(connection),
      async (_session, input) => {
        const entry = authorizations.find(
          (row) => row.orderId === input.orderId && row.requestId === input.basisRefId,
        )
        if (!entry || input.basis !== 'cancellation') throw new ApiError('SERVICE_UNAVAILABLE')
        return entry.approval
      },
      clock,
      refundDecisionNotifier(
        returnNotificationOrderAccess(connection),
        createNotificationService(connection, clock),
        createAuditWriter(connection),
      ),
    ),
  }
}

// No default policy, cash proof or refund stand-in: the caller supplies protected authorities.
function composeOrderOperationsRoutes(
  connection: Connection,
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    'http' | 'customerAccounts' | 'adminAccounts' | 'guestAccounts' | 'sessions' | 'security'
  >,
  storefrontOrigin: string,
  dependencies: OrderOperationsDependencies,
  clock: () => Date = () => new Date(),
) {
  const scope = orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts)
  const stock = createAllocationService(connection, undefined, clock)
  const reads = createOrderReadService(
    connection,
    auth.customerAccounts,
    scope,
    customerPaymentSummaryAccess(connection, clock),
    orderPolicySnapshotAccess(connection),
    composeOrderReadDependencies(),
    clock,
    {
      accounts: auth.adminAccounts,
      auditRefs: orderAuditRefsAccess(connection),
      allocation: async (session, orderId) => {
        const generation = await stock.latestGeneration(session, orderId)
        const rows = generation ? await stock.generation(session, orderId, generation) : []
        return {
          generation: generation ?? null,
          items: rows.map((row) => ({
            variantId: row.variantId,
            quantity: row.quantity,
            status: row.status,
          })),
        }
      },
    },
  )
  const lifecycle = createOrderLifecycleService(
    connection,
    auth.adminAccounts,
    fulfillmentPaymentAccess(connection, clock),
    createFulfillmentAllocationService(
      {
        createAllocationService: createAllocationService.bind(undefined, connection, undefined),
        couponGenerationAccess: couponGenerationAccess(connection),
        schemaOrderAllocationBinding: orderAllocationBindingSchema,
      },
      clock,
    ),
    composeAuditAccess(connection),
    { createNotificationService: createNotificationService.bind(undefined, connection) },
    dependencies.approvedDeadline,
    clock,
  )
  const cash = createCodCollectionService(
    connection,
    auth.adminAccounts,
    codCollectionOrderAccess(connection),
    composeAuditAccess(connection),
    {
      createCorrectionObligationService: createCorrectionObligationService.bind(
        undefined,
        connection,
      ),
    },
    typeof dependencies.cashEvidence === 'function'
      ? dependencies.cashEvidence
      : protectedCodCollectionEvidence(dependencies.cashEvidence.receiptFile, clock),
    clock,
  )
  const cancellation = createCancellationService(
    connection,
    scope,
    auth.adminAccounts,
    createCancellationAllocationService(composeAllocationDependencies(connection), clock),
    cancellationPaymentAccess(connection),
    composeAuditAccess(connection),
    { createNotificationService: createNotificationService.bind(undefined, connection) },
    dependencies.cancellationRefund,
    clock,
  )
  return [
    createOrderReadRoutes(reads, auth.security, auth.http),
    createOrderAdminRoutes(reads, lifecycle, cash, auth.security, auth.http),
    createCancellationRoutes(cancellation, auth.security, auth.http, storefrontOrigin),
  ]
}

// Only the root composition coordinates independent domain routers and capabilities.
function composeLocalReviewRoutes(
  connection: Connection,
  environment: RuntimeConfig['APP_ENV'],
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    'http' | 'customerAccounts' | 'adminAccounts' | 'adminTransaction' | 'sessions' | 'security'
  >,
  clock: () => Date = () => new Date(),
) {
  if (!['local', 'test'].includes(environment)) throw new ApiError('SERVICE_UNAVAILABLE')
  const reviews = createReviewService(
    connection,
    {
      accounts: auth.customerAccounts,
      catalog: productReviewAccess(connection),
      eligibility: reviewPurchaseEligibilityAccess(connection),
      audit: createAuditWriter(connection),
      moderator: auth.adminTransaction,
      moderationReceipt: reviewModerationReceiptAccess(connection),
    },
    clock,
  )
  return createReviewRoutes(
    createReviewQueryService(
      connection,
      auth.customerAccounts,
      auth.adminAccounts,
      catalogReviewVisibility(connection),
    ),
    reviews,
    auth.security,
    auth.http,
  )
}

function composeAfterSalesHistoryRoutes(
  connection: Connection,
  environment: RuntimeConfig['APP_ENV'],
  auth: Parameters<typeof composeReturnOperationsRoutes>[1],
) {
  if (!['local', 'test'].includes(environment)) throw new ApiError('SERVICE_UNAVAILABLE')
  return [
    composeLocalReviewRoutes(connection, environment, auth),
    createRefundHistoryRoutes(
      createRefundHistoryService(
        connection,
        orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts),
        complaintOrderAccess(connection),
        customerOrderHistoryAccess(connection),
        { refundStatusTimelineAccess: refundStatusTimelineAccess(connection) },
      ),
      auth.security,
      auth.http,
    ),
  ]
}

function composeOperationsRoutes(
  connection: Connection,
  environment: RuntimeConfig['APP_ENV'],
  auth: Parameters<typeof composeReturnOperationsRoutes>[1],
  storefrontOrigin: string,
  options: OperationsOptions,
  refunds?: RefundOperationsDependencies,
  clock: () => Date = () => new Date(),
) {
  if (!['local', 'test'].includes(environment)) throw new ApiError('SERVICE_UNAVAILABLE')
  const refundPolicy = refunds
    ? structuredClone(refundOperationsOptions.parse(refunds.options))
    : undefined
  const scope = orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts),
    customerOrders = customerOrderHistoryAccess(connection),
    claims = createReturnHistoryService(
      connection,
      scope,
      complaintOrderAccess(connection),
      claimEvidenceMetadataAccess(connection),
      auth.adminAccounts,
      customerOrders,
    ),
    history = createRefundHistoryService(
      connection,
      scope,
      complaintOrderAccess(connection),
      customerOrders,
      { refundStatusTimelineAccess: refundStatusTimelineAccess(connection) },
    ),
    orderHistory = customerAdminOrderHistoryAccess(
      connection,
      customerPaymentSummaryAccess(connection),
    ),
    administration = customerAdministrationAccess(
      connection,
      auth.adminAccounts,
      clock,
      (session, id, kind, raw) =>
        kind === 'orders'
          ? orderHistory(session, id, raw)
          : kind === 'claims'
            ? claims.forCustomer(session, id, raw)
            : history.forCustomer(session, id, raw),
      createAuditWriter(connection),
      auditOperationReader(connection),
    ),
    complaints = createComplaintService(
      connection,
      scope,
      complaintOrderAccess(connection),
      auth.adminAccounts,
      composeAuditAccess(connection),
      clock,
      checkoutAccess(auth.customerAccounts, auth.security),
    ),
    notifications = createNotificationAdminService(
      connection,
      auth.adminAccounts,
      composeAuditAccess(connection),
      clock,
    ),
    funds = refundFundingAccess(connection),
    exceptionRefund = createCancellationRefundService(
      connection,
      deliveryExceptionRefundSnapshotAccess(connection),
      refundUnitReservationAccess(connection),
      funds,
      composeAuditAccess(connection),
      refunds
        ? async (_session, input) => {
            if (!refundPolicy) throw new ApiError('SERVICE_UNAVAILABLE')
            const match = refundPolicy.authorizations.filter(
              (row) =>
                row.orderId === input.orderId &&
                row.basis === 'delivery_exception' &&
                row.basisRefId === input.basisRefId,
            )
            const selected = match[0]
            if (match.length !== 1 || !selected) throw new ApiError('SERVICE_UNAVAILABLE')
            return selected.approval
          }
        : undefined,
      clock,
      refundDecisionNotifier(
        returnNotificationOrderAccess(connection),
        createNotificationService(connection, clock),
        createAuditWriter(connection),
      ),
      'delivery_exception',
    ),
    exceptions = createDeliveryExceptionService(
      connection,
      auth.adminAccounts,
      cancellationPaymentAccess(connection),
      createRecoveryReceiptService(connection, clock),
      composeAuditAccess(connection),
      { createNotificationService: createNotificationService.bind(undefined, connection) },
      options.verifyDisposition,
      async (session, input) =>
        exceptionRefund(session, {
          orderId: input.orderId,
          paymentId: input.paymentId,
          actorId: input.actorId,
          reason: input.reason,
          requestId: input.exceptionId,
        }),
      clock,
    ),
    payments = paymentExceptionQueueAccess(connection),
    queues = createOperationalQueueService(auth.adminAccounts, {
      stock: stockExceptionQueueAccess(connection),
      refunds: refundExceptionQueueAccess(connection),
      payments: (session, q) => payments(session, q, false),
      reconciliation: (session, q) => payments(session, q, true),
    })
  return [
    createCustomerAdminRoutes(administration.customers, {
      cors: auth.security.cors('admin'),
      requireBrowser: auth.security.require('admin', 'admin'),
      requireSession: auth.http.require('admin'),
      readToken: (header) => readSessionCookie(header, 'admin'),
    }),
    createSupportReadRoutes(complaints, auth.security, auth.http),
    createAuditRoutes(
      createAuditQueryService(connection, auth.adminAccounts),
      auth.security,
      auth.http,
    ),
    createNotificationRoutes(notifications, auth.security, auth.http),
    createDeliveryExceptionRoutes(exceptions, auth.security, auth.http),
    createSupportRoutes(
      { complaints, customers: auth.customerAccounts },
      auth.security,
      auth.http,
      auth.throttle,
      storefrontOrigin,
    ),
    createReportRoutes(
      createReportService(
        auth.adminAccounts,
        {
          paymentSummary: customerPaymentSummaryAccess(connection),
          orders: orderReportAccess(connection),
          payments: paymentReportAccess(connection),
          refunds: refundReportAccess(connection),
          catalog: catalogReportAccess(connection),
          threshold: reportThresholdAccess(connection),
          customers: administration.registeredCustomers,
          pendingReturns: returnReportAccess(connection),
        },
        { schemaReportViews: reportSchemas.reportViews },
        clock,
      ),
      auth.security,
      auth.http,
      queues,
    ),
  ]
}
function composeRefundRecovery(
  connection: Connection,
  admins: Parameters<typeof createRefundRecoveryService>[1],
  dependencies: Pick<RefundOperationsDependencies, 'gateway' | 'verifyEvidence'> &
    Partial<Pick<RefundOperationsDependencies, 'options'>>,
  clock: () => Date = () => new Date(),
) {
  const policy = dependencies.options
    ? structuredClone(refundOperationsOptions.parse(dependencies.options))
    : undefined
  return createRefundRecoveryService(
    connection,
    admins,
    refundFundingAccess(connection),
    refundUnitOutcomeAccess(connection),
    composeAuditAccess(connection),
    dependencies.verifyEvidence,
    dependencies.gateway?.client.queryRefund
      ? {
          client: { queryRefund: dependencies.gateway.client.queryRefund },
          merchantAccountKey: dependencies.gateway.merchantAccountKey,
        }
      : undefined,
    refundDecisionNotifier(
      returnNotificationOrderAccess(connection),
      createNotificationService(connection, clock),
      createAuditWriter(connection),
    ),
    clock,
    policy
      ? async (_session, input) => {
          const row = policy.authorizations.find(
            (r) =>
              r.orderId === input.orderId &&
              r.basis === input.basis &&
              r.basisRefId === input.basisRefId,
          )
          if (!row) throw new ApiError('SERVICE_UNAVAILABLE')
          return row.approval
        }
      : undefined,
  )
}

function composeRefundOperationsRoutes(
  connection: Connection,
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    'http' | 'adminAccounts' | 'security' | 'sessions'
  >,
  dependencies: RefundOperationsDependencies,
  clock: () => Date = () => new Date(),
  requestOptions?: {
    access: NonNullable<Parameters<typeof createRefundReservationService>[10]>
    throttle: import('express').RequestHandler
    origin: string
  },
) {
  const options = structuredClone(refundOperationsOptions.parse(dependencies.options))
  if (dependencies.gateway && !/^[a-f0-9]{64}$/.test(dependencies.gateway.merchantAccountKey))
    throw new ApiError('SERVICE_UNAVAILABLE')
  const funding = refundFundingAccess(connection)
  const notify = refundDecisionNotifier(
    returnNotificationOrderAccess(connection),
    createNotificationService(connection, clock),
    createAuditWriter(connection),
  )
  const reservation = createRefundReservationService(
    connection,
    auth.adminAccounts,
    refundClaimSnapshotAccess(connection),
    refundOrderSnapshotAccess(connection),
    refundUnitReservationAccess(connection),
    funding,
    composeAuditAccess(connection),
    async (session, input) => {
      const explicit = options.authorizations.find(
        (r) =>
          r.orderId === input.orderId &&
          r.basis === input.basis &&
          r.basisRefId === input.basisRefId,
      )
      if (explicit) return explicit.approval
      const facts = await funding.list(
        session,
        input.orderId,
        input.basis === 'payment_correction' ? 'payment_correction' : 'merchandise',
      )
      const gateway = facts.sources
        .filter((s) => s.allocatedPoisha > s.heldPoisha + s.completedPoisha)
        .every((s) => s.provider === 'sslcommerz')
      // Original gateway method is the development baseline. Manual fallback still needs protected consent.
      return {
        policyVersion: options.policyVersion,
        method: gateway ? 'gateway' : 'manual_bank',
        consentRequired: !gateway,
        deliveryApproved: false,
      }
    },
    clock,
    notify,
    requestOptions?.access,
  )
  const dispatch = dependencies.gateway
    ? createRefundDispatchService(
        connection,
        auth.adminAccounts,
        funding,
        dependencies.gateway.client,
        composeAuditAccess(connection),
        clock,
        dependencies.gateway.merchantAccountKey,
        notify,
      )
    : undefined
  const recovery = composeRefundRecovery(connection, auth.adminAccounts, dependencies, clock)
  const router = createRefundRoutes(
    createRefundOperationsService(
      connection,
      auth.adminAccounts,
      funding,
      reservation,
      { refundStatusTimelineAccess: refundStatusTimelineAccess(connection) },
      dispatch,
      recovery,
    ),
    auth.security,
    auth.http,
  )
  if (requestOptions)
    router.use(
      createRefundRequestRoutes(
        reservation,
        auth.security,
        requestOptions.throttle,
        requestOptions.origin,
        auth.http,
      ),
    )
  return router
}

async function composeIdentityRoutes(
  connection: Connection,
  config: RuntimeConfig,
  media?: MediaDependencies,
  approvals: readonly PolicyApproval[] = [],
  checkout?: CheckoutOptions,
  channelApprovals: readonly PaymentChannelApproval[] = [],
  paymentGateway?: PaymentInitiationDependencies,
  orderOperations?: OrderOperationsDependencies,
  returnOptions?: ReturnOperationsOptions,
  refunds?: RefundOperationsDependencies,
  afterSalesHistory = false,
  operations?: OperationsOptions,
) {
  const notifications = createNotificationService(connection)
  const auth = await createAuthRuntime(
    connection,
    config,
    notifications,
    guestOrderAccess(connection),
  )
  if (operations) {
    if (!config.CUSTOMER_AUTH_ENABLED || !config.ADMIN_AUTH_ENABLED)
      throw new ApiError('SERVICE_UNAVAILABLE')
    auth.router.use(
      ...composeOperationsRoutes(
        connection,
        config.APP_ENV,
        auth,
        config.STOREFRONT_ORIGIN,
        operations,
        refunds,
      ),
    )
  }
  if (afterSalesHistory) {
    if (!config.CUSTOMER_AUTH_ENABLED || !config.ADMIN_AUTH_ENABLED || !returnOptions)
      throw new ApiError('SERVICE_UNAVAILABLE')
    auth.router.use(...composeAfterSalesHistoryRoutes(connection, config.APP_ENV, auth))
  }
  if (refunds) {
    if (!config.ADMIN_AUTH_ENABLED || !['local', 'test'].includes(config.APP_ENV))
      throw new ApiError('SERVICE_UNAVAILABLE')
    auth.router.use(
      composeRefundOperationsRoutes(
        connection,
        auth,
        refunds,
        undefined,
        config.CUSTOMER_AUTH_ENABLED && returnOptions
          ? {
              access: {
                ownedOrder: refundRequestOrderAccess(connection),
                scope: orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts),
                claimSelection: refundClaimSelectionAccess(connection),
                qualifiedClosed: closedRefundRequestAccess(connection),
              },
              throttle: auth.throttle.middleware('customer', 'checkout'),
              origin: config.STOREFRONT_ORIGIN,
            }
          : undefined,
      ),
    )
  }
  if (returnOptions) {
    if (
      !config.CUSTOMER_AUTH_ENABLED ||
      !config.ADMIN_AUTH_ENABLED ||
      !['local', 'test'].includes(config.APP_ENV)
    )
      throw new ApiError('SERVICE_UNAVAILABLE')
    auth.router.use(
      ...composeReturnOperationsRoutes(
        connection,
        auth,
        config.STOREFRONT_ORIGIN,
        returnOptions,
        media,
      ),
    )
  }

  if (orderOperations) {
    if (
      !config.CUSTOMER_AUTH_ENABLED ||
      !config.ADMIN_AUTH_ENABLED ||
      !config.CUSTOMER_ORDER_READ_ENABLED
    )
      throw new Error(
        'Reviewed order operations require customer/admin authentication and order reads.',
      )
    auth.router.use(
      ...composeOrderOperationsRoutes(connection, auth, config.STOREFRONT_ORIGIN, orderOperations),
    )
  }
  if (config.CUSTOMER_ORDER_READ_ENABLED && !orderOperations)
    auth.router.use(
      createOrderReadRoutes(
        createOrderReadService(
          connection,
          auth.customerAccounts,
          orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts),
          customerPaymentSummaryAccess(connection),
          orderPolicySnapshotAccess(connection),
          composeOrderReadDependencies(),
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      createCustomerRoutes(
        createCustomerService(auth.customerAccounts, createAddressCoverage(connection)),
        {
          cors: auth.security.cors('storefront'),
          requireBrowser: auth.security.require('storefront', 'customer'),
          requireSession: auth.http.require('customer'),
          readToken: (header) => readSessionCookie(header, 'customer'),
        },
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED && ['local', 'test'].includes(config.APP_ENV))
    auth.router.use(
      createCouponPreviewRoutes(
        createCouponPreviewService(
          connection,
          checkoutAccess(auth.customerAccounts, auth.security),
          catalogCheckoutAccess(connection, {
            schemaPublicHomeSettings: publicHomeSettings,
            schemaStorefrontHome: catalogSchemas.storefrontHome,
          }),
          checkoutDeliveryAccess(connection),
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      createCartRoutes(
        createCartService(
          connection,
          auth.customerAccounts,
          createCatalogService(
            connection,
            createPublicMediaService(connection, media?.provider),
            composeCatalogDependencies(),
          ),
          {
            schemaCartMergeResponse: cartSchemas.cartMergeResponse,
            schemaCartResponse: cartSchemas.cartResponse,
          },
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      createWishlistRoutes(
        createWishlistService(
          connection,
          auth.customerAccounts,
          createCatalogService(
            connection,
            createPublicMediaService(connection, media?.provider),
            composeCatalogDependencies(),
          ),
          { schemaWishlistResponse: wishlistSchemas.wishlistResponse },
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      createInventoryAdminRoutes(
        createInventoryAdminService(
          connection,
          auth.adminAccounts,
          createInventoryService(connection, variantStockAccess(connection)),
          variantInventoryAccess(connection),
          stockSettingsReader(connection),
          createAuditWriter(connection),
          {
            schemaAdjustmentResult: inventorySchemas.adjustmentResult,
            schemaInventoryFacet: inventorySchemas.inventoryFacet,
            schemaInventoryList: inventorySchemas.inventoryList,
          },
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      createCouponAdminRoutes(
        createCouponAdminService(connection, auth.adminAccounts, createAuditWriter(connection)),
        auth.security,
        auth.http,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED && ['local', 'test'].includes(config.APP_ENV)) {
    auth.router.use(
      createPaymentMatchingRoutes(
        createPaymentMatchingService(
          connection,
          auth.adminAccounts,
          verifiedFundingOrderAccess(connection),
          createVerifiedAllocationService(
            composeAuditAccess(connection),
            composeAllocationDependencies(connection),
          ),
          composeAuditAccess(connection),
          {
            createCorrectionObligationService: createCorrectionObligationService.bind(
              undefined,
              connection,
            ),
          },
          config.PAYMENT_MATCHING_EVIDENCE_FILE
            ? protectedPaymentMatchingEvidence(config.PAYMENT_MATCHING_EVIDENCE_FILE)
            : undefined,
        ),
        auth.security,
        auth.http,
      ),
    )
    auth.router.use(
      createPaymentMonitorRoutes(
        createPaymentMonitorService(
          connection,
          auth.adminAccounts,
          composeAuditAccess(connection),
          {
            paymentAuditAccess: paymentAuditAccess(connection),
            correctionMonitoringAccess: correctionMonitoringAccess(connection),
          },
        ),
        auth.security,
        auth.http,
      ),
    )
    const orderAccess = verifiedFundingOrderAccess(connection)
    const settlement = createPaymentSettlementService(
      connection,
      orderAccess,
      createVerifiedAllocationService(
        composeAuditAccess(connection),
        composeAllocationDependencies(connection),
      ),
      composeAuditAccess(connection),
    )
    auth.router.use(
      createPaymentRiskRoutes(
        createPaymentRiskService(
          connection,
          auth.adminAccounts,
          orderAccess,
          settlement,
          composeAuditAccess(connection),
        ),
        auth.security,
        auth.http,
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
      createMediaRoutes(
        mediaService,
        auth.security,
        auth.http,
        media.policy.maxBytes,
        auth.throttle.middleware('admin', 'media'),
      ),
    )
  }
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      createCategoryAdminRoutes(
        createCategoryAdminService(
          connection,
          auth.adminAccounts,
          createAuditWriter(connection),
          mediaService,
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      createProductAdminRoutes(
        createProductAdminService(
          connection,
          auth.adminAccounts,
          createAuditWriter(connection),
          mediaService,
        ),
        auth.security,
        auth.http,
      ),
    )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(
      createDeliveryRoutes(
        createDeliveryService(
          connection,
          auth.adminAccounts,
          deliverySettingsGuard(connection),
          createAuditWriter(connection),
        ),
        {
          cors: auth.security.cors('admin'),
          requireBrowser: auth.security.require('admin', 'admin'),
          requireSession: auth.http.require('admin'),
          readToken: (header) => readSessionCookie(header, 'admin'),
        },
      ),
    )
  const settings = createSettingService(
    connection,
    auth.adminAccounts,
    createAuditWriter(connection),
    mediaService,
  )
  const policies = createPolicyService(
    connection,
    auth.adminAccounts,
    createAuditWriter(connection),
    approvals,
  )
  if (config.ADMIN_AUTH_ENABLED)
    auth.router.use(createSettingAdminRoutes(settings, policies, auth.security, auth.http))
  auth.router.use(
    createPaymentMethodsRoutes(
      createPaymentMethodsService(
        connection,
        {
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
        },
        { schemaPaymentChannels: paymentChannels },
      ),
      [config.STOREFRONT_ORIGIN],
      auth.http,
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
      allocation = createPaymentAllocationService(
        allocationOrder,
        composeAuditAccess(connection),
        composeAllocationDependencies(connection),
        clock,
      )
    const channel = paymentInitiationChannelAccess(
      settings,
      channelApprovals,
      { schemaPaymentChannels: paymentChannels },
      clock,
    )
    const initiation = createPaymentInitiationService(
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
      composeAuditAccess(connection),
      clock,
      paymentGateway.reconciliationGateway
        ? createPaymentRetryService(
            connection,
            paymentGateway.reconciliationGateway,
            verifiedFundingOrderAccess(connection),
            createVerifiedAllocationService(
              composeAuditAccess(connection),
              composeAllocationDependencies(connection),
              clock,
            ),
            composeAuditAccess(connection),
            composePaymentOutcomeDependencies(connection),
            clock,
          )
        : undefined,
    )
    auth.router.use(
      createPaymentInitiationRoutes(
        initiation,
        auth.security,
        auth.throttle.middleware('customer', 'checkout'),
        config.STOREFRONT_ORIGIN,
        auth.http,
      ),
    )
  }
  if (checkout) {
    if (!config.CUSTOMER_AUTH_ENABLED)
      throw new Error('Customer authentication required for checkout quotes.')
    const access = checkoutAccess(auth.customerAccounts, auth.security)
    const quotes = createCheckoutQuoteService(
      connection,
      access,
      {
        catalog: catalogCheckoutAccess(connection, {
          schemaPublicHomeSettings: publicHomeSettings,
          schemaStorefrontHome: catalogSchemas.storefrontHome,
        }),
        delivery: checkoutDeliveryAccess(connection),
        settings: checkoutSettingsAccess(connection, checkout.requiredPolicyTypes),
        deadline: createDeliveryDeadlineService(checkout.deadline),
        coupon: couponQuoteAccess(connection),
        methods: paymentEligibility(
          { schemaPaymentChannels: paymentChannels },
          verifiedMerchantChannels(channelApprovals),
        ),
      },
      {
        quoteTtlSeconds: checkout.quoteTtlSeconds,
        requiredPolicyTypes: checkout.requiredPolicyTypes,
      },
      {
        calculatePricing: calculatePricing,
        schemaCheckoutCommercialSnapshot: checkoutSchemas.checkoutCommercialSnapshot,
        schemaCheckoutQuote: checkoutSchemas.checkoutQuote,
        schemaCheckoutQuoteInput: checkoutSchemas.checkoutQuoteInput,
        schemaCheckoutSubmitInput: checkoutSchemas.checkoutSubmitInput,
        schemaNormalizedCheckoutDraft: checkoutSchemas.normalizedCheckoutDraft,
      },
    )
    auth.router.use(
      createCheckoutRoutes(
        quotes,
        auth.security,
        auth.throttle.middleware('customer', 'checkout'),
        checkout.codEnabled
          ? createCheckoutIntentService(
              connection,
              access,
              quotes,
              createCheckoutCompletionService(composeAuditAccess(connection), {
                checkoutPaymentAccess: checkoutPaymentAccess(connection),
                createNotificationService: createNotificationService.bind(undefined, connection),
                createOrderAllocationService: (stock, access, clock) =>
                  createOrderAllocationService(
                    stock,
                    access,
                    {
                      createCouponAllocationService: createCouponAllocationService.bind(
                        undefined,
                        connection,
                      ),
                      schemaOrderAllocationBinding: orderAllocationBindingSchema,
                    },
                    clock,
                  ),
                createAllocationService: createAllocationService.bind(
                  undefined,
                  connection,
                  undefined,
                ),
                initialOrderAllocationAccess: initialOrderAllocationAccess(connection),
                checkoutOrderReadAccess: checkoutOrderReadAccess(connection),
                createOrderService: (checkout, audit, clock) =>
                  createOrderService(
                    connection,
                    checkout,
                    audit,
                    {
                      checkoutCommercialDigest: (raw) =>
                        checkoutCommercialDigest(raw, {
                          schemaCheckoutCommercialSnapshot:
                            checkoutSchemas.checkoutCommercialSnapshot,
                        }),
                      calculatePricing: calculatePricing,
                      schemaOrderCreationProof: orderSchemas.orderCreationProof,
                    },
                    clock,
                  ),
              }),
              {
                schemaCheckoutSubmitInput: checkoutSchemas.checkoutSubmitInput,
                checkoutSubmissionFingerprint: checkoutIntentSchemas.checkoutSubmissionFingerprint,
                schemaCheckoutOrderOutcome: checkoutIntentSchemas.checkoutOrderOutcome,
              },
            )
          : undefined,
        auth.http,
        {
          schemaCheckoutSubmitInput: checkoutSchemas.checkoutSubmitInput,
          schemaCheckoutSubmitResult: checkoutIntentSchemas.checkoutSubmitResult,
        },
      ),
    )
  }
  return auth.router
}

async function composeApplication(
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
  orderOperations?: OrderOperationsDependencies,
  returnOptions?: ReturnOperationsOptions,
  refunds?: RefundOperationsDependencies,
  afterSalesHistory = false,
  operations?: OperationsOptions,
) {
  if (
    operations &&
    (!config.CUSTOMER_AUTH_ENABLED ||
      !config.ADMIN_AUTH_ENABLED ||
      !['local', 'test'].includes(config.APP_ENV))
  )
    throw new ApiError('SERVICE_UNAVAILABLE')
  if (
    afterSalesHistory &&
    (!config.CUSTOMER_AUTH_ENABLED || !config.ADMIN_AUTH_ENABLED || !returnOptions)
  )
    throw new ApiError('SERVICE_UNAVAILABLE')
  if (refunds && !config.ADMIN_AUTH_ENABLED) throw new ApiError('SERVICE_UNAVAILABLE')
  if (returnOptions && (!config.CUSTOMER_AUTH_ENABLED || !config.ADMIN_AUTH_ENABLED))
    throw new ApiError('SERVICE_UNAVAILABLE')
  if (orderOperations && (!config.CUSTOMER_AUTH_ENABLED || !config.ADMIN_AUTH_ENABLED))
    throw new Error('Customer/admin authentication required for order operations.')
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
          orderOperations,
          returnOptions,
          refunds,
          afterSalesHistory,
          operations,
        )
      : undefined
  const unavailable = async (): Promise<never> => {
    throw new ApiError('AUTH_REQUIRED')
  }
  const publicAccess = { owned: unavailable }
  const images = createPublicMediaService(connection, media?.provider)
  const settings = createSettingService(connection, publicAccess, unavailable)
  const policies = createPolicyService(connection, publicAccess, unavailable)
  const catalog = createCatalogRoutes(
    createCatalogService(connection, images, composeCatalogDependencies(), {
      settings: storefrontSettingsAccess(connection, images),
      policies: policies.publicLinks,
    }),
    config.CORS_ALLOWED_ORIGINS,
  )
  const content = createSettingPublicRoutes(settings, policies, config.CORS_ALLOWED_ORIGINS)
  const apiRouter = createApiRouter(health, [
    createDeliveryAreaRoutes(deliveryAreasAccess(connection), config.CORS_ALLOWED_ORIGINS),
    catalog,
    content,
    ...(!identity
      ? [
          createPaymentMethodsRoutes(
            createPaymentMethodsService(
              connection,
              {
                access: publicAccess,
                order: paymentMethodOrderAccess(connection),
                settings: paymentChannelSettingsAccess(connection),
                verified: verifiedMerchantChannels(channelApprovals),
              },
              { schemaPaymentChannels: paymentChannels },
            ),
            [config.STOREFRONT_ORIGIN],
            sessionCookies,
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
      ? createPaymentProcessingService(
          connection,
          createPaymentVerificationService(
            connection,
            callbacks.verificationGateway,
            createHash('sha256').update(`${options.mode}\0${options.storeId}`).digest('hex'),
          ),
          verifiedFundingOrderAccess(connection),
          createVerifiedAllocationService(
            composeAuditAccess(connection),
            composeAllocationDependencies(connection),
            clock,
          ),
          composeAuditAccess(connection),
          composePaymentOutcomeDependencies(connection),
          clock,
        ).process
      : callbacks.process
    providerCallbacks = createPaymentCallbackRoutes(
      createPaymentCallbackService(
        connection,
        options,
        config.SESSION_SECRET,
        composeAuditAccess(connection),
        process,
      ),
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

async function composeNotificationWorker(
  connection: Connection,
  config: RuntimeConfig,
  options:
    | ReturnType<typeof loadNotificationWorker>
    | {
        adapter: EmailAdapter
        settings: RetryPolicy
        paymentsEnabled?: boolean
        commerceEnabled?: boolean
        afterSalesEnabled?: boolean
      },
) {
  const { settings } = options
  const afterSalesEnabled = 'afterSalesEnabled' in options && options.afterSalesEnabled === true
  if (afterSalesEnabled && !['local', 'test'].includes(config.APP_ENV))
    throw new Error('After-sales notifications require local/test activation')
  const paymentsEnabled = 'paymentsEnabled' in options && options.paymentsEnabled === true
  const commerceEnabled = 'commerceEnabled' in options && options.commerceEnabled === true
  if (commerceEnabled && !['local', 'test'].includes(config.APP_ENV))
    throw new Error('Order delivery requires reviewed local/test activation')
  if (paymentsEnabled && !['local', 'test'].includes(config.APP_ENV))
    throw new Error('Payment notification delivery requires reviewed local/test activation')
  const adapter = 'adapter' in options ? options.adapter : createResendAdapter(options.email)
  const store = createNotificationService(connection)
  await store.verifyIndexes()
  const delivery = composeProofDeliveries(connection, config.identity, guestOrderAccess(connection))
  return createNotificationDeliveryService(
    store,
    adapter,
    settings,
    undefined,
    delivery.reset,
    delivery.emailChange,
    delivery.adminReset,
    delivery.guest,
    paymentsEnabled
      ? createPaymentMessageService(
          paymentNotificationAccess(
            connection,
            verifiedFundingOrderAccess(connection).notificationTarget,
          ),
        )
      : undefined,
    commerceEnabled ? createOrderMessageService(orderNotificationAccess(connection)) : undefined,
    afterSalesEnabled
      ? createReturnMessageService(
          returnNotificationProofAccess(
            connection,
            returnNotificationOrderAccess(connection),
            composeAuditAccess(connection),
          ),
        )
      : undefined,
    afterSalesEnabled
      ? createRefundMessageService(
          refundNotificationProofAccess(
            connection,
            returnNotificationOrderAccess(connection),
            composeAuditAccess(connection),
          ),
        )
      : undefined,
    delivery.verify,
  )
}

async function composeConfiguredApplication(
  connection: Connection,
  config: RuntimeConfig,
  health: HealthDependencies,
  logger: Logger,
  environment: NodeJS.ProcessEnv,
) {
  const initiationOptions = loadPaymentInitiationOptions(environment)
  const initiationGateway = initiationOptions
    ? createSslcommerzAdapter(initiationOptions)
    : undefined
  const callbackOptions = loadPaymentCallbackOptions(environment)
  const processingOptions = loadPaymentProcessingOptions(environment)
  const orderOperations = await loadOrderOperationsOptions(environment)
  const refundOptions = await loadRefundOperationsOptions(environment)
  const refundGateway = refundOptions ? loadSslcommerzOptions(environment) : undefined
  const returnOptions = await loadReturnOperationsOptions(environment)
  return composeApplication(
    connection,
    config,
    health,
    logger,
    returnOptions ? configuredReturnMedia(environment) : configuredPublicMedia(environment),
    await loadPolicyApprovals(environment),
    await loadCheckoutOptions(environment),
    await loadPaymentChannelApprovals(environment),
    initiationGateway
      ? {
          gateway: initiationGateway,
          reconciliationGateway: initiationGateway,
          validateRequest: (input) => initiationInput.safeParse(input).success,
        }
      : undefined,
    callbackOptions
      ? {
          options: callbackOptions,
          ...(processingOptions
            ? { verificationGateway: createSslcommerzAdapter(processingOptions) }
            : {}),
        }
      : undefined,
    orderOperations ? configuredOrderOperations(connection, orderOperations) : undefined,
    returnOptions,
    refundOptions
      ? {
          options: refundOptions,
          ...(environment.REFUND_PAYOUT_EVIDENCE_FILE
            ? { verifyEvidence: protectedRefundEvidence(environment.REFUND_PAYOUT_EVIDENCE_FILE) }
            : {}),
          ...(refundGateway
            ? {
                gateway: {
                  client: createSslcommerzAdapter(refundGateway),
                  merchantAccountKey: createHash('sha256')
                    .update(`${refundGateway.mode}\0${refundGateway.storeId}`)
                    .digest('hex'),
                },
              }
            : {}),
        }
      : undefined,
    loadAfterSalesHistory(environment),
    loadOperationsOptions(environment),
  )
}

function composeCatalogDependencies(): Parameters<typeof createCatalogService>[2] {
  return {
    schemaPublicHomeSettings: publicHomeSettings,
    schemaStorefrontHome: catalogSchemas.storefrontHome,
  }
}

function composePaymentOutcomeDependencies(
  connection: Connection,
): Parameters<typeof createPaymentRetryService>[5] {
  return {
    createNotificationService: createNotificationService.bind(undefined, connection),
    createCorrectionObligationService: createCorrectionObligationService.bind(
      undefined,
      connection,
    ),
  }
}

function composeAllocationDependencies(
  connection: Connection,
): Parameters<typeof createCancellationAllocationService>[0] {
  return {
    createAllocationService: createAllocationService.bind(undefined, connection, undefined),
    couponGenerationAccess: couponGenerationAccess(connection),
    createCouponAllocationService: createCouponAllocationService.bind(undefined, connection),
    schemaOrderAllocationBinding: orderAllocationBindingSchema,
  }
}

function composeOrderReadDependencies(): Parameters<typeof createOrderReadService>[5] {
  return {
    schemaAdminOrderDetail: orderReadSchemas.adminOrderDetail,
    schemaAdminOrderQuery: orderReadSchemas.adminOrderQuery,
    schemaCustomerDeliveryEvents: orderReadSchemas.customerDeliveryEvents,
    schemaCustomerOrderDetail: orderReadSchemas.customerOrderDetail,
    schemaCustomerPaymentHistory: orderReadSchemas.customerPaymentHistory,
    schemaOrderReadSummary: orderReadSchemas.orderReadSummary,
    schemaOrderStatusView: orderReadSchemas.orderStatusView,
  }
}

// Contract generation and outside-src fixtures consume the same assembled validators as the app.

export type {
  OrderOperationsDependencies,
  PaymentCallbackDependencies,
  PaymentInitiationDependencies,
  RefundOperationsDependencies,
}
export {
  cartSchemas,
  catalogSchemas,
  checkoutIntentSchemas,
  checkoutSchemas,
  composeAfterSalesHistoryRoutes,
  composeApplication,
  composeConfiguredApplication,
  composeIdentityRoutes,
  composeLocalReviewRoutes,
  composeNotificationWorker,
  composeOperationsRoutes,
  composeOrderOperationsRoutes,
  composeRefundOperationsRoutes,
  composeRefundRecovery,
  composeReturnOperationsRoutes,
  configuredOrderOperations,
  configuredPublicMedia,
  configuredReturnMedia,
  inventorySchemas,
  orderAllocationBindingSchema,
  orderReadSchemas,
  orderSchemas,
  reportSchemas,
  wishlistSchemas,
}

import { guestOrderAccess } from './modules/orders/order.service.js'
import { auditOperationReader } from './modules/audit/audit.service.js'
import { createSessionHttp, readSessionCookie } from './modules/auth/sessions/session.http.js'
import {
  refundRequestOrderAccess,
  closedRefundRequestAccess,
} from './modules/orders/order.service.js'
import { refundRequestRoutes } from './modules/refunds/refund-request.routes.js'
import { refundClaimSelectionAccess } from './modules/returns/return.service.js'
import { paymentMatchingRoutes } from './modules/payments/payment-matching.routes.js'
import {
  paymentMatchingService,
  protectedPaymentMatchingEvidence,
} from './modules/payments/payment-matching.service.js'
import { couponPreviewRoutes } from './modules/promotions/coupon-preview.routes.js'
import { couponPreviewService } from './modules/promotions/coupon.service.js'
import type { OperationsOptions } from './config/operations.js'
import { reportService, operationalQueueService } from './modules/reports/report.service.js'
import { reportRoutes } from './modules/reports/report.routes.js'
import {
  orderReportAccess,
  customerAdminOrderHistoryAccess,
  stockExceptionQueueAccess,
  deliveryExceptionRefundSnapshotAccess,
} from './modules/orders/order.service.js'
import {
  paymentReportAccess,
  paymentExceptionQueueAccess,
} from './modules/payments/payment.service.js'
import {
  refundReportAccess,
  refundExceptionQueueAccess,
} from './modules/refunds/refund-history.service.js'
import { catalogReportAccess } from './modules/catalog/products/product.service.js'
import { reportThresholdAccess } from './modules/settings/settings.service.js'
import { returnReportAccess } from './modules/returns/return.service.js'
import { customerAdministrationAccess } from './modules/auth/auth.composition.js'
import { customerAdminRoutes } from './modules/customers/customer-admin.routes.js'
import { complaintService } from './modules/support/complaint.service.js'
import { supportReadRoutes } from './modules/support/support-read.routes.js'
import { supportRoutes } from './modules/support/support.routes.js'
import { auditQueryService } from './modules/audit/audit-query.service.js'
import { deliveryExceptionService } from './modules/orders/delivery-exception.service.js'
import { recoveryReceiptService } from './modules/inventory/recovery-receipt.service.js'
import { notificationAdminService } from './modules/notifications/notification-admin.service.js'
import { refundHistoryService } from './modules/refunds/refund-history.service.js'
import { refundHistoryRoutes } from './modules/refunds/refund-history.routes.js'
import { customerOrderHistoryAccess } from './modules/orders/order.service.js'
import { returnMessageService } from './modules/notifications/return-message.service.js'
import { returnNotificationProofAccess } from './modules/returns/return.service.js'
import {
  refundRecoveryService,
  refundNotificationProofAccess,
} from './modules/refunds/refund-recovery.service.js'
import type { RefundOutcomeVerifier } from './modules/refunds/refund-outcome.schema.js'
import {
  refundDecisionNotifier,
  refundMessageService,
} from './modules/notifications/refund-message.service.js'
import { refundUnitOutcomeAccess } from './modules/orders/order.service.js'
import { refundOperationsOptions, type RefundOperationsOptions } from './config/refunds.js'
import { refundRoutes } from './modules/refunds/refund.routes.js'
import { refundOperationsService } from './modules/refunds/refund-operations.service.js'
import { refundReservationService } from './modules/refunds/refund-reservation.service.js'
import { refundDispatchService } from './modules/refunds/refund-dispatch.service.js'
import { refundClaimSnapshotAccess } from './modules/returns/return.service.js'
import { refundOrderSnapshotAccess } from './modules/orders/order.service.js'
import { loadMediaConfiguration } from './config/media.js'
import { createCloudinaryAdapter } from './providers/cloudinary/cloudinary.client.js'
import { createClamAvScanner } from './providers/antivirus/clamav.client.js'
import type { Connection } from 'mongoose'
import { Types } from 'mongoose'
import { createHash } from 'node:crypto'
import { createApp } from './app.js'
import type { CheckoutOptions } from './config/checkout.js'
import type { RuntimeConfig } from './config/env.js'
import type { loadNotificationWorker } from './config/notifications.js'
import type { OrderOperationsOptions } from './config/order-operations.js'
import type { ReturnOperationsOptions } from './config/returns.js'
import type { PolicyApproval } from './config/settings.js'
import {
  createAuditWriter,
  orderAuditRefsAccess,
  reviewModerationReceiptAccess,
} from './modules/audit/audit.service.js'
import { composeProofDeliveries, createAuthRuntime } from './modules/auth/auth.composition.js'
import {
  checkoutAccess,
  orderScopeAccess,
  paymentInitiationAuthAccess,
  paymentMethodAccess,
} from './modules/auth/checkout-access.service.js'
import { createPaymentCallbackThrottle } from './modules/auth/sessions/auth-throttle.service.js'
import { cartRoutes } from './modules/cart/cart.routes.js'
import { cartService } from './modules/cart/cart.service.js'
import { wishlistRoutes } from './modules/cart/wishlist.routes.js'
import { wishlistService } from './modules/cart/wishlist.service.js'
import { catalogRoutes } from './modules/catalog/catalog.routes.js'
import {
  catalogCheckoutAccess,
  catalogReviewVisibility,
  catalogService,
} from './modules/catalog/catalog.service.js'
import { categoryAdminRoutes } from './modules/catalog/categories/category-admin.routes.js'
import { categoryAdminService } from './modules/catalog/categories/category-admin.service.js'
import { productAdminRoutes } from './modules/catalog/products/product-admin.routes.js'
import { productAdminService } from './modules/catalog/products/product-admin.service.js'
import { productReviewAccess } from './modules/catalog/products/product.service.js'
import {
  variantInventoryAccess,
  variantStockAccess,
} from './modules/catalog/variants/variant.service.js'
import { cancellationAllocationService } from './modules/checkout/cancellation-allocation.service.js'
import { checkoutCompletion } from './modules/checkout/checkout-completion.service.js'
import { checkoutIntentService } from './modules/checkout/checkout-intent.service.js'
import {
  checkoutQuoteService,
  orderPolicySnapshotAccess,
} from './modules/checkout/checkout-quote.service.js'
import { checkoutRoutes } from './modules/checkout/checkout.routes.js'
import { fulfillmentAllocationService } from './modules/checkout/fulfillment-allocation.service.js'
import { paymentAllocationService } from './modules/checkout/payment-allocation.service.js'
import { verifiedAllocationService } from './modules/checkout/verified-allocation.service.js'
import { profileRoutes } from './modules/customers/customer.routes.js'
import { createProfileService } from './modules/customers/customer.service.js'
import {
  checkoutDeliveryAccess,
  createAddressCoverage,
  deliveryAreasAccess,
} from './modules/delivery/delivery-coverage.service.js'
import { deliveryAreaRoutes, deliveryRoutes } from './modules/delivery/delivery.routes.js'
import { deliveryService } from './modules/delivery/delivery.service.js'
import type { HealthDependencies } from './health/health.service.js'
import { allocationService } from './modules/inventory/allocation.service.js'
import { inventoryAdminRoutes } from './modules/inventory/inventory-admin.routes.js'
import { inventoryAdminService } from './modules/inventory/inventory-admin.service.js'
import { inventoryService } from './modules/inventory/inventory.service.js'
import { returnReceiptService } from './modules/inventory/return-receipt.service.js'
import { claimEvidenceMetadataAccess } from './modules/media/claim-evidence.service.js'
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
import { orderMessageService } from './modules/notifications/order-message.service.js'
import { paymentMessageService } from './modules/notifications/payment-message.service.js'
import { returnDecisionNotifier } from './modules/notifications/return-message.service.js'
import { cancellationRoutes } from './modules/orders/cancellation.routes.js'
import { cancellationService } from './modules/orders/cancellation.service.js'
import {
  createDeliveryDeadlineService,
  deliveryDeadlineApprovalAccess,
} from './modules/orders/delivery-deadline.service.js'
import { orderAdminRoutes } from './modules/orders/order-admin.routes.js'
import { orderLifecycleService } from './modules/orders/order-lifecycle.service.js'
import { orderNotificationAccess } from './modules/orders/order-notification.service.js'
import { orderReadRoutes } from './modules/orders/order-read.routes.js'
import { orderReadService } from './modules/orders/order-read.service.js'
import {
  cancellationRefundSnapshotAccess,
  claimEligibilitySnapshotAccess,
  claimQuantityAccess,
  claimRestockAccess,
  claimReviewQuantityAccess,
  codCollectionOrderAccess,
  complaintOrderAccess,
  paymentAllocationOrderAccess,
  paymentInitiationOrderData,
  paymentMethodOrderAccess,
  refundUnitReservationAccess,
  returnNotificationOrderAccess,
  reviewPurchaseEligibilityAccess,
  verifiedFundingOrderAccess,
} from './modules/orders/order.service.js'
import { codCollectionService } from './modules/payments/cod-collection.service.js'
import { protectedCodCollectionEvidence } from './modules/payments/cod-evidence.service.js'
import { paymentCallbackRoutes } from './modules/payments/payment-callback.routes.js'
import {
  paymentCallbackOptions,
  type PaymentCallbackOptions,
} from './modules/payments/payment-callback.schema.js'
import {
  paymentCallbackService,
  type PaymentCallbackProcessor,
} from './modules/payments/payment-callback.service.js'
import type { PaymentChannelApproval } from './modules/payments/payment-eligibility.schema.js'
import {
  paymentEligibility,
  paymentInitiationChannelAccess,
  verifiedMerchantChannels,
} from './modules/payments/payment-eligibility.service.js'
import { paymentInitiationRoutes } from './modules/payments/payment-initiation.routes.js'
import { paymentInitiationService } from './modules/payments/payment-initiation.service.js'
import { paymentMethodsRoutes } from './modules/payments/payment-methods.routes.js'
import { paymentMethodsService } from './modules/payments/payment-methods.service.js'
import { paymentMonitorRoutes } from './modules/payments/payment-monitor.routes.js'
import { paymentMonitorService } from './modules/payments/payment-monitor.service.js'
import { paymentNotificationAccess } from './modules/payments/payment-notification.service.js'
import { paymentProcessingService } from './modules/payments/payment-processing.service.js'
import { paymentRetryService } from './modules/payments/payment-retry.service.js'
import { paymentRiskRoutes } from './modules/payments/payment-risk.routes.js'
import { paymentRiskService } from './modules/payments/payment-risk.service.js'
import { paymentSettlementService } from './modules/payments/payment-settlement.service.js'
import { paymentVerificationService } from './modules/payments/payment-verification.service.js'
import {
  cancellationPaymentAccess,
  customerPaymentSummaryAccess,
  fulfillmentPaymentAccess,
  paymentInitiationEligibilityAccess,
  refundFundingAccess,
} from './modules/payments/payment.service.js'
import { couponAdminRoutes } from './modules/promotions/coupon-admin.routes.js'
import { couponAdminService } from './modules/promotions/coupon-admin.service.js'
import { couponQuoteAccess } from './modules/promotions/coupon.service.js'
import { cancellationRefundService } from './modules/refunds/cancellation-refund.service.js'
import { returnEligibilityService } from './modules/returns/return-eligibility.service.js'
import { returnHistoryRoutes } from './modules/returns/return-history.routes.js'
import { returnHistoryService } from './modules/returns/return-history.service.js'
import { returnLifecycleService } from './modules/returns/return-lifecycle.service.js'
import { returnOperationsService } from './modules/returns/return-operations.service.js'
import { returnPhysicalService } from './modules/returns/return-physical.service.js'
import { returnRoutes } from './modules/returns/return.routes.js'
import { reviewQueryService } from './modules/reviews/review-query.service.js'
import { reviewRoutes } from './modules/reviews/review.routes.js'
import { createReviewService } from './modules/reviews/review.service.js'
import {
  checkoutSettingsAccess,
  paymentChannelSettingsAccess,
} from './modules/settings/checkout-settings.service.js'
import { deliverySettingsGuard } from './modules/settings/delivery-settings.service.js'
import { policyService } from './modules/settings/policy.service.js'
import { settingsAdminRoutes, settingsPublicRoutes } from './modules/settings/settings.routes.js'
import { settingsService, storefrontSettingsAccess } from './modules/settings/settings.service.js'
import { stockSettingsReader } from './modules/settings/stock-settings.service.js'
import { createResendAdapter } from './providers/email/resend.client.js'
import type { createSslcommerzAdapter } from './providers/sslcommerz/sslcommerz.client.js'
import { createApiRouter } from './routes.js'
import { ApiError } from './shared/errors/app-error.js'
import type { Logger } from './shared/logger.js'
export type PaymentCallbackDependencies = {
  options: PaymentCallbackOptions
  process?: PaymentCallbackProcessor
  verificationGateway?: Pick<
    ReturnType<typeof createSslcommerzAdapter>,
    'validate' | 'queryTransaction'
  >
  clock?: () => Date
}
export type PaymentInitiationDependencies = {
  reconciliationGateway?: Pick<
    ReturnType<typeof createSslcommerzAdapter>,
    'validate' | 'queryTransaction'
  >
  gateway: Pick<ReturnType<typeof createSslcommerzAdapter>, 'initiate'>
  validateRequest(request: unknown): boolean
  clock?: () => Date
}

// Explicit local/test composition for the owner-delegated return development workflow.
export function configuredReturnMedia(env: NodeJS.ProcessEnv): MediaDependencies | undefined {
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
export function configuredPublicMedia(env: NodeJS.ProcessEnv): MediaDependencies | undefined {
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

export function composeReturnOperationsRoutes(
  connection: Connection,
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
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
  const eligibility = returnEligibilityService(
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
  const history = returnHistoryService(
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
  const lifecycle = returnLifecycleService(
    connection,
    auth.adminAccounts,
    claimReviewQuantityAccess(connection),
    clock,
    returnDecisionNotifier(
      returnNotificationOrderAccess(connection),
      createRegistrationNotifications(connection, clock),
    ),
  )
  const physical = returnPhysicalService(
    connection,
    auth.adminAccounts,
    claimRestockAccess(connection),
    returnReceiptService(connection, clock),
    clock,
  )
  const operations = returnOperationsService(
    connection,
    {
      scope,
      order: snapshot,
      quantities: claimQuantityAccess(connection),
      eligibility,
      history,
      policyVersion: policy.policyVersion,
      administration: { lifecycle, physical },
      ...(media ? { media: mediaFor } : {}),
    },
    clock,
  )
  return [
    returnHistoryRoutes(history, auth.security, auth.sessions),
    returnRoutes(
      operations,
      lifecycle,
      physical,
      history,
      auth.security,
      auth.sessions,
      storefrontOrigin,
      media?.policy.maxBytes ?? 1024,
      auth.throttle.middleware('customer', 'media'),
      async (token, claimId, assetId) => {
        const claim = await history.adminDetail(token, claimId)
        if (!claim.evidence.some((asset) => asset.assetId === assetId))
          throw new ApiError('NOT_FOUND')
        return mediaFor({ customerPresent: false }, claim.orderId).privateUrl(token, assetId, true)
      },
    ),
  ]
}

export type OrderOperationsDependencies = {
  approvedDeadline: NonNullable<Parameters<typeof orderLifecycleService>[4]>
  cashEvidence: NonNullable<Parameters<typeof codCollectionService>[3]> | { receiptFile: string }
  cancellationRefund: NonNullable<Parameters<typeof cancellationService>[5]>
}

export function configuredOrderOperations(
  connection: Connection,
  options: OrderOperationsOptions,
  clock: () => Date = () => new Date(),
): OrderOperationsDependencies {
  const authorizations = structuredClone(options.cancellationAuthorizations)
  return {
    approvedDeadline: deliveryDeadlineApprovalAccess([options.deadline], clock),
    cashEvidence: { receiptFile: options.cashReceiptFile },
    cancellationRefund: cancellationRefundService(
      connection,
      cancellationRefundSnapshotAccess(connection),
      refundUnitReservationAccess(connection),
      refundFundingAccess(connection),
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
        createRegistrationNotifications(connection, clock),
        createAuditWriter(connection),
      ),
    ),
  }
}

// No default policy, cash proof or refund stand-in: the caller supplies protected authorities.
export function composeOrderOperationsRoutes(
  connection: Connection,
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    'customerAccounts' | 'adminAccounts' | 'guestAccounts' | 'sessions' | 'security'
  >,
  storefrontOrigin: string,
  dependencies: OrderOperationsDependencies,
  clock: () => Date = () => new Date(),
) {
  const scope = orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts)
  const stock = allocationService(connection, undefined, clock)
  const reads = orderReadService(
    connection,
    auth.customerAccounts,
    scope,
    customerPaymentSummaryAccess(connection, clock),
    orderPolicySnapshotAccess(connection),
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
  const lifecycle = orderLifecycleService(
    connection,
    auth.adminAccounts,
    fulfillmentPaymentAccess(connection, clock),
    fulfillmentAllocationService(connection, clock),
    dependencies.approvedDeadline,
    clock,
  )
  const cash = codCollectionService(
    connection,
    auth.adminAccounts,
    codCollectionOrderAccess(connection),
    typeof dependencies.cashEvidence === 'function'
      ? dependencies.cashEvidence
      : protectedCodCollectionEvidence(dependencies.cashEvidence.receiptFile, clock),
    clock,
  )
  const cancellation = cancellationService(
    connection,
    scope,
    auth.adminAccounts,
    cancellationAllocationService(connection, clock),
    cancellationPaymentAccess(connection),
    dependencies.cancellationRefund,
    clock,
  )
  return [
    orderReadRoutes(reads, auth.security),
    orderAdminRoutes(reads, lifecycle, cash, auth.security, auth.sessions),
    cancellationRoutes(cancellation, auth.security, auth.sessions, storefrontOrigin),
  ]
}

// Only the root composition coordinates independent domain routers and capabilities.
export function composeLocalReviewRoutes(
  connection: Connection,
  environment: RuntimeConfig['APP_ENV'],
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    'customerAccounts' | 'adminAccounts' | 'adminTransaction' | 'sessions' | 'security'
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
  return reviewRoutes(
    reviewQueryService(
      connection,
      auth.customerAccounts,
      auth.adminAccounts,
      catalogReviewVisibility(connection),
    ),
    reviews,
    auth.security,
    auth.sessions,
  )
}

export function composeAfterSalesHistoryRoutes(
  connection: Connection,
  environment: RuntimeConfig['APP_ENV'],
  auth: Parameters<typeof composeReturnOperationsRoutes>[1],
) {
  if (!['local', 'test'].includes(environment)) throw new ApiError('SERVICE_UNAVAILABLE')
  return [
    composeLocalReviewRoutes(connection, environment, auth),
    refundHistoryRoutes(
      refundHistoryService(
        connection,
        orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts),
        complaintOrderAccess(connection),
        customerOrderHistoryAccess(connection),
      ),
      auth.security,
    ),
  ]
}

export function composeOperationsRoutes(
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
    claims = returnHistoryService(
      connection,
      scope,
      complaintOrderAccess(connection),
      claimEvidenceMetadataAccess(connection),
      auth.adminAccounts,
      customerOrders,
    ),
    history = refundHistoryService(
      connection,
      scope,
      complaintOrderAccess(connection),
      customerOrders,
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
    complaints = complaintService(
      connection,
      scope,
      complaintOrderAccess(connection),
      auth.adminAccounts,
      clock,
      checkoutAccess(auth.customerAccounts, auth.security),
    ),
    notifications = notificationAdminService(connection, auth.adminAccounts, clock),
    funds = refundFundingAccess(connection),
    exceptionRefund = cancellationRefundService(
      connection,
      deliveryExceptionRefundSnapshotAccess(connection),
      refundUnitReservationAccess(connection),
      funds,
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
        createRegistrationNotifications(connection, clock),
        createAuditWriter(connection),
      ),
      'delivery_exception',
    ),
    exceptions = deliveryExceptionService(
      connection,
      auth.adminAccounts,
      cancellationPaymentAccess(connection),
      recoveryReceiptService(connection, clock),
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
    queues = operationalQueueService(auth.adminAccounts, {
      stock: stockExceptionQueueAccess(connection),
      refunds: refundExceptionQueueAccess(connection),
      payments: (session, q) => payments(session, q, false),
      reconciliation: (session, q) => payments(session, q, true),
    })
  return [
    customerAdminRoutes(administration.customers, {
      cors: auth.security.cors('admin'),
      requireBrowser: auth.security.require('admin', 'admin'),
      requireSession: createSessionHttp(auth.sessions).require('admin'),
      readToken: (header) => readSessionCookie(header, 'admin'),
    }),
    supportReadRoutes(
      complaints,
      auditQueryService(connection, auth.adminAccounts),
      auth.security,
      auth.sessions,
    ),
    supportRoutes(
      { complaints, exceptions, notifications, customers: auth.customerAccounts },
      auth.security,
      auth.sessions,
      auth.throttle,
      storefrontOrigin,
    ),
    reportRoutes(
      reportService(
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
        clock,
      ),
      auth.security,
      auth.sessions,
      queues,
    ),
  ]
}

export type RefundOperationsDependencies = {
  options: RefundOperationsOptions
  verifyEvidence?: RefundOutcomeVerifier
  gateway?: {
    client: Pick<ReturnType<typeof createSslcommerzAdapter>, 'initiateRefund'> &
      Partial<Pick<ReturnType<typeof createSslcommerzAdapter>, 'queryRefund'>>
    merchantAccountKey: string
  }
}
export function composeRefundRecovery(
  connection: Connection,
  admins: Parameters<typeof refundRecoveryService>[1],
  dependencies: Pick<RefundOperationsDependencies, 'gateway' | 'verifyEvidence'> &
    Partial<Pick<RefundOperationsDependencies, 'options'>>,
  clock: () => Date = () => new Date(),
) {
  const policy = dependencies.options
    ? structuredClone(refundOperationsOptions.parse(dependencies.options))
    : undefined
  return refundRecoveryService(
    connection,
    admins,
    refundFundingAccess(connection),
    refundUnitOutcomeAccess(connection),
    dependencies.verifyEvidence,
    dependencies.gateway?.client.queryRefund
      ? {
          client: { queryRefund: dependencies.gateway.client.queryRefund },
          merchantAccountKey: dependencies.gateway.merchantAccountKey,
        }
      : undefined,
    refundDecisionNotifier(
      returnNotificationOrderAccess(connection),
      createRegistrationNotifications(connection, clock),
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

export function composeRefundOperationsRoutes(
  connection: Connection,
  auth: Pick<
    Awaited<ReturnType<typeof createAuthRuntime>>,
    'adminAccounts' | 'security' | 'sessions'
  >,
  dependencies: RefundOperationsDependencies,
  clock: () => Date = () => new Date(),
  requestOptions?: {
    access: NonNullable<Parameters<typeof refundReservationService>[9]>
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
    createRegistrationNotifications(connection, clock),
    createAuditWriter(connection),
  )
  const reservation = refundReservationService(
    connection,
    auth.adminAccounts,
    refundClaimSnapshotAccess(connection),
    refundOrderSnapshotAccess(connection),
    refundUnitReservationAccess(connection),
    funding,
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
    ? refundDispatchService(
        connection,
        auth.adminAccounts,
        funding,
        dependencies.gateway.client,
        clock,
        dependencies.gateway.merchantAccountKey,
        notify,
      )
    : undefined
  const recovery = composeRefundRecovery(connection, auth.adminAccounts, dependencies, clock)
  const router = refundRoutes(
    refundOperationsService(
      connection,
      auth.adminAccounts,
      funding,
      reservation,
      dispatch,
      recovery,
    ),
    auth.security,
    auth.sessions,
  )
  if (requestOptions)
    router.use(
      refundRequestRoutes(
        reservation,
        auth.security,
        requestOptions.throttle,
        requestOptions.origin,
      ),
    )
  return router
}

export async function composeIdentityRoutes(
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
  const notifications = createRegistrationNotifications(connection)
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
      orderReadRoutes(
        orderReadService(
          connection,
          auth.customerAccounts,
          orderScopeAccess(auth.customerAccounts, auth.sessions, auth.guestAccounts),
          customerPaymentSummaryAccess(connection),
          orderPolicySnapshotAccess(connection),
        ),
        auth.security,
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED)
    auth.router.use(
      profileRoutes(
        createProfileService(auth.customerAccounts, createAddressCoverage(connection)),
        {
          cors: auth.security.cors('storefront'),
          requireBrowser: auth.security.require('storefront', 'customer'),
          requireSession: createSessionHttp(auth.sessions).require('customer'),
          readToken: (header) => readSessionCookie(header, 'customer'),
        },
      ),
    )
  if (config.CUSTOMER_AUTH_ENABLED && ['local', 'test'].includes(config.APP_ENV))
    auth.router.use(
      couponPreviewRoutes(
        couponPreviewService(
          connection,
          checkoutAccess(auth.customerAccounts, auth.security),
          catalogCheckoutAccess(connection),
          checkoutDeliveryAccess(connection),
        ),
        auth.security,
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
    auth.router.use(
      paymentMatchingRoutes(
        paymentMatchingService(
          connection,
          auth.adminAccounts,
          verifiedFundingOrderAccess(connection),
          verifiedAllocationService(connection),
          config.PAYMENT_MATCHING_EVIDENCE_FILE
            ? protectedPaymentMatchingEvidence(config.PAYMENT_MATCHING_EVIDENCE_FILE)
            : undefined,
        ),
        auth.security,
        auth.sessions,
      ),
    )
    auth.router.use(
      paymentMonitorRoutes(
        paymentMonitorService(connection, auth.adminAccounts),
        auth.security,
        auth.sessions,
      ),
    )
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
        {
          cors: auth.security.cors('admin'),
          requireBrowser: auth.security.require('admin', 'admin'),
          requireSession: createSessionHttp(auth.sessions).require('admin'),
          readToken: (header) => readSessionCookie(header, 'admin'),
        },
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
      paymentGateway.reconciliationGateway
        ? paymentRetryService(
            connection,
            paymentGateway.reconciliationGateway,
            verifiedFundingOrderAccess(connection),
            verifiedAllocationService(connection, clock),
            clock,
          )
        : undefined,
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
  const store = createRegistrationNotifications(connection)
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
      ? paymentMessageService(
          paymentNotificationAccess(
            connection,
            verifiedFundingOrderAccess(connection).notificationTarget,
          ),
        )
      : undefined,
    commerceEnabled ? orderMessageService(orderNotificationAccess(connection)) : undefined,
    afterSalesEnabled
      ? returnMessageService(
          returnNotificationProofAccess(connection, returnNotificationOrderAccess(connection)),
        )
      : undefined,
    afterSalesEnabled
      ? refundMessageService(
          refundNotificationProofAccess(connection, returnNotificationOrderAccess(connection)),
        )
      : undefined,
    delivery.verify,
  )
}

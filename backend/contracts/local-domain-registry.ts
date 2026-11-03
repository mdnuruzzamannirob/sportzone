import { z } from 'zod'
import type { Operation } from './registry.js'
import { paginationSchema } from '../src/shared/pagination.js'
import { orderId } from '../src/modules/orders/order.schema.js'
import {
  adminOrderQuery,
  adminOrderDetail,
  orderReadSummary,
  orderReadQuery,
  customerAdminOrderSummary,
} from '../src/modules/orders/order-read.schema.js'
import { lifecycleInput } from '../src/modules/orders/order-lifecycle.schema.js'
import {
  cancellationInput,
  cancellationDecision,
  cancellationView,
  cancellationQuery,
} from '../src/modules/orders/cancellation.schema.js'
import {
  exceptionInput,
  exceptionResolution,
  exceptionView,
} from '../src/modules/orders/delivery-exception.schema.js'
import {
  codCollectionInput,
  codCollectionSummary,
} from '../src/modules/payments/cod-collection.schema.js'
import {
  claimCommand,
  claimHistoryQuery,
  claimHistoryView,
  claimAdminView,
  claimEligibilityView,
  claimReviewInput,
  claimReceiptInput,
  claimInspectionInput,
  claimCompleteInput,
  claimUploadResult,
  claimPrivateUrl,
} from '../src/modules/returns/return.schema.js'
import { claimEvidenceForm } from '../src/modules/media/media.schema.js'
import { refundGroupInput } from '../src/modules/refunds/refund-reservation.schema.js'
import {
  refundAdminQuery,
  refundAdminView,
  refundAdminDetail,
  refundGroupView,
  refundPayoutInput,
  refundPayoutView,
  refundReconcileView,
  refundReasonInput,
  refundManualInput,
  refundReviewInput,
  refundHistoryQuery,
  refundHistoryView,
  refundOrderHistory,
} from '../src/modules/refunds/refund-api.schema.js'
import {
  customerAdminQuery,
  customerStatusDecision,
  customerStatusResult,
  customerAdminView,
  customerPrivacyView,
  customerPrivacyDecision,
  customerPrivacyResult,
} from '../src/modules/auth/account-management.schema.js'
import {
  reviewCreate,
  reviewEdit,
  reviewModeration,
  reviewView,
  adminReviewView,
  reviewAdminQuery,
} from '../src/modules/reviews/review.schema.js'
import {
  complaintIntakeInput,
  complaintAccepted,
  complaintView,
  complaintResolution,
  complaintAdminQuery,
  complaintAdminDetail,
} from '../src/modules/support/complaint.schema.js'
import {
  notificationAdminQuery,
  notificationAdminView,
  notificationRetryInput,
  notificationRetryResult,
} from '../src/modules/notifications/notification.schema.js'
import { auditQuery, auditView } from '../src/modules/audit/audit-query.schema.js'
import {
  reportQuery,
  reportDashboard,
  salesReport,
  collectionReport,
  refundReport,
  operationalQuery,
  operationalItem,
} from '../src/modules/reports/report.schema.js'
const empty = z.strictObject({})
// Pure transport metadata for real, explicitly local/test-admitted domain routers.
// Every DTO/input is owned by its runtime module; no model or listening application is imported.
function route(
  method: Operation['method'],
  path: string,
  response: z.ZodType,
  options: Partial<Operation> = {},
): Operation {
  const admin = path.startsWith('/admin/')
  return {
    method,
    path,
    response,
    query: empty,
    params: z.strictObject(
      Object.fromEntries(
        [...path.matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => [match[1], orderId]),
      ),
    ),
    access: admin ? 'admin' : 'customer_or_guest',
    namespace: admin ? 'admin' : 'storefront',
    status: 200,
    csrf: method !== 'GET',
    activation:
      'Explicit owning local/test composition with required current sessions, persistence and protected domain authorities; staging/production admission remains gated',
    replay:
      method === 'GET'
        ? 'Read-only current authorized projection'
        : 'Use the owning command replay rules; never automatically retry financial mutations',
    ...options,
  }
}
export const localDomainOperations: readonly Operation[] = [
  route('GET', '/admin/dashboard', reportDashboard, { query: reportQuery }),
  route('GET', '/admin/reports/sales', salesReport, { query: reportQuery }),
  route('GET', '/admin/reports/collections', collectionReport, { query: reportQuery }),
  route('GET', '/admin/reports/refunds', refundReport, { query: reportQuery }),
  route('GET', '/admin/operational-exceptions', z.array(operationalItem), {
    query: operationalQuery,
    paginated: true,
  }),
  route('POST', '/complaints', complaintAccepted, {
    request: complaintIntakeInput,
    access: 'customer_guest_or_context',
    status: 201,
  }),
  route('GET', '/me/complaints', z.array(complaintView), {
    access: 'customer',
    query: paginationSchema,
    paginated: true,
  }),
  route('GET', '/orders/{orderId}/complaints', z.array(complaintView)),
  route('GET', '/admin/complaints/{complaintId}', complaintAdminDetail),
  route('POST', '/admin/complaints/{complaintId}/resolve', complaintView, {
    request: complaintResolution,
    idempotency: true,
  }),
  route('GET', '/admin/orders/{orderId}/delivery-exceptions', z.array(exceptionView)),
  route('POST', '/admin/orders/{orderId}/delivery-exceptions', exceptionView, {
    request: exceptionInput,
    status: 201,
    idempotency: true,
  }),
  route('POST', '/admin/delivery-exceptions/{exceptionId}/resolve', exceptionView, {
    request: exceptionResolution,
    idempotency: true,
  }),
  route('GET', '/admin/notifications', z.array(notificationAdminView), {
    query: notificationAdminQuery,
    paginated: true,
  }),
  route('POST', '/admin/notifications/{notificationId}/retry', notificationRetryResult, {
    request: notificationRetryInput,
    idempotency: true,
  }),
  route('GET', '/admin/customers/{customerId}/orders', z.array(customerAdminOrderSummary), {
    query: orderReadQuery,
    paginated: true,
  }),
  route('GET', '/admin/customers/{customerId}/claims', z.array(claimHistoryView), {
    query: claimHistoryQuery,
    paginated: true,
  }),
  route('GET', '/admin/customers/{customerId}/refunds', z.array(refundHistoryView), {
    query: refundHistoryQuery,
    paginated: true,
  }),
  route('GET', '/admin/customers/{customerId}/deletion-request', customerPrivacyView),
  route('POST', '/admin/customers/{customerId}/deletion-decisions', customerPrivacyResult, {
    request: customerPrivacyDecision,
    idempotency: true,
  }),
  route('GET', '/me/claims', z.array(claimHistoryView), {
    access: 'customer',
    query: claimHistoryQuery,
    paginated: true,
  }),
  route('GET', '/me/refunds', z.array(refundHistoryView), {
    access: 'customer',
    query: refundHistoryQuery,
    paginated: true,
  }),
  route('GET', '/orders/{orderId}/refunds', refundOrderHistory),
  route('GET', '/refunds/{refundId}', refundHistoryView),
  route('GET', '/admin/refunds', z.array(refundAdminView), {
    query: refundAdminQuery,
    paginated: true,
  }),
  route('GET', '/admin/refunds/{refundId}', refundAdminDetail),
  route('POST', '/admin/refund-groups', refundGroupView, {
    request: refundGroupInput,
    status: 201,
    idempotency: true,
  }),
  route('POST', '/admin/refunds/{refundId}/payout-attempts', refundPayoutView, {
    request: refundPayoutInput,
    idempotency: true,
  }),
  route('POST', '/admin/refunds/{refundId}/reconcile', refundReconcileView, {
    request: refundReasonInput,
    idempotency: true,
  }),
  route('POST', '/admin/refunds/{refundId}/manual-confirmations', refundAdminDetail, {
    request: refundManualInput,
    idempotency: true,
  }),
  route('POST', '/admin/refunds/{refundId}/review', refundAdminDetail, {
    request: refundReviewInput,
    idempotency: true,
  }),
  route('GET', '/orders/{orderId}/claim-eligibility', claimEligibilityView),
  route('POST', '/orders/{orderId}/claims', claimHistoryView, {
    request: claimCommand.omit({ claimId: true, orderId: true }),
    status: 201,
    idempotency: true,
  }),
  route('POST', '/orders/{orderId}/claims/evidence-uploads', claimUploadResult, {
    request: claimEvidenceForm,
    multipart: true,
  }),
  route('GET', '/orders/{orderId}/claims/evidence/{assetId}', claimPrivateUrl),
  route('POST', '/admin/claims/{claimId}/review', claimAdminView, {
    request: claimReviewInput,
    idempotency: true,
  }),
  route('POST', '/admin/claims/{claimId}/receipt', claimAdminView, {
    request: claimReceiptInput,
    idempotency: true,
  }),
  route('POST', '/admin/claims/{claimId}/inspection', claimAdminView, {
    request: claimInspectionInput,
    idempotency: true,
  }),
  route('POST', '/admin/claims/{claimId}/complete', claimAdminView, {
    request: claimCompleteInput,
    idempotency: true,
  }),
  route('GET', '/admin/claims/{claimId}/evidence/{assetId}', claimPrivateUrl),
  route('GET', '/admin/orders', z.array(orderReadSummary), {
    query: adminOrderQuery,
    paginated: true,
  }),
  route('GET', '/admin/orders/{orderId}', adminOrderDetail),
  route('POST', '/admin/orders/{orderId}/fulfillment-transitions', adminOrderDetail, {
    request: lifecycleInput,
    idempotency: true,
  }),
  route('POST', '/admin/payments/{paymentId}/cod-collections', codCollectionSummary, {
    request: codCollectionInput,
    idempotency: true,
  }),
  route('GET', '/orders/{orderId}/claims', z.array(claimHistoryView)),
  route('GET', '/claims/{claimId}', claimHistoryView),
  route('GET', '/admin/claims', z.array(claimHistoryView), {
    query: claimHistoryQuery,
    paginated: true,
  }),
  route('GET', '/admin/claims/{claimId}', claimAdminView),
  route('GET', '/admin/complaints', z.array(complaintView), {
    query: complaintAdminQuery,
    paginated: true,
  }),
  route('GET', '/admin/audit-logs', z.array(auditView), { query: auditQuery, paginated: true }),
  route('POST', '/orders/{orderId}/cancellation-requests', cancellationView, {
    request: cancellationInput,
    status: 201,
    idempotency: true,
  }),
  route('GET', '/orders/{orderId}/cancellation-requests', z.array(cancellationView)),
  route('GET', '/admin/cancellation-requests', z.array(cancellationView), {
    query: cancellationQuery,
    paginated: true,
  }),
  route('POST', '/admin/cancellation-requests/{requestId}/decision', cancellationView, {
    request: cancellationDecision,
    idempotency: true,
  }),
  route('GET', '/admin/customers', z.array(customerAdminView), {
    query: customerAdminQuery,
    paginated: true,
  }),
  route('GET', '/admin/customers/{customerId}', customerAdminView),
  route('POST', '/admin/customers/{customerId}/status-decisions', customerStatusResult, {
    request: customerStatusDecision,
    idempotency: true,
  }),
  route('GET', '/products/{productId}/reviews', z.array(reviewView), {
    access: 'public',
    query: paginationSchema,
    paginated: true,
  }),
  route('GET', '/me/reviews', z.array(reviewView), {
    access: 'customer',
    query: paginationSchema,
    paginated: true,
  }),
  route('POST', '/products/{productId}/reviews', reviewView, {
    access: 'customer',
    request: reviewCreate,
    status: 201,
  }),
  route('PATCH', '/reviews/{reviewId}', reviewView, { access: 'customer', request: reviewEdit }),
  route('GET', '/admin/reviews', z.array(adminReviewView), {
    query: reviewAdminQuery,
    paginated: true,
  }),
  route('POST', '/admin/reviews/{reviewId}/moderation', reviewView, {
    request: reviewModeration,
    idempotency: true,
  }),
]

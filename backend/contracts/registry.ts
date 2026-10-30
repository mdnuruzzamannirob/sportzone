import {
  paymentMonitorQuery,
  paymentMonitorPage,
  paymentMonitorList,
  paymentMonitorDetail,
  paymentReconcileInput,
  paymentReconcileResult,
} from '../src/modules/payments/payment-monitor.schema.js'
import {
  paymentRiskParams,
  paymentRiskInput,
  paymentRiskResult,
} from '../src/modules/payments/payment-risk.schema.js'
import {
  paymentIpnForm,
  paymentReturnForm,
  paymentReturnParams,
} from '../src/modules/payments/payment-callback.schema.js'
import {
  paymentInitiationInput,
  paymentInitiationResult,
  paymentInitiationParams,
  paymentAttemptParams,
  paymentAttemptStatus,
} from '../src/modules/payments/payment-initiation.schema.js'
import {
  paymentMethodsQuery,
  paymentMethodsView,
} from '../src/modules/payments/payment-eligibility.schema.js'
import { storefrontHome } from '../src/modules/catalog/catalog.schema.js'
import {
  guestChallengeInput,
  guestExchangeInput,
  guestAccepted,
  guestExchangeView,
  guestSessionView,
  guestLogoutView,
} from '../src/modules/auth/guest-access/guest-access.schema.js'
import { checkoutSubmitResult } from '../src/modules/checkout/checkout-intent.schema.js'
import { deliveryAreasQuery, deliveryAreas } from '../src/modules/delivery/delivery.schema.js'
import {
  checkoutQuoteInput,
  checkoutQuote,
  checkoutSubmitInput,
} from '../src/modules/checkout/checkout.schema.js'
import {
  zoneInput,
  zonePatch,
  zoneView,
  zoneParams,
  zoneQuery,
  chargeInput,
  chargeView,
  chargeQuery,
  chargeParams,
  chargeActivate,
  chargeDeactivate,
  chargeSupersede,
  chargeReplacement,
} from '../src/modules/delivery/delivery.schema.js'
import {
  settingsPatch,
  settingsView,
  publicContact,
} from '../src/modules/settings/settings.schema.js'
import {
  policyDraftInput,
  policyDraftPatch,
  policyParams,
  policyListQuery,
  policyDocument,
  policySummary,
  policyCreated,
  policyApprove,
  policyPublish,
  policyPublication,
  policyPublic,
  policyType,
} from '../src/modules/settings/policy.schema.js'
import {
  productCreate,
  productPatch,
  productDeactivate,
  productParams,
  productListQuery,
  adminProduct,
  adminProductDetail,
} from '../src/modules/catalog/products/product-admin.schema.js'
import {
  variantInput,
  variantPatch,
  variantParams as adminVariantParams,
  variantDeactivate,
} from '../src/modules/catalog/variants/variant.schema.js'
import {
  categoryCreate,
  categoryPatch,
  categoryDeactivate,
  categoryParams,
  categoryListQuery,
  adminCategory,
} from '../src/modules/catalog/categories/category-admin.schema.js'
import { adminVariant } from '../src/modules/catalog/variants/variant.schema.js'
import {
  inventoryQuery,
  movementQuery,
  inventoryParams,
  inventoryList,
  movementView,
  adjustmentBody,
  adjustmentResult,
} from '../src/modules/inventory/inventory-admin.schema.js'
import {
  couponInput,
  couponPatch,
  couponDeactivate,
  couponAdmin,
  couponHistory,
  couponParams,
  couponListQuery,
  couponHistoryQuery,
} from '../src/modules/promotions/coupon-admin.schema.js'
import {
  wishlistParams,
  wishlistResponse,
  wishlistSaved,
} from '../src/modules/cart/wishlist.schema.js'
import {
  cartMerge,
  cartMergeResponse,
  cartQuantity,
  cartResponse,
  variantParams,
} from '../src/modules/cart/cart.schema.js'
import { z } from 'zod'
import { createIdentityContracts } from '../src/modules/auth/auth.schema.js'
import {
  loginInput,
  registrationInput,
} from '../src/modules/auth/credentials/credentials.schema.js'
import { newPasswordPolicy } from '../src/modules/auth/credentials/password.service.js'
import {
  changeInput,
  confirmation,
  issuance,
} from '../src/modules/auth/recovery/password-recovery.schema.js'
import { confirmInput, requestInput } from '../src/modules/auth/verification/email-change.schema.js'
import {
  categoryCard,
  categoryQuery,
  categorySlug,
  productCard,
  productDetail,
  productQuery,
} from '../src/modules/catalog/catalog.schema.js'
import {
  addressInput,
  addressPatch,
  bangladeshPhone,
  deletionInput,
  profilePatch,
} from '../src/modules/customers/customer.schema.js'

// This registry is build tooling, never imported by an HTTP listener. Runtime refinements,
// transactions, area eligibility and cryptography remain owned by their domain services.
const identity = createIdentityContracts({
  newPassword: newPasswordPolicy,
  phone: bangladeshPhone,
  servesArea: () => {
    throw new Error('Coverage cannot be evaluated during contract generation')
  },
})
export type Operation = {
  method: string
  path: string
  access:
    | 'public'
    | 'public_csrf'
    | 'customer'
    | 'admin'
    | 'monitor'
    | 'guest'
    | 'customer_or_guest'
    | 'provider_callback'
  activation: string
  request?: z.ZodType
  response?: z.ZodType
  query: z.ZodType
  params: z.ZodType
  status: number
  replayStatus?: number
  csrf: boolean
  namespace: 'storefront' | 'admin'
  paginated?: boolean
  idempotency?: boolean
  ifMatch?: boolean
  etag?: boolean
  multipart?: boolean
  form?: boolean
  responseFormat?: 'text' | 'redirect'
  replay: string
}
const empty = z.strictObject({})
const runtimeInputs: Record<string, z.ZodType> = {
  'POST /auth/register': registrationInput,
  'POST /auth/login': loginInput,
  'POST /admin/auth/login': loginInput,
  'POST /auth/password-resets': issuance,
  'POST /admin/auth/password-resets': issuance,
  'POST /auth/password-resets/confirm': confirmation,
  'POST /admin/auth/password-resets/confirm': confirmation,
  'POST /me/password-change': changeInput,
  'POST /me/email-changes': requestInput,
  'POST /me/email-changes/confirm': confirmInput,
  'PATCH /me': profilePatch,
  'POST /me/addresses': addressInput,
  'PATCH /me/addresses/{addressId}': addressPatch,
  'POST /me/deletion-requests': deletionInput,
}
const identityActivation = (path: string) => {
  if (path.endsWith('/auth/csrf'))
    return 'CUSTOMER_AUTH_ENABLED or ADMIN_AUTH_ENABLED; guest selection additionally requires GUEST_ACCESS_ENABLED and a verified guest session'
  if (path.startsWith('/admin/'))
    return 'ADMIN_AUTH_ENABLED with validated admin recovery configuration'
  if (path.includes('password-resets') || path.endsWith('password-change'))
    return 'CUSTOMER_AUTH_ENABLED and PASSWORD_RECOVERY_ENABLED'
  if (path.includes('email-changes')) return 'CUSTOMER_AUTH_ENABLED and EMAIL_CHANGE_ENABLED'
  return 'CUSTOMER_AUTH_ENABLED'
}
const identities: Operation[] = identity.operations
  .filter((op) => !op.path.startsWith('/auth/email-verifications'))
  .map((op) => ({
    ...op,
    request: runtimeInputs[`${op.method} ${op.path}`] ?? op.request,
    activation: identityActivation(op.path),
    query: op.path.endsWith('/auth/csrf')
      ? z.strictObject({
          sessionKind: (op.namespace === 'admin'
            ? z.literal('context')
            : z.enum(['context', 'customer', 'guest'])
          ).optional(),
        })
      : op.query,
  }))

export const operations: readonly Operation[] = [
  ...identities,
  {
    method: 'GET',
    path: '/delivery/areas',
    access: 'public',
    namespace: 'storefront',
    query: deliveryAreasQuery,
    params: empty,
    response: deliveryAreas,
    status: 200,
    csrf: false,
    activation:
      'Reviewed delivery indexes and operator-configured currently active coverage; no quote/fulfillment guarantee.',
    replay:
      'Read-only bounded coverage projection; actual destination is revalidated at quote and submission.',
  },
  ...[
    {
      method: 'POST',
      path: '/guest-access/challenges',
      access: 'public_csrf' as const,
      request: guestChallengeInput,
      response: guestAccepted,
      csrf: true,
    },
    {
      method: 'POST',
      path: '/guest-access/sessions',
      access: 'public_csrf' as const,
      request: guestExchangeInput,
      response: guestExchangeView,
      csrf: true,
    },
    {
      method: 'GET',
      path: '/guest-access/session',
      access: 'guest' as const,
      response: guestSessionView,
      csrf: false,
    },
    {
      method: 'POST',
      path: '/guest-access/logout',
      access: 'public_csrf' as const,
      request: z.union([z.undefined(), empty]),
      response: guestLogoutView,
      csrf: true,
    },
  ].map((operation) => ({
    ...operation,
    namespace: 'storefront' as const,
    query: empty,
    params: empty,
    status: 200,
    activation:
      'GUEST_ACCESS_ENABLED with CUSTOMER_AUTH_ENABLED, explicit guest proof/session lifetimes, protected proof key ring/HTTPS storefront and reviewed identity/order/notification/throttle persistence.',
    replay:
      'Non-enumerating rate-limited lookup; single-use email proof exchange grants exact order scope only. Tokens stay in cookies/email, never lookup responses or logs. Revoked/expired/wrong-scope credentials fail closed.',
  })),
  {
    method: 'GET',
    path: '/storefront/home',
    access: 'public',
    namespace: 'storefront',
    query: empty,
    params: empty,
    response: storefrontHome,
    status: 200,
    csrf: false,
    activation:
      'Reviewed catalog/settings/policy persistence. Only active visible SKU/category data and exact attached clean public media references publish; missing configured metadata is omitted.',
    replay:
      'No-store bounded read; current operator settings and approved published policy pointers on each request. No fabricated merchandising fallback.',
  },
  {
    method: 'POST',
    path: '/webhooks/sslcommerz/ipn',
    access: 'provider_callback',
    namespace: 'storefront',
    params: empty,
    query: empty,
    request: paymentIpnForm,
    response: z.literal('OK'),
    status: 200,
    csrf: false,
    form: true,
    responseFormat: 'text',
    activation:
      'PAYMENT_CALLBACKS_ENABLED local/test only, explicit same-storefront return URLs and reviewed audit/quota persistence. Runtime returns 503 until an independent durable processor is composed; no raw notification proves funds.',
    replay:
      'Bounded URL-encoded untrusted claims; only normalized references cross the verifier boundary. 200 text OK only after durable verified outcome/recoverable reconciliation commit. Replays never imply new money; default is retryable 503.',
  },
  ...(['GET', 'POST'] as const).map(
    (method): Operation => ({
      method,
      path: '/payment-returns/sslcommerz/{result}',
      access: 'provider_callback',
      namespace: 'storefront',
      params: paymentReturnParams,
      query: z.record(z.string(), z.string()),
      ...(method === 'POST' ? { request: paymentReturnForm, form: true } : {}),
      status: 303,
      csrf: false,
      responseFormat: 'redirect',
      activation:
        'PAYMENT_CALLBACKS_ENABLED with explicit fixed HTTPS URLs on the configured storefront origin; local/test only pending deployed provider transport qualification.',
      replay:
        'Display hint only. Empty-body 303 strips all provider query/form values; no session/cookie/access or financial state transition. Untrusted success never establishes Paid.',
    }),
  ),
  {
    params: empty,
    csrf: false,
    replay: 'Read only current authorized monitoring projection',
    method: 'GET',
    path: '/admin/payments',
    namespace: 'admin',
    access: 'admin',
    query: paymentMonitorQuery,
    response: paymentMonitorList.omit({ pagination: true }),
    status: 200,
    activation: 'ADMIN_AUTH_ENABLED; local/test only pending deployed qualification',
  },
  {
    csrf: false,
    replay: 'Read only current authorized monitoring projection',
    method: 'GET',
    path: '/admin/payments/{paymentId}',
    namespace: 'admin',
    access: 'admin',
    params: paymentRiskParams,
    query: paymentMonitorPage,
    response: paymentMonitorDetail,
    status: 200,
    activation: 'ADMIN_AUTH_ENABLED; local/test only pending deployed qualification',
  },
  {
    method: 'POST',
    path: '/admin/payments/{paymentId}/reconcile',
    namespace: 'admin',
    access: 'admin',
    params: paymentRiskParams,
    query: empty,
    request: paymentReconcileInput,
    response: paymentReconcileResult,
    status: 202,
    csrf: true,
    idempotency: true,
    replay:
      'Durable admin scheduling only; same key does not reset progress, changed reason conflicts. Worker independently verifies; no financial status assertion.',
    activation:
      'ADMIN_AUTH_ENABLED; local/test only; existing merchant reconciliation worker required',
  },
  {
    method: 'POST',
    path: '/admin/payments/{paymentId}/risk-decisions',
    namespace: 'admin',
    query: empty,
    replay:
      'Current authorized replay returns current risk/hold without reapplying a historical approval. Changed body conflicts; every new decision is audited in the payment transaction.',
    access: 'admin',
    csrf: true,
    idempotency: true,
    params: paymentRiskParams,
    request: paymentRiskInput,
    response: paymentRiskResult,
    status: 200,
    activation:
      'ADMIN_AUTH_ENABLED in local/test only; independent risk decision, current admin/CSRF, durable idempotency and funded allocation gates; no payout or confirmation',
  },
  {
    method: 'POST',
    path: '/orders/{orderId}/payment-attempts',
    access: 'customer_or_guest',
    namespace: 'storefront',
    query: empty,
    params: paymentInitiationParams,
    request: paymentInitiationInput,
    response: paymentInitiationResult,
    status: 200,
    csrf: true,
    idempotency: true,
    activation:
      'PAYMENT_INITIATION_ENABLED local/test only, customer auth and reviewed merchant evidence, payment/operation/order/stock/coupon/audit persistence, immutable gateway-compatible address including postalCode. No deployed/live collection qualification implied.',
    replay:
      'Durable per-owner/order/key tombstone before one provider call. Identical replay never resends or extends holds; uncertain results block new attempts. Allocation shortfall records no attempt.',
  },
  {
    method: 'GET',
    path: '/orders/{orderId}/payment-attempts/{attemptId}',
    access: 'customer_or_guest',
    namespace: 'storefront',
    query: empty,
    params: paymentAttemptParams,
    response: paymentAttemptStatus,
    status: 200,
    csrf: false,
    activation:
      'Same reviewed local/test initiation composition; authenticated order owner or proven guest order scope on every read.',
    replay:
      'No-store database projection only; no provider call, redirect, merchant secrets or payment success inferred from browser navigation.',
  },
  {
    method: 'GET',
    path: '/checkout/payment-methods',
    access: 'public',
    namespace: 'storefront',
    query: paymentMethodsQuery,
    params: empty,
    response: paymentMethodsView,
    status: 200,
    csrf: false,
    activation:
      'Reviewed settings persistence; online requires current digest-checked environment/account-bound operator merchant evidence plus store flag. Order context additionally requires customer ownership or scoped guest proof.',
    replay:
      'No-store read; inactive omitted, advisory amount never authorizes collection. Canonical remaining funding overrides advisory amount for an owned order; unknown amount keeps online eligibility false.',
  },
  {
    method: 'POST',
    path: '/checkout/quotes',
    access: 'public_csrf',
    namespace: 'storefront',
    query: empty,
    params: empty,
    request: checkoutQuoteInput,
    response: checkoutQuote,
    status: 200,
    csrf: true,
    activation:
      'CHECKOUT_QUOTES_ENABLED with explicit TTL/required policies, CUSTOMER_AUTH_ENABLED, reviewed quote/catalog/delivery/settings/coupon persistence and eligible independently reviewed deadline policy. Online methods remain denied until verified provider/merchant capability is wired.',
    replay:
      'New quote per request; scope-bound immutable consent without reservations. Internal revalidation checks expiry, stable line IDs and commercial changes; order intent/consumption belongs to later tasks.',
  },
  {
    method: 'POST',
    path: '/checkout/orders',
    access: 'public_csrf',
    namespace: 'storefront',
    query: empty,
    params: empty,
    request: checkoutSubmitInput,
    response: checkoutSubmitResult,
    status: 201,
    replayStatus: 200,
    csrf: true,
    idempotency: true,
    activation:
      'CHECKOUT_COD_ENABLED and CHECKOUT_QUOTES_ENABLED with CUSTOMER_AUTH_ENABLED, current independently reviewed policies and provisioned order/intent/inventory/coupon/payment/notification persistence. COD only; online submission/provider calls remain disabled pending Phase 07.',
    replay:
      '201 new, 200 replay. Same scoped key returns current order; changed payload conflicts. Consent/order/stock/coupon/pending payment/order_received intent commit atomically. No unverified collection or early confirmation.',
  },
  ...(
    [
      {
        method: 'GET',
        path: '/admin/delivery/zones',
        query: zoneQuery,
        params: empty,
        response: z.array(zoneView),
        status: 200,
        paginated: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/zones',
        query: empty,
        params: empty,
        request: zoneInput,
        response: zoneView,
        status: 201,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/delivery/zones/{zoneId}',
        query: empty,
        params: zoneParams,
        request: zonePatch,
        response: zoneView,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'GET',
        path: '/admin/delivery/charges',
        query: chargeQuery,
        params: empty,
        response: z.array(chargeView),
        status: 200,
        paginated: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges',
        query: empty,
        params: empty,
        request: chargeInput,
        response: chargeView,
        status: 201,
        etag: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges/{chargeId}/activate',
        query: empty,
        params: chargeParams,
        request: chargeActivate,
        response: chargeView,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges/{chargeId}/deactivate',
        query: empty,
        params: chargeParams,
        request: chargeDeactivate,
        response: chargeView,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges/{chargeId}/supersede',
        query: empty,
        params: chargeParams,
        request: chargeSupersede,
        response: chargeReplacement,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed delivery indexes, canonical settings singleton and audit persistence. Only operator-configured coverage; no legal deadline or provider activation implied.',
      replay:
        'Revision CAS, durable actor/payload/revision/key-bound command replay and store-wide delivery coverage serialization; immutable charge versions and transactional audit',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/settings',
        query: empty,
        params: empty,
        response: settingsView,
        status: 200,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/settings',
        query: empty,
        params: empty,
        request: settingsPatch,
        response: settingsView,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'GET',
        path: '/admin/settings/policies',
        query: policyListQuery,
        params: empty,
        response: z.array(policySummary),
        status: 200,
        paginated: true,
      },
      {
        method: 'POST',
        path: '/admin/settings/policies',
        query: empty,
        params: empty,
        request: policyDraftInput,
        response: policyCreated,
        status: 201,
        etag: true,
      },
      {
        method: 'GET',
        path: '/admin/settings/policies/{policyId}',
        query: empty,
        params: policyParams,
        response: policyDocument,
        status: 200,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/settings/policies/{policyId}',
        query: empty,
        params: policyParams,
        request: policyDraftPatch,
        response: policyDocument,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'POST',
        path: '/admin/settings/policies/{policyId}/approve',
        query: empty,
        params: policyParams,
        request: policyApprove,
        response: policyDocument,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/admin/settings/policies/{policyId}/publish',
        query: empty,
        params: policyParams,
        request: policyPublish,
        response: policyPublication,
        status: 200,
        ifMatch: true,
        idempotency: true,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; settings/policy indexes, canonical bootstrap and audit persistence. Approval requires a matching protected operator evidence register; media writes require explicit verified media composition.',
      replay:
        'Revision CAS; durable actor/payload/key-bound approval/publication replay; transactional effective pointer and audit',
    }),
  ),
  ...(
    [
      {
        method: 'GET',
        path: '/storefront/contact',
        query: empty,
        params: empty,
        response: publicContact,
        status: 200,
      },
      {
        method: 'GET',
        path: '/storefront/policies/{type}',
        query: empty,
        params: z.strictObject({ type: policyType }),
        response: policyPublic,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'public',
      namespace: 'storefront',
      csrf: false,
      activation:
        'Reviewed settings/policy persistence; only approved effective published pointers become public',
      replay: 'Read only; no drafts or private configuration',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/products',
        query: productListQuery,
        params: empty,
        response: z.array(adminProduct),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/products',
        query: empty,
        params: empty,
        request: productCreate,
        response: adminProduct,
        etag: true,
        status: 201,
      },
      {
        method: 'GET',
        path: '/admin/products/{productId}',
        query: empty,
        params: productParams,
        response: adminProductDetail,
        etag: true,
        status: 200,
      },
      {
        method: 'PATCH',
        path: '/admin/products/{productId}',
        query: empty,
        params: productParams,
        request: productPatch,
        response: adminProduct,
        etag: true,
        ifMatch: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/products/{productId}/deactivate',
        query: empty,
        params: productParams,
        request: productDeactivate,
        response: adminProduct,
        etag: true,
        ifMatch: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/products/{productId}/variants',
        query: empty,
        params: productParams,
        request: variantInput,
        response: adminVariant,
        etag: true,
        status: 201,
      },
      {
        method: 'PATCH',
        path: '/admin/variants/{variantId}',
        query: empty,
        params: adminVariantParams,
        request: variantPatch,
        response: adminVariant,
        etag: true,
        ifMatch: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/variants/{variantId}/deactivate',
        query: empty,
        params: adminVariantParams,
        request: variantDeactivate,
        response: adminVariant,
        etag: true,
        ifMatch: true,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed category/product/variant indexes and audit persistence; image writes require explicit verified media composition.',
      replay:
        'Strong revision CAS for edits; parent aggregate fence prevents invalid concurrent variants; immutable SKU/attribute identities and transactional media/audit',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/categories',
        query: categoryListQuery,
        params: empty,
        response: z.array(adminCategory),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/categories',
        query: empty,
        params: empty,
        request: categoryCreate,
        response: adminCategory,
        status: 201,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/categories/{categoryId}',
        query: empty,
        params: categoryParams,
        request: categoryPatch,
        response: adminCategory,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'POST',
        path: '/admin/categories/{categoryId}/deactivate',
        query: empty,
        params: categoryParams,
        request: categoryDeactivate,
        response: adminCategory,
        status: 200,
        etag: true,
        ifMatch: true,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed category indexes and audit persistence. Image writes additionally require explicit verified media composition; no provider activation implied.',
      replay:
        'Revision CAS for edits/deactivation; guarded ancestry and transactional image references/audit',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/inventory',
        query: inventoryQuery,
        params: empty,
        response: inventoryList,
        paginated: true,
        status: 200,
      },
      {
        method: 'GET',
        path: '/admin/inventory/{variantId}/movements',
        query: movementQuery,
        params: inventoryParams,
        response: z.array(movementView),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/inventory/{variantId}/adjustments',
        query: empty,
        params: inventoryParams,
        request: adjustmentBody,
        response: adjustmentResult,
        idempotency: true,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed product/inventory/audit persistence; inventory list additionally requires approved primary store settings.',
      replay:
        'Exactly-once adjustment per variant/key; actor/payload mismatch conflicts; threshold uses revision CAS',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/coupons',
        query: couponListQuery,
        params: empty,
        response: z.array(couponAdmin),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/coupons',
        request: couponInput,
        query: empty,
        params: empty,
        response: couponAdmin,
        status: 201,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/coupons/{couponId}',
        request: couponPatch,
        query: empty,
        params: couponParams,
        response: couponAdmin,
        status: 200,
        ifMatch: true,
        etag: true,
      },
      {
        method: 'POST',
        path: '/admin/coupons/{couponId}/deactivate',
        request: couponDeactivate,
        query: empty,
        params: couponParams,
        response: couponAdmin,
        status: 200,
        ifMatch: true,
        etag: true,
      },
      {
        method: 'GET',
        path: '/admin/coupons/{couponId}/redemptions',
        query: couponHistoryQuery,
        params: couponParams,
        response: z.array(couponHistory),
        paginated: true,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation: 'ADMIN_AUTH_ENABLED; reviewed promotion and audit persistence bootstrap required',
      replay: 'Revision CAS for edits; live hold snapshots and authoritative counters preserved',
    }),
  ),

  {
    method: 'POST',
    path: '/cart/merge',
    access: 'customer',
    activation: 'CUSTOMER_AUTH_ENABLED; reviewed cart persistence bootstrap required',
    request: cartMerge,
    response: cartMergeResponse,
    query: empty,
    params: empty,
    status: 200,
    csrf: true,
    namespace: 'storefront',
    replay:
      'Maximum saved/input quantity per variant; no additive replay effect or stock allocation',
  },
  ...(['GET', 'PUT', 'DELETE'] as const).map(
    (method): Operation => ({
      method,
      path: method === 'GET' ? '/wishlist' : '/wishlist/products/{productId}',
      access: 'customer',
      activation: 'CUSTOMER_AUTH_ENABLED; reviewed wishlist persistence bootstrap required',
      response: method === 'GET' ? wishlistResponse : wishlistSaved,
      query: empty,
      params: method === 'GET' ? empty : wishlistParams,
      status: 200,
      csrf: method !== 'GET',
      namespace: 'storefront',
      replay:
        method === 'GET'
          ? 'read'
          : 'Set membership; repeated add/remove is idempotent and does not allocate stock',
    }),
  ),
  ...(['GET', 'PUT', 'DELETE'] as const).map(
    (method): Operation => ({
      method,
      path: method === 'GET' ? '/cart' : '/cart/items/{variantId}',
      access: 'customer',
      activation: 'CUSTOMER_AUTH_ENABLED; reviewed cart persistence bootstrap required',
      ...(method === 'PUT' ? { request: cartQuantity } : {}),
      response: cartResponse,
      query: empty,
      params: method === 'GET' ? empty : variantParams,
      status: 200,
      csrf: method !== 'GET',
      namespace: 'storefront',
      replay:
        method === 'GET'
          ? 'read'
          : 'Absolute quantity/delete; no reservation or additive retry effect',
    }),
  ),
  ...(
    [
      ['/products', productQuery, z.array(productCard), true],
      ['/products/{slug}', empty, productDetail, false],
      ['/categories', categoryQuery, z.array(categoryCard), true],
      ['/categories/{slug}', empty, categoryCard, false],
    ] as const
  ).map(
    ([path, query, response, paginated]): Operation => ({
      method: 'GET',
      path,
      query,
      response,
      paginated,
      params: path.includes('{slug}') ? categorySlug : empty,
      status: 200,
      csrf: false,
      namespace: 'storefront',
      access: 'public',
      activation: 'Always registered; required indexes/visibility/media checks must pass',
      replay: 'read',
    }),
  ),
  ...(['live', 'ready'] as const).map(
    (kind): Operation => ({
      method: 'GET',
      path: `/health/${kind}`,
      query: empty,
      params: empty,
      response: z.strictObject({ status: z.literal(kind) }),
      status: 200,
      csrf: false,
      namespace: 'admin',
      access: kind === 'ready' ? 'monitor' : 'public',
      activation: 'Always registered; operational ingress restrictions apply',
      replay: 'read',
    }),
  ),
  {
    method: 'POST',
    path: '/admin/media/uploads',
    status: 200,
    access: 'admin',
    namespace: 'admin',
    csrf: true,
    query: empty,
    params: empty,
    multipart: true,
    request: z.strictObject({ file: z.string().meta({ format: 'binary' }) }),
    response: z.strictObject({
      assetId: z.string(),
      publicId: z.string(),
      url: z.url(),
      mimeType: z.string(),
      size: z.int().nonnegative(),
    }),
    activation:
      'Explicit media composition, ADMIN_AUTH_ENABLED and EXT-04 approval; not enabled by standard startup',
    replay: 'No automatic retry after uncertain provider outcome',
  },
  {
    method: 'DELETE',
    path: '/admin/media/{assetId}',
    status: 204,
    access: 'admin',
    namespace: 'admin',
    csrf: true,
    query: empty,
    params: z.strictObject({ assetId: z.string().regex(/^[a-f0-9]{24}$/) }),
    activation:
      'Explicit media composition, ADMIN_AUTH_ENABLED and EXT-04 approval; not enabled by standard startup',
    replay: 'No automatic retry after uncertain provider outcome',
  },
]

export const transportOperations = [
  { method: 'HEAD', path: '/auth/csrf', status: 204 },
  { method: 'HEAD', path: '/admin/auth/csrf', status: 204 },
] as const

export function operationId(op: Pick<Operation, 'method' | 'path'>) {
  return `${op.method.toLowerCase()}_${op.path
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`
}

export function assertOperationParity(
  actual: readonly { method: string; path: string }[],
  expected: readonly Pick<Operation, 'method' | 'path'>[] = operations,
) {
  const keys = (rows: readonly { method: string; path: string }[]) =>
    rows.map((op) => `${op.method.toUpperCase()} ${op.path}`)
  const left = keys(actual),
    right = keys(expected)
  if (
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length ||
    left.length !== right.length ||
    left.some((key) => !right.includes(key))
  )
    throw new Error('Registered route/contract parity failed')
  const ids = expected.map(operationId)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate operation ID')
}

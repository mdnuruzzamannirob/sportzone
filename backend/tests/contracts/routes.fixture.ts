import type { RequestHandler } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { createAuditRoutes } from '../../src/modules/audit/audit.routes.js'
import { sessionCookies } from '../../src/modules/auth/auth.composition.js'
import {
  createAdminCredentialRoutes,
  createCustomerCredentialRoutes,
} from '../../src/modules/auth/credentials/credential.routes.js'
import { createGuestAccessRoutes } from '../../src/modules/auth/guest-access/guest-access.routes.js'
import { createRecoveryRoutes } from '../../src/modules/auth/recovery/password-recovery.routes.js'
import { createBrowserSecurityRoutes } from '../../src/modules/auth/sessions/browser-security.routes.js'
import { createEmailChangeRoutes } from '../../src/modules/auth/verification/email-change.routes.js'
import { createEmailVerificationRoutes } from '../../src/modules/auth/verification/email-verification.routes.js'
import { createCartRoutes } from '../../src/modules/cart/cart.routes.js'
import { createCatalogRoutes } from '../../src/modules/catalog/catalog.routes.js'
import { createCategoryAdminRoutes } from '../../src/modules/catalog/categories/category.routes.js'
import { createProductAdminRoutes } from '../../src/modules/catalog/products/product.routes.js'
import { createCheckoutRoutes } from '../../src/modules/checkout/checkout.routes.js'
import {
  createCustomerAdminRoutes,
  createCustomerRoutes,
} from '../../src/modules/customers/customer.routes.js'
import {
  createDeliveryAreaRoutes,
  createDeliveryRoutes,
} from '../../src/modules/delivery/delivery.routes.js'
import { createInventoryAdminRoutes } from '../../src/modules/inventory/inventory.routes.js'
import { claimEvidenceMultipart } from '../../src/modules/media/media.controller.js'
import { createMediaRoutes } from '../../src/modules/media/media.routes.js'
import { createNotificationRoutes } from '../../src/modules/notifications/notification.routes.js'
import {
  createCancellationRoutes,
  createDeliveryExceptionRoutes,
  createOrderAdminRoutes,
  createOrderReadRoutes,
} from '../../src/modules/orders/order.routes.js'
import {
  createPaymentCallbackRoutes,
  createPaymentInitiationRoutes,
  createPaymentMatchingRoutes,
  createPaymentMethodsRoutes,
  createPaymentMonitorRoutes,
  createPaymentRiskRoutes,
} from '../../src/modules/payments/payment.routes.js'
import {
  createCouponAdminRoutes,
  createCouponPreviewRoutes,
} from '../../src/modules/promotions/promotion.routes.js'
import {
  createRefundHistoryRoutes,
  createRefundRequestRoutes,
  createRefundRoutes,
} from '../../src/modules/refunds/refund.routes.js'
import { createReportRoutes } from '../../src/modules/reports/report.routes.js'
import {
  createReturnHistoryRoutes,
  createReturnRoutes,
} from '../../src/modules/returns/return.routes.js'
import { createReviewRoutes } from '../../src/modules/reviews/review.routes.js'
import {
  createSettingAdminRoutes,
  createSettingPublicRoutes,
} from '../../src/modules/settings/setting.routes.js'
import {
  createSupportReadRoutes,
  createSupportRoutes,
} from '../../src/modules/support/support.routes.js'
import { createWishlistRoutes } from '../../src/modules/wishlist/wishlist.routes.js'
import { createApiRouter } from '../../src/routes.js'
import { composeCheckoutRoutesDependencies } from '../../src/setup.js'
import { sessionHttpFor } from '../helpers/auth.js'

const unused = async (): Promise<never> => {
  throw new Error('Parity fixture must not call a domain service')
}
const guard: RequestHandler = (_req, _res, next) => next()
// Typed inert capabilities inspect registration only: no fake login, database or provider acceptance.
const security = {
  cors: () => guard,
  require: () => guard,
  verifyContext: unused,
  withContext: unused,
  consumeContext: unused,
  issueContext: unused,
  setContextCookie: () => {},
}
const sessions = {
  cookiePolicy: {
    secure: true,
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/' as const,
  },
  issue: unused,
  authenticate: unused,
  verifyCsrfMaterial: unused,
  refreshCsrf: unused,
  rotate: unused,
  logout: unused,
  revokeUser: unused,
}
const credentials = { register: unused, login: unused, current: unused, logout: unused }
const recovery = { request: unused, confirm: unused, change: unused }
const profile = {
  read: unused,
  patch: unused,
  list: unused,
  add: unused,
  edit: unused,
  remove: unused,
  setDefault: unused,
  requestDeletion: unused,
}
const media = {
  verifyPersistence: unused,
  uploadPublic: unused,
  uploadEvidence: unused,
  reconcileUpload: unused,
  privateUrl: unused,
  attach: unused,
  detach: unused,
  protect: unused,
  changePublicReference: unused,
  changePublicAssetReference: unused,
  cleanup: unused,
  maintenanceBatch: unused,
}
// These routers are locally composed only and are deliberately excluded from live registry parity.
export function localOnlyRouters() {
  return [
    createReportRoutes({ read: unused }, security, sessionHttpFor(sessions), { list: unused }),
    createSupportRoutes(
      {
        complaints: {
          adminDetail: unused,
          intake: unused,
          mine: unused,
          adminList: unused,
          submit: unused,
          list: unused,
          resolve: unused,
        },
        customers: { owned: unused, authorizeInSession: unused },
      },
      security,
      sessionHttpFor(sessions),
      { middleware: () => guard },
      'https://shop.example.test',
    ),
    createNotificationRoutes({ list: unused, retry: unused }, security, sessionHttpFor(sessions)),
    createDeliveryExceptionRoutes(
      { list: unused, create: unused, resolve: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createRefundHistoryRoutes(
      { mine: unused, list: unused, detail: unused, forCustomer: unused },
      security,
      sessionCookies,
    ),
    createRefundRoutes(
      {
        list: unused,
        detail: unused,
        group: unused,
        payout: unused,
        reconcile: unused,
        confirmManual: unused,
        review: unused,
      },
      security,
      sessionHttpFor(sessions),
    ),
    createReturnRoutes(
      {
        authorize: unused,
        eligibility: unused,
        submit: unused,
        upload: unused,
        privateEvidence: unused,
        review: unused,
        receive: unused,
      },
      { transition: unused },
      { receive: unused, inspect: unused },
      {
        adminList: unused,
        adminDetail: unused,
        list: unused,
        detail: unused,
        mine: unused,
        forCustomer: unused,
      },
      security,
      sessionHttpFor(sessions),
      'https://shop.example.test',
      1024,
      guard,
      unused,
      claimEvidenceMultipart,
    ),
    createOrderAdminRoutes(
      { adminRead: unused, adminList: unused },
      { transition: unused },
      { collect: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createCancellationRoutes(
      { request: unused, decide: unused, list: unused, adminList: unused },
      security,
      sessionHttpFor(sessions),
      'https://shop.example.test',
    ),
    createCustomerAdminRoutes(
      {
        list: unused,
        detail: unused,
        decideStatus: unused,
        history: unused,
        privacy: unused,
        decidePrivacy: unused,
      },
      { cors: guard, requireBrowser: guard, requireSession: guard, readToken: () => undefined },
    ),
    Router().use(
      createSupportReadRoutes({ adminList: unused }, security, sessionHttpFor(sessions)),
      createAuditRoutes({ list: unused }, security, sessionHttpFor(sessions)),
    ),
    createReturnHistoryRoutes(
      {
        list: unused,
        detail: unused,
        adminList: unused,
        adminDetail: unused,
        mine: unused,
        forCustomer: unused,
      },
      security,
      sessionHttpFor(sessions),
    ),
    createReviewRoutes(
      { publicList: unused, ownList: unused, adminList: unused },
      { create: unused, readOwn: unused, edit: unused, moderate: unused },
      security,
      sessionHttpFor(sessions),
    ),
  ]
}
export function registeredRouter() {
  return createApiRouter({ isReady: async () => true }, [
    createCouponPreviewRoutes({ preview: unused }, security, sessionCookies),
    createRefundRequestRoutes(
      { request: unused },
      security,
      guard,
      'https://shop.example.test',
      sessionCookies,
    ),
    createPaymentMatchingRoutes(
      { link: unused, allocate: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createPaymentCallbackRoutes(
      { malformed: unused, receive: unused, redirect: () => 'https://shop.example.test/result' },
      guard,
    ),
    createPaymentInitiationRoutes(
      { initiate: unused, read: unused },
      security,
      guard,
      'https://shop.example.test',
      sessionCookies,
    ),
    createPaymentMethodsRoutes({ read: unused }, [], sessionCookies),
    createBrowserSecurityRoutes(security, sessions),
    createGuestAccessRoutes(
      { request: unused, exchange: unused },
      {
        issueAfterProof: unused,
        authorizeInSession: unused,
        owned: unused,
        refresh: unused,
        verify: unused,
        logout: unused,
        cookiePolicy: sessions.cookiePolicy,
      },
      security,
      guard,
    ),
    createCustomerCredentialRoutes(credentials, security, sessions),
    createEmailVerificationRoutes({ request: unused, confirm: unused }, security, guard),
    createAdminCredentialRoutes(credentials, recovery, security, sessions),
    createRecoveryRoutes(recovery, security, sessions),
    createEmailChangeRoutes(recovery, security, sessions),
    createCustomerRoutes(profile, {
      cors: guard,
      requireBrowser: guard,
      requireSession: guard,
      readToken: () => undefined,
    }),
    createCategoryAdminRoutes(
      { list: unused, create: unused, patch: unused, deactivate: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createProductAdminRoutes(
      {
        list: unused,
        detail: unused,
        create: unused,
        patch: unused,
        deactivate: unused,
        createVariant: unused,
        patchVariant: unused,
        deactivateVariant: unused,
      },
      security,
      sessionHttpFor(sessions),
    ),
    createDeliveryAreaRoutes(unused, []),
    createCheckoutRoutes(
      { create: unused },
      security,
      guard,
      { submitWithOutcome: unused },
      sessionCookies,
      composeCheckoutRoutesDependencies(),
    ),
    createDeliveryRoutes(
      {
        zones: unused,
        createZone: unused,
        patchZone: unused,
        charges: unused,
        createCharge: unused,
        transition: unused,
        runDue: unused,
      },
      { cors: guard, requireBrowser: guard, requireSession: guard, readToken: () => undefined },
    ),
    createSettingAdminRoutes(
      { get: unused, patch: unused, contact: unused },
      {
        create: unused,
        patch: unused,
        get: unused,
        list: unused,
        transition: unused,
        publicPolicy: unused,
        publicLinks: unused,
        activateDue: unused,
      },
      security,
      sessionHttpFor(sessions),
    ),
    createSettingPublicRoutes({ contact: unused }, { publicPolicy: unused }, []),
    createInventoryAdminRoutes(
      { list: unused, history: unused, adjust: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createPaymentMonitorRoutes(
      { list: unused, detail: unused, reconcile: unused, receipts: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createOrderReadRoutes(
      { list: unused, read: unused, deliveryEvents: unused, payments: unused },
      security,
      sessionCookies,
    ),
    createPaymentRiskRoutes({ decide: unused }, security, sessionHttpFor(sessions)),
    createCouponAdminRoutes(
      { create: unused, update: unused, deactivate: unused, list: unused, history: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createCartRoutes(
      { read: unused, put: unused, remove: unused, merge: unused },
      security,
      sessionHttpFor(sessions),
    ),
    createWishlistRoutes({ read: unused, set: unused }, security, sessionHttpFor(sessions)),
    createCatalogRoutes(
      {
        products: unused,
        product: unused,
        cartSelections: unused,
        wishlistProducts: unused,
        home: unused,
        categories: unused,
        category: unused,
      },
      [],
    ),
    createMediaRoutes(media, security, sessionHttpFor(sessions), 1024, guard),
  ])
}
const layerSchema = z.array(
  z.object({
    route: z.object({ path: z.string(), methods: z.record(z.string(), z.boolean()) }).optional(),
    handle: z.unknown().optional(),
    matchers: z
      .array(z.custom<(path: string) => unknown>((value) => typeof value === 'function'))
      .optional(),
  }),
)
export function registeredOperations(router: Router) {
  const result: { method: string; path: string }[] = []
  function visit(value: unknown) {
    const layers = layerSchema.parse(value)
    for (const layer of layers) {
      if (layer.route) {
        for (const [method, enabled] of Object.entries(layer.route.methods))
          if (enabled)
            result.push({
              method: method.toUpperCase(),
              path: layer.route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}'),
            })
      } else if (typeof layer.handle === 'function' && 'stack' in layer.handle) {
        if (!layer.matchers?.some((match) => match('/')))
          throw new Error('Unsupported router mount prefix; update parity fixture')
        visit(layer.handle.stack)
      }
    }
  }
  visit(router.stack)
  return result
}

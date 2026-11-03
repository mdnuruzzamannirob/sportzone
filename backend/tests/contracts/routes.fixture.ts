import { refundRequestRoutes } from '../../src/modules/refunds/refund-request.routes.js'
import { paymentMatchingRoutes } from '../../src/modules/payments/payment-matching.routes.js'
import { emailVerificationRoutes } from '../../src/modules/auth/verification/email-verification.routes.js'
import { couponPreviewRoutes } from '../../src/modules/promotions/coupon-preview.routes.js'
import { supportRoutes } from '../../src/modules/support/support.routes.js'
import { reportRoutes } from '../../src/modules/reports/report.routes.js'
import { refundHistoryRoutes } from '../../src/modules/refunds/refund-history.routes.js'
import { refundRoutes } from '../../src/modules/refunds/refund.routes.js'
import { returnRoutes } from '../../src/modules/returns/return.routes.js'
import { orderAdminRoutes } from '../../src/modules/orders/order-admin.routes.js'
import { orderReadRoutes } from '../../src/modules/orders/order-read.routes.js'
import { supportReadRoutes } from '../../src/modules/support/support-read.routes.js'
import {
  createCustomerAdminRoutes,
  createCustomerRoutes,
} from '../../src/modules/customers/customer.routes.js'
import { cancellationRoutes } from '../../src/modules/orders/cancellation.routes.js'
import { returnHistoryRoutes } from '../../src/modules/returns/return-history.routes.js'
import { reviewRoutes } from '../../src/modules/reviews/review.routes.js'
import { paymentMonitorRoutes } from '../../src/modules/payments/payment-monitor.routes.js'
import { paymentRiskRoutes } from '../../src/modules/payments/payment-risk.routes.js'
import { paymentCallbackRoutes } from '../../src/modules/payments/payment-callback.routes.js'
import { paymentInitiationRoutes } from '../../src/modules/payments/payment-initiation.routes.js'
import { paymentMethodsRoutes } from '../../src/modules/payments/payment-methods.routes.js'
import { guestAccessRoutes } from '../../src/modules/auth/guest-access/guest-access.routes.js'
import { createDeliveryAreaRoutes } from '../../src/modules/delivery/delivery.routes.js'
import { checkoutRoutes } from '../../src/modules/checkout/checkout.routes.js'
import { createDeliveryRoutes } from '../../src/modules/delivery/delivery.routes.js'
import {
  settingsAdminRoutes,
  settingsPublicRoutes,
} from '../../src/modules/settings/settings.routes.js'
import { productAdminRoutes } from '../../src/modules/catalog/products/product-admin.routes.js'
import { categoryAdminRoutes } from '../../src/modules/catalog/categories/category-admin.routes.js'
import { inventoryAdminRoutes } from '../../src/modules/inventory/inventory-admin.routes.js'
import { couponAdminRoutes } from '../../src/modules/promotions/coupon-admin.routes.js'
import { wishlistRoutes } from '../../src/modules/cart/wishlist.routes.js'
import { cartRoutes } from '../../src/modules/cart/cart.routes.js'
import type { RequestHandler, Router } from 'express'
import { z } from 'zod'
import {
  createAdminCredentialRoutes,
  createCustomerCredentialRoutes,
} from '../../src/modules/auth/credentials/credential.routes.js'

import { recoveryRoutes } from '../../src/modules/auth/recovery/password-recovery.routes.js'
import { browserSecurityRoutes } from '../../src/modules/auth/sessions/browser-security.routes.js'
import { emailChangeRoutes } from '../../src/modules/auth/verification/email-change.routes.js'
import { catalogRoutes } from '../../src/modules/catalog/catalog.routes.js'

import { mediaRoutes } from '../../src/modules/media/media.routes.js'
import { createApiRouter } from '../../src/routes.js'

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
    reportRoutes({ read: unused }, security, sessions, { list: unused }),
    supportRoutes(
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
        exceptions: { list: unused, create: unused, resolve: unused },
        notifications: { list: unused, retry: unused },
        customers: { owned: unused, authorizeInSession: unused },
      },
      security,
      sessions,
      { consume: unused, middleware: () => guard },
      'https://shop.example.test',
    ),
    refundHistoryRoutes(
      { mine: unused, list: unused, detail: unused, forCustomer: unused },
      security,
    ),
    refundRoutes(
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
      sessions,
    ),
    returnRoutes(
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
      sessions,
      'https://shop.example.test',
      1024,
      guard,
      unused,
    ),
    orderAdminRoutes(
      { adminRead: unused, adminList: unused },
      { transition: unused },
      { collect: unused },
      security,
      sessions,
    ),
    cancellationRoutes(
      { request: unused, decide: unused, list: unused, adminList: unused },
      security,
      sessions,
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
    supportReadRoutes({ adminList: unused }, { list: unused }, security, sessions),
    returnHistoryRoutes(
      {
        list: unused,
        detail: unused,
        adminList: unused,
        adminDetail: unused,
        mine: unused,
        forCustomer: unused,
      },
      security,
      sessions,
    ),
    reviewRoutes(
      { publicList: unused, ownList: unused, adminList: unused },
      { create: unused, readOwn: unused, edit: unused, moderate: unused },
      security,
      sessions,
    ),
  ]
}
export function registeredRouter() {
  return createApiRouter({ isReady: async () => true }, [
    couponPreviewRoutes({ preview: unused }, security),
    refundRequestRoutes({ request: unused }, security, guard, 'https://shop.example.test'),
    paymentMatchingRoutes({ link: unused, allocate: unused }, security, sessions),
    paymentCallbackRoutes(
      { malformed: unused, receive: unused, redirect: () => 'https://shop.example.test/result' },
      guard,
    ),
    paymentInitiationRoutes(
      { initiate: unused, read: unused },
      security,
      guard,
      'https://shop.example.test',
    ),
    paymentMethodsRoutes({ read: unused }, []),
    browserSecurityRoutes(security, sessions),
    guestAccessRoutes(
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
    emailVerificationRoutes({ request: unused, confirm: unused }, security, guard),
    createAdminCredentialRoutes(credentials, recovery, security, sessions),
    recoveryRoutes(recovery, security, sessions),
    emailChangeRoutes(recovery, security, sessions),
    createCustomerRoutes(profile, {
      cors: guard,
      requireBrowser: guard,
      requireSession: guard,
      readToken: () => undefined,
    }),
    categoryAdminRoutes(
      { list: unused, create: unused, patch: unused, deactivate: unused },
      security,
      sessions,
    ),
    productAdminRoutes(
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
      sessions,
    ),
    createDeliveryAreaRoutes(unused, []),
    checkoutRoutes({ create: unused }, security, guard, { submitWithOutcome: unused }),
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
    settingsAdminRoutes(
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
      sessions,
    ),
    settingsPublicRoutes({ contact: unused }, { publicPolicy: unused }, []),
    inventoryAdminRoutes({ list: unused, history: unused, adjust: unused }, security, sessions),
    paymentMonitorRoutes(
      { list: unused, detail: unused, reconcile: unused, receipts: unused },
      security,
      sessions,
    ),
    orderReadRoutes(
      { list: unused, read: unused, deliveryEvents: unused, payments: unused },
      security,
    ),
    paymentRiskRoutes({ decide: unused }, security, sessions),
    couponAdminRoutes(
      { create: unused, update: unused, deactivate: unused, list: unused, history: unused },
      security,
      sessions,
    ),
    cartRoutes({ read: unused, put: unused, remove: unused, merge: unused }, security, sessions),
    wishlistRoutes({ read: unused, set: unused }, security, sessions),
    catalogRoutes(
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
    mediaRoutes(media, security, sessions, 1024, guard),
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

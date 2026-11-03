import { randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import { createCustomerAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { sessionCookies } from '../../../src/modules/auth/auth.composition.js'
import { createIdentityModels } from '../../../src/modules/auth/auth.model.js'
import type { CheckoutCredentials } from '../../../src/modules/auth/checkout-access.service.js'
import { checkoutAccess } from '../../../src/modules/auth/checkout-access.service.js'
import { initializeIdentityPersistence } from '../../../src/modules/auth/identity.persistence.js'
import { createAuthQuotaStore } from '../../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../../src/modules/auth/sessions/auth-throttle.service.js'
import { createBrowserSecurity } from '../../../src/modules/auth/sessions/browser-security.service.js'
import { createSessionService } from '../../../src/modules/auth/sessions/session.service.js'
import { catalogCheckoutAccess } from '../../../src/modules/catalog/catalog.service.js'
import { categoryModel } from '../../../src/modules/catalog/categories/category.model.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../../src/modules/catalog/products/product.persistence.js'
import { attributeSignature } from '../../../src/modules/catalog/products/variant.schema.js'
import { createCheckoutRoutes } from '../../../src/modules/checkout/checkout.routes.js'
import { createCheckoutQuoteService } from '../../../src/modules/checkout/checkout.service.js'
import { initializeCheckoutIntentPersistence } from '../../../src/modules/checkout/checkout-intent.persistence.js'
import { checkoutQuoteModel } from '../../../src/modules/checkout/checkout-quote.model.js'
import { initializeCheckoutQuotePersistence } from '../../../src/modules/checkout/checkout-quote.persistence.js'
import { deliveryModels } from '../../../src/modules/delivery/delivery.model.js'
import { initializeDeliveryPersistence } from '../../../src/modules/delivery/delivery.persistence.js'
import { checkoutDeliveryAccess } from '../../../src/modules/delivery/delivery.service.js'
import { initializeAllocationPersistence } from '../../../src/modules/inventory/inventory.persistence.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { deliveryDeadlineRule } from '../../../src/modules/orders/delivery-deadline.schema.js'
import {
  createDeliveryDeadlineService,
  deliveryDeadlineDigest,
} from '../../../src/modules/orders/delivery-deadline.service.js'
import { initializeOrderPersistence } from '../../../src/modules/orders/order.persistence.js'
import { paymentEligibility } from '../../../src/modules/payments/attempts/payment-eligibility.service.js'
import { initializePaymentPersistence } from '../../../src/modules/payments/payment.persistence.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { initializeCouponPersistence } from '../../../src/modules/promotions/promotion.persistence.js'
import { couponQuoteAccess } from '../../../src/modules/promotions/promotion.service.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { policyModel } from '../../../src/modules/settings/policy.model.js'
import { settingsModel } from '../../../src/modules/settings/setting.model.js'
import { initializeSettingsPersistence } from '../../../src/modules/settings/setting.persistence.js'
import { checkoutSettingsAccess } from '../../../src/modules/settings/setting.service.js'
import {
  composeCatalogCheckoutAccessDependencies,
  composeCheckoutQuoteDependencies,
  composeCheckoutRoutesDependencies,
  composePaymentEligibilityDependencies,
} from '../../../src/setup.js'
import { createDeclaredIndexes } from '../../../src/shared/database/indexes.js'
import { initializeJobLeases } from '../../../src/shared/jobs/job-lease.model.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { isolatedDatabase } from '../database.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>

let identities: ReturnType<typeof createIdentityModels>

let sessions: ReturnType<typeof createSessionService>

let security: ReturnType<typeof createBrowserSecurity>

let access: ReturnType<typeof checkoutAccess>

let service: ReturnType<typeof createCheckoutQuoteService>

let app: ReturnType<typeof createApp>

const authSecret = randomBytes(32).toString('hex')

let now: Date

let categoryId: Types.ObjectId

const origin = 'http://localhost:3000',
  path = '/api/v1/checkout/quotes'

const options = { quoteTtlSeconds: 300, requiredPolicyTypes: ['terms' as const] }

const recipient = {
  recipient: 'Synthetic recipient',
  phone: '+8801700000000',
  districtKey: 'dhaka',
  areaKey: 'synthetic',
  street: 'Synthetic street',
  postalCode: '1000',
}

function deadline(version = 'synthetic-v1', prepaid = false) {
  const rule = deliveryDeadlineRule.parse({
    version,
    timezone: 'Asia/Dhaka',
    effectiveFrom: '2026-01-01T00:00:00Z',
    target: { startEvent: 'confirmedAt', calendarDays: 14 },
    legalCaps: [],
    ...(prepaid
      ? {
          prepaid: {
            ruleRef: 'synthetic:prepaid-scope',
            handoverHours: 48,
            deliveryCalendarDays: 5,
          },
        }
      : {}),
  })
  return createDeliveryDeadlineService(
    {
      rule,
      review: {
        evidenceRef: 'synthetic:test-only',
        approvedAt: '2026-01-01T00:00:00Z',
        approvedBy: 'Synthetic reviewer',
        ruleDigest: deliveryDeadlineDigest(rule),
      },
    },
    () => now,
  )
}

function makeService(overrides: Partial<Parameters<typeof createCheckoutQuoteService>[2]> = {}) {
  return createCheckoutQuoteService(
    db.connection,
    access,
    {
      catalog: catalogCheckoutAccess(db.connection, composeCatalogCheckoutAccessDependencies()),
      delivery: checkoutDeliveryAccess(db.connection, () => now),
      settings: checkoutSettingsAccess(db.connection, ['terms']),
      deadline: deadline(),
      coupon: couponQuoteAccess(db.connection),
      methods: paymentEligibility(composePaymentEligibilityDependencies()),
      ...overrides,
    },
    options,
    composeCheckoutQuoteDependencies(),
    () => now,
  )
}

async function guest() {
  const issued = await security.issueContext('storefront')
  return {
    cookie: `sz_browser_ctx=${issued.token}`,
    csrf: issued.csrfToken,
    credentials: {
      customerPresent: false,
      contextToken: issued.token,
      csrfToken: issued.csrfToken,
    } satisfies CheckoutCredentials,
  }
}

async function customer(role: 'customer' | 'admin' = 'customer') {
  const user = await identities.users.create({
    name: 'Synthetic buyer',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
  })
  const issued = await sessions.issue(role, user._id)
  return {
    user,
    cookie: `sz_${role}_sid=${issued.token}`,
    csrf: issued.csrfToken,
    credentials: {
      customerPresent: true,
      customerToken: issued.token,
    } satisfies CheckoutCredentials,
  }
}

type Browser = { cookie: string; csrf: string }

function post(who: Browser, body: object) {
  return request(app)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send(body)
}

async function variant(
  regularPricePoisha = 1000,
  salePricePoisha = 500,
  categories = [categoryId],
) {
  const models = productModels(db.connection),
    key = randomUUID()
  const product = await models.products.create({
    name: 'Synthetic product',
    slug: `product-${key}`,
    description: 'Synthetic',
    categoryIds: categories,
    status: 'active',
  })
  const row = await models.variants.create({
    productId: product._id,
    skuNormalized: `SKU-${key.toUpperCase()}`,
    attributes: {},
    attributeSignature: attributeSignature({}),
    regularPricePoisha,
    salePricePoisha,
    stock: { physical: 10, reserved: 0, committed: 0 },
    status: 'active',
  })
  return { product, row, item: { variantId: row._id.toHexString(), quantity: 2 } }
}

function body(items: { variantId: string; quantity: number }[]) {
  return { items, recipient, email: 'synthetic@example.test', method: 'cod' }
}

function submit(
  input: object,
  quote: { quoteId: string; policyVersions: { type: string; version: string }[] },
) {
  return {
    ...input,
    quoteId: quote.quoteId,
    acceptedTermsVersion: quote.policyVersions.find((row) => row.type === 'terms')?.version,
    acceptedPolicyVersionIds: quote.policyVersions.map((row) => row.version),
  }
}

async function revalidate(credentials: CheckoutCredentials, raw: unknown, quotes = service) {
  return access.owned(credentials, (principal, session) =>
    quotes.revalidate(principal, raw, session),
  )
}

async function coupon(extra: object = {}) {
  return couponModels(db.connection).coupons.create({
    codeNormalized: 'SYNTHETIC',
    type: 'percentage',
    value: 1000,
    minEligibleSubtotalPoisha: 0,
    startsAt: new Date(now.getTime() - 1000),
    expiresAt: new Date(now.getTime() + 86400000),
    status: 'active',
    ...extra,
  })
}
function registerCommerceFixture() {
  beforeAll(async () => {
    db = await isolatedDatabase()
    identities = createIdentityModels(db.connection)
    await initializeIdentityPersistence(db.connection, identities)
    await createAuthQuotaStore(db.connection).initialize()
    await createNotificationService(db.connection).initialize()
    await createDeclaredIndexes(categoryModel(db.connection))
    await initializeProductPersistence(db.connection)
    await initializeCouponPersistence(db.connection)
    await initializeSettingsPersistence(db.connection, 5)
    await initializeDeliveryPersistence(db.connection)
    await initializeCheckoutQuotePersistence(db.connection)
    await initializeCheckoutIntentPersistence(db.connection)
    await initializeOrderPersistence(db.connection)
    await initializePaymentPersistence(db.connection)
    await initializeCorrectionPersistence(db.connection)
    await initializeAllocationPersistence(db.connection)
    await initializeAuditPersistence(db.connection)
    await initializeJobLeases(db.connection)
    sessions = createSessionService(db.connection, identities, {
      secret: authSecret,
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'http://localhost:4000',
    })
    security = createBrowserSecurity(db.connection, identities, sessions, {
      secret: randomBytes(32).toString('hex'),
      contextTtlSeconds: 1800,
      storefrontOrigin: origin,
      adminOrigin: 'http://localhost:5173',
    })
    access = checkoutAccess(
      createCustomerAccountAccess(db.connection, identities, sessions),
      security,
    )
  })

  beforeEach(async () => {
    now = new Date()
    const models = productModels(db.connection),
      delivery = deliveryModels(db.connection),
      promotions = couponModels(db.connection)
    for (const model of [
      models.products,
      models.variants,
      categoryModel(db.connection),
      delivery.charges,
      delivery.zones,
      promotions.coupons,
      promotions.redemptions,
      promotions.customers,
      checkoutQuoteModel(db.connection),
      settingsModel(db.connection),
      policyModel(db.connection),
    ])
      await db.connection.db?.collection(model.collection.name).deleteMany({})
    for (const name of [
      'jobLeases',
      'authRateLimits',
      'checkoutIntents',
      'orders',
      'deliveryExceptions',
      'complaints',
      'cancellationRequests',
      'orderItemBalances',
      'returnRequests',
      'reviews',
      'payments',
      'paymentAttempts',
      'paymentInitiations',
      'providerReceiptIntake',
      'paymentCollections',
      'refunds',
      'refundAttempts',
      'inventoryReservations',
      'inventoryMovements',
      'notifications',
      'auditLogs',
    ])
      await db.connection.db?.collection(name).deleteMany({})
    await initializeSettingsPersistence(db.connection, 5)
    categoryId = (
      await categoryModel(db.connection).create({
        name: 'Synthetic',
        slug: 'synthetic',
        status: 'active',
      })
    )._id
    const zone = await delivery.zones.create({ name: 'Synthetic', status: 'active' })
    await delivery.charges.create({
      zoneId: zone._id,
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 100,
      ruleVersion: 1,
      status: 'active',
      effectiveFrom: new Date(now.getTime() - 10000),
    })
    await policyModel(db.connection).create({
      type: 'terms',
      version: 'synthetic-terms-v1',
      content: 'Synthetic test policy only',
      contentDigest: 'a'.repeat(64),
      status: 'published',
      effectiveAt: new Date(now.getTime() - 1000),
      approvedAt: new Date(now.getTime() - 2000),
      approvalEvidenceRef: 'synthetic:test-only',
      createdBy: new Types.ObjectId(),
    })
    await settingsModel(db.connection).updateOne(
      { key: 'primary' },
      {
        $set: {
          'paymentChannels.codEnabled': true,
          'activePolicyVersions.terms': 'synthetic-terms-v1',
        },
      },
    )
    service = makeService()
    app = createApp({
      apiRouter: Router().use(
        createCheckoutRoutes(
          service,
          security,
          createAuthThrottle(
            createAuthQuotaStore(db.connection),
            randomBytes(32).toString('hex'),
          ).middleware('customer', 'checkout'),
          undefined,
          sessionCookies,
          composeCheckoutRoutesDependencies(),
        ),
      ),
    })
  })

  afterAll(async () => {
    await db?.close()
  })
}
const context = {
  get db() {
    return db
  },
  set db(value: typeof db) {
    db = value
  },
  get identities() {
    return identities
  },
  set identities(value: typeof identities) {
    identities = value
  },
  get sessions() {
    return sessions
  },
  set sessions(value: typeof sessions) {
    sessions = value
  },
  get security() {
    return security
  },
  set security(value: typeof security) {
    security = value
  },
  get access() {
    return access
  },
  set access(value: typeof access) {
    access = value
  },
  get service() {
    return service
  },
  set service(value: typeof service) {
    service = value
  },
  get app() {
    return app
  },
  set app(value: typeof app) {
    app = value
  },
  get now() {
    return now
  },
  set now(value: typeof now) {
    now = value
  },
  get categoryId() {
    return categoryId
  },
  set categoryId(value: typeof categoryId) {
    categoryId = value
  },
}

export type { Browser }
export {
  authSecret,
  body,
  context,
  coupon,
  customer,
  deadline,
  guest,
  makeService,
  options,
  origin,
  path,
  post,
  recipient,
  registerCommerceFixture,
  revalidate,
  submit,
  variant,
}

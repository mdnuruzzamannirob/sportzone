import { orderMessageService } from '../../src/modules/notifications/order-message.service.js'
import { orderNotificationAccess } from '../../src/modules/orders/order-notification.service.js'
import { paymentNotificationValidator } from '../../src/modules/notifications/notification.persistence.js'
import { deliveryExceptionService } from '../../src/modules/orders/delivery-exception.service.js'
import { initializeDeliveryExceptionPersistence } from '../../src/modules/orders/delivery-exception.persistence.js'
import { deliveryExceptionModel } from '../../src/modules/orders/delivery-exception.model.js'
import { recoveryReceiptService } from '../../src/modules/inventory/recovery-receipt.service.js'
import { complaintService } from '../../src/modules/support/complaint.service.js'
import { initializeComplaintPersistence } from '../../src/modules/support/complaint.persistence.js'
import { complaintModel } from '../../src/modules/support/complaint.model.js'
import { complaintOrderAccess } from '../../src/modules/orders/order.service.js'
import { orderScopeAccess } from '../../src/modules/auth/checkout-access.service.js'
import { orderReadService } from '../../src/modules/orders/order-read.service.js'
import { orderReadRoutes } from '../../src/modules/orders/order-read.routes.js'
import {
  customerPaymentSummaryAccess,
  cancellationPaymentAccess,
} from '../../src/modules/payments/payment.service.js'
import { orderPolicySnapshotAccess } from '../../src/modules/checkout/checkout-quote.service.js'
import { cancellationService } from '../../src/modules/orders/cancellation.service.js'
import {
  initializeCancellationPersistence,
  verifyCancellationPersistence,
  cancellationValidator,
} from '../../src/modules/orders/cancellation.persistence.js'
import { cancellationModel } from '../../src/modules/orders/cancellation.model.js'
import { cancellationAllocationService } from '../../src/modules/checkout/cancellation-allocation.service.js'
import { orderLifecycleService } from '../../src/modules/orders/order-lifecycle.service.js'
import { fulfillmentAllocationService } from '../../src/modules/checkout/fulfillment-allocation.service.js'
import { fulfillmentPaymentAccess } from '../../src/modules/payments/payment.service.js'
import { codCollectionService } from '../../src/modules/payments/cod-collection.service.js'
import { codCollectionOrderAccess } from '../../src/modules/orders/order.service.js'
import { paymentMonitorRoutes } from '../../src/modules/payments/payment-monitor.routes.js'
import { paymentMonitorService } from '../../src/modules/payments/payment-monitor.service.js'
import { composeNotificationWorker } from '../../src/setup.js'
import { paymentMessageService } from '../../src/modules/notifications/payment-message.service.js'
import { paymentNotificationAccess } from '../../src/modules/payments/payment-notification.service.js'
import { createNotificationDeliveryService } from '../../src/modules/notifications/notification-delivery.service.js'
import type { EmailAdapter } from '../../src/modules/notifications/notification.types.js'
import { paymentReconciliationService } from '../../src/modules/payments/payment-reconciliation.service.js'
import { paymentReconciliationJob } from '../../src/jobs/reconcile-payments.job.js'
import { paymentRiskRoutes } from '../../src/modules/payments/payment-risk.routes.js'
import { paymentRiskService } from '../../src/modules/payments/payment-risk.service.js'
import { paymentSettlementService } from '../../src/modules/payments/payment-settlement.service.js'
import { createAdminAccountAccess } from '../../src/modules/auth/admin-account.service.js'
import { initializeCorrectionPersistence } from '../../src/modules/refunds/refund.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { paymentProcessingService } from '../../src/modules/payments/payment-processing.service.js'
import { paymentVerificationService } from '../../src/modules/payments/payment-verification.service.js'
import { verifiedAllocationService } from '../../src/modules/checkout/verified-allocation.service.js'
import { verifiedFundingOrderAccess } from '../../src/modules/orders/order.service.js'
import { guestSessionService } from '../../src/modules/auth/guest-access/guest-session.service.js'
import { guestOrderAccess } from '../../src/modules/orders/order.service.js'
import { createSslcommerzAdapter } from '../../src/providers/sslcommerz/sslcommerz.client.js'
import { initiationInput } from '../../src/providers/sslcommerz/sslcommerz.schema.js'
import { paymentAllocationService } from '../../src/modules/checkout/payment-allocation.service.js'
import { paymentAllocationOrderAccess } from '../../src/modules/orders/order.service.js'
import { paymentInitiationEligibilityAccess } from '../../src/modules/payments/payment.service.js'
import { initializePaymentRecordPersistence } from '../../src/modules/payments/payment-record.persistence.js'
import { initializePaymentInitiationPersistence } from '../../src/modules/payments/payment-initiation.persistence.js'
import { paymentInitiationModel } from '../../src/modules/payments/payment-initiation.model.js'
import { paymentRecordModels } from '../../src/modules/payments/payment-record.model.js'
import { createHash } from 'node:crypto'
import { identityEnvironment } from '../helpers/environment.js'
import { vi } from 'vitest'
import { reservationExpiryJob } from '../../src/jobs/expire-reservations.job.js'
import { checkoutExpiryService } from '../../src/modules/checkout/checkout-expiry.service.js'
import {
  initializeJobLeases,
  jobLeaseModel,
  jobLeaseValidator,
} from '../../src/shared/jobs/job-lease.model.js'
import { jobLeaseService } from '../../src/shared/jobs/job-lease.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { checkoutIntentService } from '../../src/modules/checkout/checkout-intent.service.js'
import { checkoutCompletion } from '../../src/modules/checkout/checkout-completion.service.js'
import { checkoutAllocationService } from '../../src/modules/checkout/checkout-allocation.service.js'
import { initializeCheckoutIntentPersistence } from '../../src/modules/checkout/checkout-intent.persistence.js'
import { checkoutIntentModel } from '../../src/modules/checkout/checkout-intent.model.js'
import { initializeOrderPersistence } from '../../src/modules/orders/order.persistence.js'
import { initialOrderAllocationAccess } from '../../src/modules/orders/order.service.js'
import { orderModels } from '../../src/modules/orders/order.model.js'
import { initializePaymentPersistence } from '../../src/modules/payments/payment.persistence.js'
import { paymentModel } from '../../src/modules/payments/payment.model.js'
import { initializeAllocationPersistence } from '../../src/modules/inventory/inventory.persistence.js'
import { allocationService } from '../../src/modules/inventory/allocation.service.js'
import {
  inventoryReservationModel,
  inventoryMovementModel,
} from '../../src/modules/inventory/inventory.model.js'
import { variantStockAccess } from '../../src/modules/catalog/variants/variant.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { deliveryAreasAccess } from '../../src/modules/delivery/delivery-coverage.service.js'
import { deliveryAreaRoutes } from '../../src/modules/delivery/delivery.routes.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { composeApplication } from '../../src/setup.js'
import { createLogger } from '../../src/shared/logger.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import {
  checkoutAccess,
  type CheckoutCredentials,
} from '../../src/modules/auth/checkout-access.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createAuthThrottle } from '../../src/modules/auth/sessions/auth-throttle.service.js'
import { createAuthQuotaStore } from '../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { catalogCheckoutAccess } from '../../src/modules/catalog/catalog.service.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { attributeSignature } from '../../src/modules/catalog/variants/variant.schema.js'
import { checkoutDeliveryAccess } from '../../src/modules/delivery/delivery-coverage.service.js'
import { deliveryModels } from '../../src/modules/delivery/delivery.model.js'
import { initializeDeliveryPersistence } from '../../src/modules/delivery/delivery.persistence.js'
import { initializeSettingsPersistence } from '../../src/modules/settings/settings.persistence.js'
import { settingsModel } from '../../src/modules/settings/settings.model.js'
import { policyModel } from '../../src/modules/settings/policy.model.js'
import { checkoutSettingsAccess } from '../../src/modules/settings/checkout-settings.service.js'
import {
  createDeliveryDeadlineService,
  deliveryDeadlineDigest,
} from '../../src/modules/orders/delivery-deadline.service.js'
import { deliveryDeadlineRule } from '../../src/modules/orders/delivery-deadline.schema.js'
import { couponQuoteAccess } from '../../src/modules/promotions/coupon.service.js'
import { couponModels } from '../../src/modules/promotions/coupon.model.js'
import { initializeCouponPersistence } from '../../src/modules/promotions/coupon.persistence.js'
import { paymentEligibility } from '../../src/modules/payments/payment-eligibility.service.js'
import { checkoutQuoteModel } from '../../src/modules/checkout/checkout-quote.model.js'
import { initializeCheckoutQuotePersistence } from '../../src/modules/checkout/checkout-quote.persistence.js'
import { checkoutQuoteService } from '../../src/modules/checkout/checkout-quote.service.js'
import { checkoutRoutes } from '../../src/modules/checkout/checkout.routes.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
let identities: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let security: ReturnType<typeof createBrowserSecurity>
let access: ReturnType<typeof checkoutAccess>
let service: ReturnType<typeof checkoutQuoteService>
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
function deadline(version = 'synthetic-v1') {
  const rule = deliveryDeadlineRule.parse({
    version,
    timezone: 'Asia/Dhaka',
    effectiveFrom: '2026-01-01T00:00:00Z',
    target: { startEvent: 'confirmedAt', calendarDays: 14 },
    legalCaps: [],
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
function makeService(overrides: Partial<Parameters<typeof checkoutQuoteService>[2]> = {}) {
  return checkoutQuoteService(
    db.connection,
    access,
    {
      catalog: catalogCheckoutAccess(db.connection),
      delivery: checkoutDeliveryAccess(db.connection, () => now),
      settings: checkoutSettingsAccess(db.connection, ['terms']),
      deadline: deadline(),
      coupon: couponQuoteAccess(db.connection),
      methods: paymentEligibility(),
      ...overrides,
    },
    options,
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
beforeAll(async () => {
  db = await isolatedDatabase()
  identities = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, identities)
  await createAuthQuotaStore(db.connection).initialize()
  await createRegistrationNotifications(db.connection).initialize()
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
    'payments',
    'paymentAttempts',
    'paymentInitiations',
    'providerReceiptIntake',
    'paymentCollections',
    'refunds',
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
      checkoutRoutes(
        service,
        security,
        createAuthThrottle(
          createAuthQuotaStore(db.connection),
          randomBytes(32).toString('hex'),
        ).middleware('customer', 'checkout'),
      ),
    ),
  })
})
afterAll(async () => {
  await db?.close()
})
it('creates a scope-bound guest quote with authoritative amounts and no reservations/orders/provider effects', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  const result = await post(who, input).expect(200)
  expect(result.headers['cache-control']).toBe('no-store')
  expect(result.body.data).toMatchObject({
    regularSubtotalPoisha: 2000,
    productDiscountPoisha: 1000,
    saleSubtotalPoisha: 1000,
    couponDiscountPoisha: 0,
    deliveryChargePoisha: 100,
    finalTotalPoisha: 1100,
    currency: 'BDT',
    deliveryDeadline: { status: 'awaiting_start' },
  })
  expect(result.body.data.items[0].id).toMatch(/^[a-f0-9]{24}$/)
  expect(result.body.data).not.toHaveProperty('deadlineBasis')
  const persisted = await checkoutQuoteModel(db.connection)
    .findById(result.body.data.quoteId)
    .orFail()
  expect(persisted.scopeType).toBe('guest_context')
  expect(persisted.scopeKeyHash).not.toContain(who.credentials.contextToken)
  expect(persisted.expiresAt?.getTime()).toBe(now.getTime() + 300000)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  for (const collection of [
    'orders',
    'inventoryReservations',
    'couponRedemptions',
    'payments',
    'paymentAttempts',
  ])
    expect(await db.connection.db?.collection(collection).countDocuments()).toBe(0)
})
it('requires exact Origin/CSRF and does not downgrade invalid/duplicate/customer-role cookies to guest', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  await request(app).post(path).send(input).expect(403)
  await request(app)
    .post(path)
    .set('Origin', 'https://foreign.invalid')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send(input)
    .expect(403)
  await request(app)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .send(input)
    .expect(403)
  await post({ ...who, cookie: `${who.cookie}; sz_customer_sid=invalid` }, input).expect(403)
  const admin = await customer('admin')
  await post(admin, input).expect(403)
  const c = await customer()
  await post({ ...c, cookie: `${c.cookie}; ${c.cookie}` }, input).expect(403)
  expect(await checkoutQuoteModel(db.connection).countDocuments()).toBe(0)
})
it('rejects client totals, duplicate variants, missing guest email and invalid phones without side effects', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  for (const extra of [
    { total: 1 },
    { deliveryCharge: 0 },
    { userId: new Types.ObjectId().toHexString() },
    { items: [selected.item, selected.item] },
    { recipient: { ...recipient, phone: 'invalid' } },
    { email: undefined },
  ])
    await post(who, { ...input, ...extra }).expect(400)
  expect(await checkoutQuoteModel(db.connection).countDocuments()).toBe(0)
})
it('resolves only the current customer saved address and copies buyer/recipient contacts separately', async () => {
  const who = await customer(),
    foreign = await customer(),
    selected = await variant(),
    id = new Types.ObjectId()
  await identities.users.updateOne(
    { _id: who.user._id },
    { $push: { addresses: { ...recipient, id, isDefault: true } } },
  )
  const input = {
    items: [selected.item],
    savedAddressId: id.toHexString(),
    method: 'cod',
    contactPhone: '+8801800000000',
  }
  const result = await post(who, input).expect(200)
  const row = await checkoutQuoteModel(db.connection).findById(result.body.data.quoteId).orFail()
  expect(row.commercialSnapshot.draft.customer).toMatchObject({
    name: 'Synthetic buyer',
    email: who.user.emailNormalized,
    phone: '+8801800000000',
  })
  expect(row.commercialSnapshot.draft.recipient.phone).toBe(recipient.phone)
  await post(foreign, input).expect(404)
  await post(await guest(), input).expect(403)
})
it('rejects inactive/missing/out-of-stock selections and unsupported areas', async () => {
  const who = await guest(),
    selected = await variant()
  await post(who, body([{ ...selected.item, quantity: 11 }])).expect(409)
  await productModels(db.connection).products.updateOne(
    { _id: selected.product._id },
    { $set: { status: 'inactive' } },
  )
  await post(who, body([selected.item])).expect(409)
  await productModels(db.connection).products.updateOne(
    { _id: selected.product._id },
    { $set: { status: 'active' } },
  )
  await post(who, {
    ...body([selected.item]),
    recipient: { ...recipient, areaKey: 'unsupported' },
  }).expect(400)
  expect(await checkoutQuoteModel(db.connection).countDocuments()).toBe(0)
})
it('checks AND coupon scopes and applies the discount only to jointly eligible merchandise', async () => {
  const who = await guest(),
    a = await variant(),
    category = await categoryModel(db.connection).create({
      name: 'Other',
      slug: 'other',
      status: 'active',
    }),
    b = await variant(1000, 500, [category._id])
  await coupon({
    eligibleProductIds: [a.product._id, b.product._id],
    eligibleCategoryIds: [category._id],
  })
  const result = await post(who, { ...body([a.item, b.item]), couponCode: ' synthetic ' }).expect(
    200,
  )
  expect(result.body.data.couponDiscountPoisha).toBe(100)
  expect(result.body.data.finalTotalPoisha).toBe(2000)
  expect(
    result.body.data.items.find((row: { variantId: string }) => row.variantId === a.item.variantId)
      .couponAllocatedPoisha,
  ).toBe(0)
  expect((await couponModels(db.connection).coupons.findOne())?.heldCount).toBe(0)
  expect(await couponModels(db.connection).redemptions.countDocuments()).toBe(0)
})
it('rejects per-customer coupons for guests and enforces canonical current usage for customers', async () => {
  const who = await guest(),
    c = await customer(),
    selected = await variant(),
    policy = await coupon({ perCustomerLimit: 1 }),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' }
  await post(who, input).expect(409)
  await post(c, input).expect(200)
  await couponModels(db.connection).customers.create({
    couponId: policy._id,
    userId: c.user._id,
    heldCount: 0,
    redeemedCount: 1,
  })
  await post(c, input).expect(409)
})
it('denies online flags without verified capability and reports amount bounds from a supplied capability', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  await post(who, { ...input, method: 'bkash' }).expect(422)
  const known = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 2000, maxPoisha: 10000 },
    ]),
  })
  await expect(known.create(who.credentials, { ...input, method: 'bkash' })).rejects.toMatchObject({
    code: 'PAYMENT_AMOUNT_UNSUPPORTED',
  })
  const result = await known.create(who.credentials, input)
  expect(result.availableMethods.find((row) => row.channel === 'bkash')).toMatchObject({
    active: true,
    eligible: false,
    reasonCode: 'PAYMENT_AMOUNT_UNSUPPORTED',
    minPoisha: 2000,
  })
})
it('fails closed for missing policy pointers or an unavailable reviewed deadline without publishing a quote', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  await expect(
    makeService({ deadline: createDeliveryDeadlineService() }).create(who.credentials, input),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $unset: { 'activePolicyVersions.terms': 1 } },
  )
  await post(who, input).expect(503)
  expect(await checkoutQuoteModel(db.connection).countDocuments()).toBe(0)
})
it('revalidates stable line IDs without treating sufficient advisory stock changes as commercial changes', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = (await post(who, input).expect(200)).body.data
  const accepted = submit(input, quote)
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 9 } },
  )
  const result = await revalidate(who.credentials, accepted)
  expect(result.snapshot.items[0]?.id).toBe(quote.items[0].id)
  expect((await checkoutQuoteModel(db.connection).findById(quote.quoteId))?.status).toBe('open')
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { salePricePoisha: 600 } },
  )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'QUOTE_CHANGED',
  })
})
it('returns scope-safe 404, exact expiry and changed-draft/consent errors without consuming consent', async () => {
  const who = await guest(),
    other = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = (await post(who, input).expect(200)).body.data,
    accepted = submit(input, quote)
  await expect(revalidate(other.credentials, accepted)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(
    revalidate(who.credentials, { ...accepted, acceptedTermsVersion: 'wrong' }),
  ).rejects.toMatchObject({ code: 'QUOTE_CHANGED' })
  await expect(
    revalidate(who.credentials, { ...accepted, items: [{ ...selected.item, quantity: 1 }] }),
  ).rejects.toMatchObject({ code: 'QUOTE_CHANGED' })
  now = new Date(now.getTime() + 300000)
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'QUOTE_EXPIRED',
  })
  expect((await checkoutQuoteModel(db.connection).findById(quote.quoteId))?.status).toBe('open')
})
it('revalidates current stock/coupon capacity with their specific errors', async () => {
  const who = await guest(),
    selected = await variant(),
    policy = await coupon({ overallLimit: 1 }),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    quote = (await post(who, input).expect(200)).body.data,
    accepted = submit(input, quote)
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 1 } },
  )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'OUT_OF_STOCK',
  })
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 10 } },
  )
  await couponModels(db.connection).coupons.updateOne(
    { _id: policy._id },
    { $set: { heldCount: 1 } },
  )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'COUPON_UNAVAILABLE',
  })
})
it('compares delivery, policy and deadline basis before any later submission mutation', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = (await post(who, input).expect(200)).body.data,
    accepted = submit(input, quote)
  await expect(
    revalidate(who.credentials, accepted, makeService({ deadline: deadline('synthetic-v2') })),
  ).rejects.toMatchObject({ code: 'QUOTE_CHANGED' })
  const delivery = deliveryModels(db.connection)
  await delivery.charges.updateOne(
    { coverageKey: 'dhaka:synthetic' },
    { $set: { status: 'inactive' } },
  )
  const zone = await delivery.zones.findOne().orFail()
  await delivery.charges.create({
    zoneId: zone._id,
    coverageKey: 'dhaka:synthetic',
    amountPoisha: 200,
    ruleVersion: 2,
    status: 'active',
    effectiveFrom: now,
  })
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'QUOTE_CHANGED',
  })
})
it('preserves deterministic one-poisha coupon allocations and line IDs when the draft line order changes', async () => {
  const who = await guest(),
    a = await variant(),
    b = await variant()
  await coupon({ type: 'fixed', value: 1 })
  const input = { ...body([a.item, b.item]), couponCode: 'SYNTHETIC' },
    quote = (await post(who, input).expect(200)).body.data
  expect(quote.couponDiscountPoisha).toBe(1)
  const allocation = [...quote.items].sort((a, b) => a.id.localeCompare(b.id))
  expect(allocation.map((row) => row.couponAllocatedPoisha)).toEqual([1, 0])
  const result = await revalidate(
    who.credentials,
    submit({ ...input, items: [b.item, a.item] }, quote),
  )
  expect(result.snapshot.items.map((row) => row.id)).toEqual(
    quote.items.map((row: { id: string }) => row.id),
  )
})
it('allows concurrent advisory quotes without reserving the last available units', async () => {
  const who = await guest(),
    selected = await variant()
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 2 } },
  )
  const results = await Promise.all([
    post(who, body([selected.item])),
    post(who, body([selected.item])),
  ])
  expect(results.map((row) => row.status)).toEqual([200, 200])
  expect(new Set(results.map((row) => row.body.data.quoteId)).size).toBe(2)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 2, reserved: 0, committed: 0 })
})
it('rejects changed policy pointers and corrupted consent snapshots before returning a submission basis', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = (await post(who, input).expect(200)).body.data,
    accepted = submit(input, quote)
  await policyModel(db.connection).create({
    type: 'terms',
    version: 'synthetic-terms-v2',
    content: 'Synthetic replacement',
    contentDigest: 'b'.repeat(64),
    status: 'published',
    effectiveAt: now,
    approvedAt: now,
    approvalEvidenceRef: 'synthetic:test-only',
    createdBy: new Types.ObjectId(),
  })
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'activePolicyVersions.terms': 'synthetic-terms-v2' } },
  )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'QUOTE_CHANGED',
  })
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'activePolicyVersions.terms': 'synthetic-terms-v1' } },
  )
  await db.connection.db
    ?.collection('checkoutQuotes')
    .updateOne(
      { _id: new Types.ObjectId(quote.quoteId) },
      { $set: { 'commercialSnapshot.pricing.finalTotalPoisha': 1 } },
    )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
})
it('enforces persistent quote admission limits and rejects suspended customer ownership', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  for (let i = 0; i < 10; i++) await post(who, input).expect(200)
  const blocked = await post(who, input).expect(429)
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
  expect(await checkoutQuoteModel(db.connection).countDocuments()).toBe(10)
  const c = await customer()
  await identities.users.updateOne({ _id: c.user._id }, { $set: { status: 'suspended' } })
  await expect(service.create(c.credentials, input)).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
})
it('lists only active effective delivery areas with bounded filters and safe public CORS', async () => {
  const publicApp = createApp({
    apiRouter: deliveryAreaRoutes(
      deliveryAreasAccess(db.connection, () => now),
      [origin],
    ),
  })
  const initial = await request(publicApp)
    .get('/api/v1/delivery/areas?district=dhaka')
    .set('Origin', origin)
    .expect(200)
  expect(initial.body.data.supportedAreas).toHaveLength(1)
  expect(Object.keys(initial.body.data.supportedAreas[0]).sort()).toEqual([
    'areaKey',
    'districtKey',
    'zoneId',
  ])
  expect(initial.body.data.zoneKeys).toHaveLength(1)
  await request(publicApp)
    .get('/api/v1/delivery/areas?district=unserved')
    .expect(200)
    .expect((response) => expect(response.body.data.supportedAreas).toEqual([]))
  await request(publicApp).get('/api/v1/delivery/areas?district=bad.*').expect(400)
  await request(publicApp)
    .get('/api/v1/delivery/areas')
    .set('Origin', 'https://foreign.invalid')
    .expect(403)
  const { zones, charges } = deliveryModels(db.connection),
    zone = await zones.findOne().orFail()
  await charges.create({
    zoneId: zone._id,
    coverageKey: 'dhaka:future',
    amountPoisha: 1,
    ruleVersion: 1,
    status: 'scheduled',
    effectiveFrom: new Date(now.getTime() + 10000),
  })
  expect(
    (await request(publicApp).get('/api/v1/delivery/areas')).body.data.supportedAreas,
  ).toHaveLength(1)
  await zones.updateOne({ _id: zone._id }, { $set: { status: 'inactive' } })
  expect(
    (await request(publicApp).get('/api/v1/delivery/areas')).body.data.supportedAreas,
  ).toHaveLength(0)
})
it('wires quotes through actual root composition only when explicitly activated, without logging buyer input', async () => {
  const env = {
      ...testEnvironment(),
      CUSTOMER_AUTH_ENABLED: 'true',
      CUSTOMER_SESSION_TTL_SECONDS: '600',
      ADMIN_SESSION_TTL_SECONDS: '300',
      SESSION_COOKIE_SAME_SITE: 'lax',
      BROWSER_CONTEXT_TTL_SECONDS: '1800',
    },
    config = loadEnvironment(env),
    lines: string[] = []
  const { capturedAt, ...manifest } = deadline().snapshotForCheckout()
  void capturedAt
  const active = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, (line) => lines.push(line)),
    undefined,
    [],
    { ...options, deadline: manifest },
  )
  const bootstrap = await request(active).get('/api/v1/auth/csrf').set('Origin', origin).expect(200)
  const headers: unknown = bootstrap.headers['set-cookie']
  if (
    !Array.isArray(headers) ||
    !headers.every((value): value is string => typeof value === 'string')
  )
    throw new Error('Synthetic context cookie missing')
  const cookie = headers.map((value) => value.split(';')[0]).join('; '),
    selected = await variant()
  await request(active)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', bootstrap.body.data.csrfToken)
    .send(body([selected.item]))
    .expect(200)
  expect(lines.some((line) => line.includes('checkout.quote.create'))).toBe(true)
  expect(
    lines.some(
      (line) =>
        line.includes('synthetic@example.test') ||
        line.includes(recipient.street) ||
        line.includes(bootstrap.body.data.csrfToken),
    ),
  ).toBe(false)
  const inactive = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
  )
  await request(inactive).post(path).send({}).expect(404)
  await request(inactive).get('/api/v1/delivery/areas').expect(200)
})
it('runs compiled quote bootstrap additively, retains consent and refuses production', async () => {
  const who = await guest(),
    selected = await variant(),
    quote = (await post(who, body([selected.item])).expect(200)).body.data
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-checkout-quotes.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await checkoutQuoteModel(db.connection).findById(quote.quoteId))?.status).toBe('open')
  const indexes = await checkoutQuoteModel(db.connection).listIndexes()
  expect(indexes.some((index) => index.expireAfterSeconds !== undefined)).toBe(false)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-checkout-quotes.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(refused.status).toBe(1)
  expect(refused.stderr).not.toContain(env.MONGODB_URI)
})
it('requires renewed confirmation when coupon terms change without changing the discount total', async () => {
  const who = await guest(),
    selected = await variant(),
    policy = await coupon(),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    quote = (await post(who, input).expect(200)).body.data
  const stored = await checkoutQuoteModel(db.connection).findById(quote.quoteId).orFail()
  expect(stored.commercialSnapshot.coupon?.couponId).toBe(policy._id.toHexString())
  await couponModels(db.connection).coupons.updateOne(
    { _id: policy._id },
    { $inc: { termsVersion: 1 } },
  )
  await expect(revalidate(who.credentials, submit(input, quote))).rejects.toMatchObject({
    code: 'QUOTE_CHANGED',
  })
})

function submissionService(quotes = service) {
  return checkoutIntentService(
    db.connection,
    access,
    quotes,
    checkoutCompletion(db.connection, () => now),
    () => now,
  )
}
function codApp() {
  return createApp({
    apiRouter: Router().use(
      checkoutRoutes(
        service,
        security,
        createAuthThrottle(
          createAuthQuotaStore(db.connection),
          randomBytes(32).toString('hex'),
        ).middleware('customer', 'checkout'),
        submissionService(),
      ),
    ),
  })
}
function placeCod(who: Browser, input: object, key = 'synthetic-cod-key') {
  return request(codApp())
    .post('/api/v1/checkout/orders')
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', key)
    .send(input)
}
it('COD HTTP commits stock/coupon, pending payment and one order_received intent; replay is 200', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon(),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' }
  const quote = await service.create(who.credentials, input),
    payload = submit(input, quote)
  const first = await placeCod(who, payload).expect(201)
  expect(first.headers['cache-control']).toBe('no-store')
  expect(first.body.data.order).toMatchObject({
    fulfillmentStatus: 'pending',
    paymentStatus: 'pending',
    finalTotalPoisha: 1000,
    currency: 'BDT',
  })
  expect(first.body.data.order).not.toHaveProperty('customerSnapshot')
  expect(first.body.data).not.toHaveProperty('onlinePayment')
  now = new Date(now.getTime() + 600000)
  expect((await placeCod(who, payload).expect(200)).body.data).toEqual(first.body.data)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2, reserved: 0 })
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).findOne()).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
    merchandiseFundedPoisha: 0,
  })
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.redeemedCount).toBe(1)
  const notification = await db.connection.db
    ?.collection('notifications')
    .findOne({ eventType: 'order_received' })
  expect(notification).toMatchObject({
    status: 'queued',
    templateVersion: 'order-received-v1',
    payload: {},
  })
  expect(notification).not.toHaveProperty('userId')
  expect(
    await db.connection.db
      ?.collection('notifications')
      .countDocuments({ eventType: 'order_received' }),
  ).toBe(1)
  for (const name of ['paymentCollections', 'paymentAttempts', 'providerReceiptIntake'])
    expect(await db.connection.db?.collection(name).countDocuments()).toBe(0)
})
it('COD HTTP rejects missing keys, wrong origins/CSRF, invalid cookies, financial injection and online activation', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await service.create(who.credentials, input),
    payload = submit(input, quote)
  const endpoint = () =>
    request(codApp()).post('/api/v1/checkout/orders').set('Cookie', who.cookie).send(payload)
  expect((await endpoint()).status).toBe(403)
  await request(codApp())
    .post('/api/v1/checkout/orders')
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send(payload)
    .expect(400)
  await placeCod({ ...who, csrf: 'wrong' }, payload).expect(403)
  await placeCod({ ...who, cookie: `${who.cookie}; sz_customer_sid=invalid` }, payload).expect(403)
  await placeCod(who, { ...payload, finalTotalPoisha: 0 }).expect(400)
  await placeCod(who, { ...payload, method: 'bkash' }).expect(422)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(0)
})
it('concurrent COD submissions create one order and one effect set per scoped key', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await service.create(who.credentials, input),
    payload = submit(input, quote)
  const results = await Promise.all([
    placeCod(who, payload),
    placeCod(who, payload),
    placeCod(who, payload),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([200, 200, 201])
  expect(new Set(results.map((row) => row.body.data.order.id)).size).toBe(1)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).countDocuments()).toBe(1)
})
it('last-stock race across independent COD quotes admits one whole order and no losing effects', async () => {
  const selected = await variant(),
    a = await guest(),
    b = await guest()
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 2 } },
  )
  const input = body([selected.item]),
    qa = await service.create(a.credentials, input),
    qb = await service.create(b.credentials, input)
  const results = await Promise.all([
    placeCod(a, submit(input, qa), 'last-a'),
    placeCod(b, submit(input, qb), 'last-b'),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([201, 409])
  expect(await checkoutIntentModel(db.connection).countDocuments()).toBe(1)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 2, reserved: 0, committed: 2 })
})
it('final coupon race rolls back losing stock, order and consent atomically', async () => {
  const selected = await variant(),
    a = await guest(),
    b = await guest(),
    promotion = await coupon({ overallLimit: 1 })
  const input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    qa = await service.create(a.credentials, input),
    qb = await service.create(b.credentials, input)
  const results = await Promise.all([
    placeCod(a, submit(input, qa), 'coupon-a'),
    placeCod(b, submit(input, qb), 'coupon-b'),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([201, 409])
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.redeemedCount).toBe(1)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.committed,
  ).toBe(2)
  expect(await checkoutQuoteModel(db.connection).countDocuments({ status: 'open' })).toBe(1)
})
it('notification persistence failure rolls back COD order, payment, stock and quote consumption', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await service.create(who.credentials, input)
  const notifications = createRegistrationNotifications(db.connection)
  await notifications.verifyIndexes()
  await db.connection.db?.collection('notifications').dropIndex('notifications_event_key_unique')
  try {
    await expect(
      submissionService().submit(who.credentials, submit(input, quote), 'notification-fail'),
    ).rejects.toThrow()
    for (const name of [
      'orders',
      'orderItemBalances',
      'checkoutIntents',
      'payments',
      'inventoryMovements',
    ])
      expect(await db.connection.db?.collection(name).countDocuments()).toBe(0)
    expect(
      (await productModels(db.connection).variants.findById(selected.row._id))?.stock.committed,
    ).toBe(0)
    expect((await checkoutQuoteModel(db.connection).findById(quote.quoteId))?.status).toBe('open')
  } finally {
    await notifications.initialize()
  }
})
it('online foundation captures one server hold clock for every SKU/coupon and replay never extends it', async () => {
  const who = await guest(),
    first = await variant(),
    second = await variant(),
    promotion = await coupon()
  const quotes = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const input = { ...body([first.item, second.item]), method: 'bkash', couponCode: 'SYNTHETIC' }
  const quote = await quotes.create(who.credentials, input),
    api = submissionService(quotes),
    began = now.getTime()
  const result = await api.submit(who.credentials, submit(input, quote), 'synthetic-online')
  const holds = await inventoryReservationModel(db.connection).find({ orderId: result.id })
  expect(holds).toHaveLength(2)
  for (const hold of holds) {
    expect(hold.status).toBe('held')
    expect(hold.heldAt?.getTime()).toBe(began)
    expect(hold.expiresAt?.getTime()).toBe(began + 900000)
  }
  const redemption = await couponModels(db.connection)
    .redemptions.findOne({ orderId: result.id })
    .orFail()
  expect(redemption.heldAt?.getTime()).toBe(began)
  expect(redemption.expiresAt?.getTime()).toBe(began + 900000)
  now = new Date(began + 300000)
  expect((await api.submit(who.credentials, submit(input, quote), 'synthetic-online')).id).toBe(
    result.id,
  )
  expect(
    (await couponModels(db.connection).redemptions.findById(redemption._id))?.expiresAt?.getTime(),
  ).toBe(began + 900000)
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.heldCount).toBe(1)
  expect(await paymentModel(db.connection).findOne()).toMatchObject({
    method: 'online',
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect((await orderModels(db.connection).orders.findById(result.id))?.fulfillmentHold).toBe(
    'payment_pending',
  )
  expect(await db.connection.db?.collection('paymentAttempts').countDocuments()).toBe(0)
})

it('coordinated held release is retry-safe and a new generation gets a fresh shared 15-minute clock', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion =
      (await couponModels(db.connection).coupons.findOne({ codeNormalized: 'SYNTHETIC' })) ??
      (await coupon())
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  const result = await submissionService(quotes).submit(
    who.credentials,
    submit(input, quote),
    'generation-test',
  )
  const began = now.getTime()
  // Synthetic later lifecycle authority, kept out of production composition. The actual expiry/
  // payment/cancellation owner must authorize its own durable decisions in P06-010/P07/P06-013.
  const initial = initialOrderAllocationAccess(db.connection)
  const allocations = checkoutAllocationService(
    db.connection,
    allocationService(db.connection, variantStockAccess(db.connection), () => now),
    {
      async authorize(session, orderId, generation, action) {
        if (orderId !== result.id || !['release_held', 'hold', 'commit'].includes(action))
          throw new Error('Synthetic decision denied')
        const binding = await initial.authorize(session, orderId, 1, 'hold')
        return { ...binding, generation }
      },
    },
    () => now,
  )
  const run = (action: string, generation: number) =>
    inTransaction(db.connection, (session) =>
      allocations.apply(session, { orderId: result.id, generation, action }),
    )
  now = new Date(began + 900000)
  await run('release_held', 1)
  await run('release_held', 1)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ reserved: 0, committed: 0 })
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.heldCount).toBe(0)
  now = new Date(began + 1200000)
  await run('hold', 2)
  const newest = await inventoryReservationModel(db.connection)
    .findOne({ orderId: result.id, generation: 2 })
    .orFail()
  const redemption = await couponModels(db.connection)
    .redemptions.findOne({ orderId: result.id, generation: 2 })
    .orFail()
  expect(newest.heldAt?.getTime()).toBe(now.getTime())
  expect(newest.expiresAt?.getTime()).toBe(now.getTime() + 900000)
  expect(redemption.expiresAt).toEqual(newest.expiresAt)
  now = new Date(now.getTime() + 10000)
  await run('hold', 2)
  expect((await inventoryReservationModel(db.connection).findById(newest._id))?.expiresAt).toEqual(
    newest.expiresAt,
  )
  expect(
    await inventoryReservationModel(db.connection).countDocuments({ orderId: result.id }),
  ).toBe(2)
  await run('commit', 2)
  await run('commit', 2)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 2 })
  expect(await couponModels(db.connection).coupons.findById(promotion._id)).toMatchObject({
    heldCount: 0,
    redeemedCount: 1,
  })
})
it('allocation authority and late coupon failure prevent partial release or unauthorized commitment', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon(),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    quote = await service.create(who.credentials, input)
  const result = await submissionService().submit(
    who.credentials,
    submit(input, quote),
    'release-rollback',
  )
  const initial = initialOrderAllocationAccess(db.connection),
    stock = allocationService(db.connection, variantStockAccess(db.connection), () => now)
  const denied = checkoutAllocationService(db.connection, stock, initial, () => now)
  await expect(
    inTransaction(db.connection, (session) =>
      denied.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
    ),
  ).rejects.toThrow()
  const synthetic = checkoutAllocationService(
    db.connection,
    stock,
    {
      async authorize(session, orderId, generation, action) {
        if (action !== 'release_committed' || orderId !== result.id)
          throw new Error('Synthetic cancellation denied')
        return initial.authorize(session, orderId, generation, 'cod')
      },
    },
    () => now,
  )
  await couponModels(db.connection).redemptions.collection.dropIndex(
    'coupon_order_generation_unique',
  )
  try {
    await expect(
      inTransaction(db.connection, (session) =>
        synthetic.apply(session, {
          orderId: result.id,
          generation: 1,
          action: 'release_committed',
        }),
      ),
    ).rejects.toThrow()
    expect(
      (await productModels(db.connection).variants.findById(selected.row._id))?.stock.committed,
    ).toBe(2)
    expect((await couponModels(db.connection).coupons.findById(promotion._id))?.redeemedCount).toBe(
      1,
    )
    expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
  } finally {
    await initializeCouponPersistence(db.connection)
  }
  await inTransaction(db.connection, (session) =>
    synthetic.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
  )
  await inTransaction(db.connection, (session) =>
    synthetic.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
  )
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.committed,
  ).toBe(0)
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.redeemedCount).toBe(0)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(2)
})

it('registered COD placement stays pending and rejects unsupported financial success without receipts', async () => {
  const who = await customer(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await service.create(who.credentials, input)
  const first = await placeCod(who, submit(input, quote)).expect(201)
  const order = await orderModels(db.connection).orders.findById(first.body.data.order.id).orFail()
  expect(order.userId?.equals(who.user._id)).toBe(true)
  expect(order.confirmedAt).toBeUndefined()
  expect(order.fulfillmentStatus).toBe('pending')
  await expect(
    paymentModel(db.connection).collection.updateOne(
      { orderId: order._id },
      { $set: { paymentStatus: 'paid' } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    paymentModel(db.connection).collection.updateOne(
      { orderId: order._id },
      { $set: { verifiedCollectedPoisha: 1 } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    paymentModel(db.connection).collection.updateOne(
      { orderId: order._id },
      { $set: { expectedPoisha: 0.5 } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await identities.users.updateOne({ _id: who.user._id }, { $set: { status: 'suspended' } })
  await placeCod(who, submit(input, quote)).expect(403)
})
it('actual root composition activates COD explicitly and default composition omits submission', async () => {
  const config = loadEnvironment({
    ...testEnvironment(),
    CUSTOMER_AUTH_ENABLED: 'true',
    CUSTOMER_SESSION_TTL_SECONDS: '600',
    ADMIN_SESSION_TTL_SECONDS: '300',
    SESSION_COOKIE_SAME_SITE: 'lax',
    BROWSER_CONTEXT_TTL_SECONDS: '1800',
  })
  const { capturedAt, ...manifest } = deadline().snapshotForCheckout()
  void capturedAt
  const logger = createLogger(config, () => {})
  const active = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    logger,
    undefined,
    [],
    { ...options, deadline: manifest, codEnabled: true },
  )
  const bootstrap = await request(active).get('/api/v1/auth/csrf').set('Origin', origin).expect(200)
  const headers: unknown = bootstrap.headers['set-cookie']
  if (
    !Array.isArray(headers) ||
    !headers.every((value): value is string => typeof value === 'string')
  )
    throw new Error('Missing synthetic cookies')
  const cookie = headers.map((value) => value.split(';')[0]).join('; '),
    selected = await variant(),
    input = body([selected.item])
  const quote = await request(active)
    .post('/api/v1/checkout/quotes')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', bootstrap.body.data.csrfToken)
    .send(input)
    .expect(200)
  await request(active)
    .post('/api/v1/checkout/orders')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', bootstrap.body.data.csrfToken)
    .set('Idempotency-Key', 'root-cod')
    .send(submit(input, quote.body.data))
    .expect(201)
  const inactive = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    logger,
    undefined,
    [],
    { ...options, deadline: manifest },
  )
  await request(inactive).post('/api/v1/checkout/orders').send({}).expect(404)
})
it('compiled combined checkout bootstrap preserves historical state and refuses production', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await service.create(who.credentials, input)
  await submissionService().submit(who.credentials, submit(input, quote), 'bootstrap-cod')
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-checkout-submit.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).countDocuments()).toBe(1)
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-checkout-submit.mjs'], {
    env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).not.toContain(env.MONGODB_URI)
})

async function heldOrder() {
  const who = await guest(),
    selected = await variant(),
    promotion =
      (await couponModels(db.connection).coupons.findOne({ codeNormalized: 'SYNTHETIC' })) ??
      (await coupon())
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  const result = await submissionService(quotes).submit(
    who.credentials,
    submit(input, quote),
    randomUUID(),
  )
  return { result, selected, promotion }
}
const expiryJob = (batchSize = 100) =>
  reservationExpiryJob(db.connection, { batchSize, leaseMs: 30000 }, () => now)
it('expires a whole unpaid generation at the exact boundary without cancelling its order/payment', async () => {
  const { result, selected, promotion } = await heldOrder(),
    started = now.getTime()
  now = new Date(started + 899999)
  expect((await expiryJob().run()).released).toBe(0)
  now = new Date(started + 900000)
  expect((await expiryJob().run()).released).toBe(1)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  expect(await couponModels(db.connection).coupons.findById(promotion._id)).toMatchObject({
    heldCount: 0,
    redeemedCount: 0,
  })
  expect(await paymentModel(db.connection).findOne({ orderId: result.id })).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect((await orderModels(db.connection).orders.findById(result.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect(
    await inventoryReservationModel(db.connection).countDocuments({
      orderId: result.id,
      status: 'released',
    }),
  ).toBe(1)
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'checkout.hold.expire' }),
  ).toBe(1)
})
it('concurrent expiry runners release capacity and record the event only once', async () => {
  const { result } = await heldOrder()
  now = new Date(now.getTime() + 900000)
  const outcomes = await Promise.all([expiryJob().run(), expiryJob().run(), expiryJob().run()])
  expect(outcomes.reduce((sum, item) => sum + item.released, 0)).toBe(1)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({
      orderId: result.id,
      type: 'release_hold',
    }),
  ).toBe(1)
})
it('expiry retains verified-funded and risk-held capacity for reconciliation', async () => {
  const { result, selected } = await heldOrder()
  const payment = await paymentModel(db.connection).findOne({ orderId: result.id }).orFail()
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    {
      $set: {
        paymentStatus: 'paid',
        verifiedCollectedPoisha: payment.expectedPoisha,
        merchandiseFundedPoisha: payment.expectedPoisha,
      },
      $inc: { revision: 1 },
    },
  )
  now = new Date(now.getTime() + 900000)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
})
it('rolls back every expiry effect on audit failure, then resumes safely after restart', async () => {
  const { result, selected, promotion } = await heldOrder()
  now = new Date(now.getTime() + 900000)
  await db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
  try {
    await expect(expiryJob().run()).rejects.toThrow()
    expect(
      (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
    ).toBe(2)
    expect((await couponModels(db.connection).coupons.findById(promotion._id))?.heldCount).toBe(1)
    expect(
      (await inventoryReservationModel(db.connection).findOne({ orderId: result.id }))?.status,
    ).toBe('held')
    expect(
      await jobLeaseModel(db.connection).findOne({ jobKey: 'reservation-expiry' }),
    ).toMatchObject({ failureCount: 1, lastErrorCode: 'JOB_FAILED' })
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect((await expiryJob().run()).released).toBe(1)
})
it('rejects mixed stock/coupon clocks instead of partially releasing a generation', async () => {
  const { result, selected } = await heldOrder()
  const redemption = await couponModels(db.connection)
    .redemptions.findOne({ orderId: result.id })
    .orFail()
  await couponModels(db.connection).redemptions.updateOne(
    { _id: redemption._id },
    { $set: { heldAt: new Date(now.getTime() + 1), expiresAt: new Date(now.getTime() + 900001) } },
  )
  now = new Date(now.getTime() + 900001)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
})
it('durable cursor moves past protected holds without starving eligible later orders', async () => {
  const first = await heldOrder(),
    second = await heldOrder()
  await paymentModel(db.connection).updateOne(
    { orderId: first.result.id },
    { $set: { riskStatus: 'review' } },
  )
  now = new Date(now.getTime() + 900000)
  expect((await expiryJob(1).run()).released).toBe(0)
  expect((await expiryJob(1).run()).released).toBe(1)
  expect(
    (await inventoryReservationModel(db.connection).findOne({ orderId: second.result.id }))?.status,
  ).toBe('released')
  expect(
    (await inventoryReservationModel(db.connection).findOne({ orderId: first.result.id }))?.status,
  ).toBe('held')
})
it('expired lease owners cannot mutate or checkpoint after a new runner takes ownership', async () => {
  const { result } = await heldOrder()
  now = new Date(now.getTime() + 900000)
  const leases = jobLeaseService(db.connection, 'reservation-expiry', 1000, () => now),
    old = await leases.acquire()
  if (!old) throw new Error('Missing synthetic lease')
  now = new Date(now.getTime() + 1000)
  expect((await expiryJob().run()).released).toBe(1)
  await expect(
    inTransaction(db.connection, async (session) => {
      await leases.fence(session, old.owner)
      await checkoutExpiryService(db.connection, () => now).expire(session, result.id, 1)
    }),
  ).rejects.toThrow()
  await expect(leases.finish(old.owner)).rejects.toThrow()
})
it('compiled expiry entry requires explicit options and runs bounded work without exposing identifiers', async () => {
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
    RESERVATION_EXPIRY_BATCH_SIZE: '10',
    RESERVATION_EXPIRY_LEASE_MS: '30000',
  }
  const result = spawnSync(process.execPath, ['scripts/expire-reservations.mjs'], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    action: 'reservation_expiry',
    acquired: true,
    scanned: 0,
  })
  const missing = spawnSync(process.execPath, ['scripts/expire-reservations.mjs'], {
    env: { ...env, RESERVATION_EXPIRY_LEASE_MS: '' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(missing.status).toBe(1)
  expect(missing.stderr).not.toContain(env.MONGODB_URI)
})

it('concurrent funding and expiry preserve money status and cannot double-release stock/coupon capacity', async () => {
  const { result, selected, promotion } = await heldOrder(),
    model = paymentModel(db.connection),
    payment = await model.findOne({ orderId: result.id }).orFail()
  now = new Date(now.getTime() + 900000)
  // Synthetic verified-receipt application updates the same canonical aggregate fence. It does
  // not claim a live provider or late-payment stock reacquisition implementation.
  await Promise.all([
    expiryJob().run(),
    inTransaction(db.connection, async (session) => {
      await model.updateOne(
        { _id: payment._id },
        {
          $set: {
            paymentStatus: 'paid',
            verifiedCollectedPoisha: payment.expectedPoisha,
            merchandiseFundedPoisha: payment.expectedPoisha,
          },
          $inc: { revision: 1 },
        },
        { session },
      )
    }),
  ])
  expect((await model.findById(payment._id))?.paymentStatus).toBe('paid')
  const stock = (await productModels(db.connection).variants.findById(selected.row._id))?.stock
  expect([0, 2]).toContain(stock?.reserved)
  expect(stock?.committed).toBe(0)
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.heldCount).toBe(
    stock?.reserved === 0 ? 0 : 1,
  )
  expect(
    await inventoryMovementModel(db.connection).countDocuments({
      orderId: result.id,
      type: 'release_hold',
    }),
  ).toBeLessThanOrEqual(1)
})
it('lease loss after domain writes rolls back those writes before any stale owner can commit', async () => {
  const { result, selected } = await heldOrder()
  now = new Date(now.getTime() + 900000)
  const leases = jobLeaseService(db.connection, 'reservation-expiry', 1000, () => now),
    claim = await leases.acquire()
  if (!claim) throw new Error('Missing synthetic claim')
  await expect(
    inTransaction(db.connection, async (session) => {
      await leases.fence(session, claim.owner)
      await checkoutExpiryService(db.connection, () => now).expire(session, result.id, 1)
      now = new Date(now.getTime() + 1000)
      await leases.fence(session, claim.owner)
    }),
  ).rejects.toThrow()
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'checkout.hold.expire' }),
  ).toBe(0)
  expect((await expiryJob().run()).released).toBe(1)
})
it('job registry rejects TTL or validator drift rather than silently rewriting durable history', async () => {
  await jobLeaseModel(db.connection).collection.createIndex(
    { lastSucceededAt: 1 },
    { expireAfterSeconds: 0, name: 'synthetic_job_ttl' },
  )
  try {
    await expect(expiryJob().run()).rejects.toThrow('TTL')
    await expect(initializeJobLeases(db.connection)).rejects.toThrow('TTL')
  } finally {
    await jobLeaseModel(db.connection).collection.dropIndex('synthetic_job_ttl')
  }
  await db.connection.db?.command({ collMod: 'jobLeases', validator: {} })
  try {
    await expect(expiryJob().run()).rejects.toThrow('reviewed provisioning')
    await expect(initializeJobLeases(db.connection)).rejects.toThrow('reviewed provisioning')
  } finally {
    await db.connection.db?.command({ collMod: 'jobLeases', validator: jobLeaseValidator })
  }
})

it('initial hold clocks equal actual order placement even when service calls advance the server clock', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon()
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  let tick = now.getTime()
  const advancing = () => new Date(tick++)
  const api = checkoutIntentService(
    db.connection,
    access,
    quotes,
    checkoutCompletion(db.connection, advancing),
    advancing,
  )
  const result = await api.submit(who.credentials, submit(input, quote), 'placement-clock')
  const order = await orderModels(db.connection).orders.findById(result.id).orFail()
  const reservation = await inventoryReservationModel(db.connection)
    .findOne({ orderId: result.id })
    .orFail()
  const redemption = await couponModels(db.connection)
    .redemptions.findOne({ orderId: result.id, couponId: promotion._id })
    .orFail()
  expect(reservation.heldAt).toEqual(order.placedAt)
  expect(redemption.heldAt).toEqual(order.placedAt)
  expect(reservation.expiresAt?.getTime()).toBe(order.placedAt.getTime() + 900000)
  expect(redemption.expiresAt).toEqual(reservation.expiresAt)
})

async function paymentAllocations() {
  await initializePaymentRecordPersistence(db.connection)
  return paymentAllocationService(
    db.connection,
    paymentAllocationOrderAccess(db.connection, paymentInitiationEligibilityAccess(db.connection)),
    () => now,
  )
}
it('payment allocation preparation retains valid holds and never extends a generation on replay', async () => {
  const { result } = await heldOrder(),
    allocation = await paymentAllocations()
  const initial = await inTransaction(db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  now = new Date(now.getTime() + 1000)
  const replay = await inTransaction(db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  expect(replay).toEqual(initial)
  expect(initial.generation).toBe(1)
})
it('payment preparation atomically reacquires expired stock and coupon under one new 15-minute generation', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  now = new Date(now.getTime() + 900000)
  const result2 = await inTransaction(db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  expect(result2).toEqual({
    generation: 2,
    heldAt: now,
    expiresAt: new Date(now.getTime() + 900000),
  })
  expect(
    await inventoryReservationModel(db.connection).findOne({ orderId: result.id, generation: 1 }),
  ).toMatchObject({ status: 'released' })
  expect(
    await couponModels(db.connection).redemptions.findOne({ orderId: result.id, generation: 2 }),
  ).toMatchObject({ status: 'held', heldAt: now, expiresAt: result2.expiresAt })
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.heldCount).toBe(1)
})
it('concurrent payment reacquisition/expiry retains exactly one active stock/coupon generation', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  now = new Date(now.getTime() + 900000)
  const [refreshed] = await Promise.all([
    Promise.all([
      inTransaction(db.connection, (session) => allocation.ensure(session, result.id)),
      inTransaction(db.connection, (session) => allocation.ensure(session, result.id)),
    ]),
    expiryJob().run(),
  ])
  expect(refreshed[0]).toEqual(refreshed[1])
  expect(
    await inventoryReservationModel(db.connection).countDocuments({
      orderId: result.id,
      activeKey: 'active',
    }),
  ).toBe(1)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
  expect((await couponModels(db.connection).coupons.findById(promotion._id))?.heldCount).toBe(1)
})
it('a late coupon failure rolls back stock release/reacquisition and leaves the original snapshots untouched', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  const original = (await orderModels(db.connection).orders.findById(result.id))?.pricingSnapshot
  now = new Date(now.getTime() + 900000)
  await couponModels(db.connection).coupons.updateOne(
    { _id: promotion._id },
    { $set: { status: 'inactive' } },
  )
  await expect(
    inTransaction(db.connection, (session) => allocation.ensure(session, result.id)),
  ).rejects.toMatchObject({ code: 'COUPON_UNAVAILABLE' })
  expect(
    await inventoryReservationModel(db.connection).countDocuments({ orderId: result.id }),
  ).toBe(1)
  expect(
    (await inventoryReservationModel(db.connection).findOne({ orderId: result.id }))?.status,
  ).toBe('held')
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
  expect((await orderModels(db.connection).orders.findById(result.id))?.pricingSnapshot).toEqual(
    original,
  )
})
it('unresolved attempts protect both stock/coupon capacity against payment reacquisition and shortfall writes', async () => {
  const { result } = await heldOrder(),
    allocation = await paymentAllocations()
  const payment = await paymentModel(db.connection).findOne({ orderId: result.id }).orFail()
  await paymentRecordModels(db.connection).attempts.create({
    orderId: new Types.ObjectId(result.id),
    paymentId: payment._id,
    provider: 'sslcommerz',
    tranId: 'synthetic-pending',
    expectedAmountPoisha: payment.expectedPoisha,
    initiatedOutstandingPoisha: payment.expectedPoisha,
    currency: 'BDT',
    state: 'uncertain',
    amountDisposition: 'not_checked',
  })
  now = new Date(now.getTime() + 900000)
  await expect(
    inTransaction(db.connection, (session) => allocation.ensure(session, result.id)),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const orderAccess = paymentAllocationOrderAccess(
    db.connection,
    paymentInitiationEligibilityAccess(db.connection),
  )
  await expect(
    inTransaction(db.connection, (session) => orderAccess.shortfall(session, result.id)),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(
    await inventoryReservationModel(db.connection).countDocuments({
      orderId: result.id,
      status: 'held',
    }),
  ).toBe(1)
})
async function initiationApp(
  enabled = true,
  verificationGateway?: Pick<
    ReturnType<typeof createSslcommerzAdapter>,
    'validate' | 'queryTransaction'
  >,
  adminEnabled = false,
  retryGateway?: Pick<ReturnType<typeof createSslcommerzAdapter>, 'validate' | 'queryTransaction'>,
  orderReadEnabled = false,
) {
  await initializePaymentRecordPersistence(db.connection)
  await initializePaymentInitiationPersistence(db.connection)
  const config = loadEnvironment({
    ...identityEnvironment(),
    ADMIN_AUTH_ENABLED: adminEnabled ? 'true' : 'false',
    CUSTOMER_ORDER_READ_ENABLED: orderReadEnabled ? 'true' : 'false',
    SESSION_SECRET: authSecret,
    GUEST_ACCESS_ENABLED: 'true',
    GUEST_ORDER_ACCESS_TTL_SECONDS: '300',
    GUEST_ORDER_ACCESS_COOLDOWN_SECONDS: '60',
    GUEST_ORDER_ACCESS_RESPONSE_FLOOR_MS: '100',
    GUEST_ORDER_SESSION_TTL_SECONDS: '600',
  })
  const merchant = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
  const transport = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          status: 'SUCCESS',
          sessionkey: 'synthetic-session',
          GatewayPageURL:
            'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=PAY&SESSIONKEY=synthetic-session',
        }),
      ),
  )
  const root = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
    undefined,
    [],
    undefined,
    [
      {
        channel: 'bkash',
        appEnv: 'test',
        mode: 'sandbox',
        merchantAccountKey: merchant,
        gatewayKey: 'bkash',
        minPoisha: 1000,
        maxPoisha: 50000,
        verifiedAt: new Date(now.getTime() - 1000).toISOString(),
        validUntil: new Date(now.getTime() + 3600000).toISOString(),
        approvedBy: 'Synthetic reviewer',
        evidenceRef: 'synthetic:test',
        evidenceFile: 'synthetic.txt',
        evidenceDigest: 'a'.repeat(64),
      },
    ],
    enabled
      ? {
          ...(retryGateway ? { reconciliationGateway: retryGateway } : {}),
          gateway: createSslcommerzAdapter(
            {
              appEnv: 'test',
              mode: 'sandbox',
              storeId: 'synthetic-store',
              storePassword: 'synthetic-password',
              callbackOrigin: 'https://api.example.test',
              timeoutMs: 1000,
            },
            transport,
          ),
          validateRequest: (raw) => initiationInput.safeParse(raw).success,
          clock: () => now,
        }
      : undefined,
    {
      ...(verificationGateway ? { verificationGateway, clock: () => now } : {}),
      options: {
        mode: 'sandbox',
        storeId: 'synthetic-store',
        storefrontOrigin: 'https://shop.example.test',
        rateLimit: 60,
        returns: {
          success: 'https://shop.example.test/payment/result',
          fail: 'https://shop.example.test/payment/result',
          cancel: 'https://shop.example.test/payment/result',
        },
      },
    },
  )
  return { root, transport }
}
async function customerHeldOrder(
  withCoupon = false,
  existingVariant?: Awaited<ReturnType<typeof variant>>,
) {
  const who = await customer(),
    selected = existingVariant ?? (await variant(2000, 1500))
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  if (
    withCoupon &&
    !(await couponModels(db.connection).coupons.exists({ codeNormalized: 'SYNTHETIC' }))
  )
    await coupon()
  const input = {
      ...body([selected.item]),
      method: 'bkash',
      ...(withCoupon ? { couponCode: 'SYNTHETIC' } : {}),
    },
    quote = await quotes.create(who.credentials, input)
  const result = await submissionService(quotes).submit(
    who.credentials,
    submit(input, quote),
    randomUUID(),
  )
  return { who, result, selected }
}
it('actual hosted-init HTTP authorizes/CSRF-checks an existing order, dispatches once and exposes only current owner status', async () => {
  const { who, result } = await customerHeldOrder(),
    { root, transport } = await initiationApp()
  const path = `/api/v1/orders/${result.id}/payment-attempts`
  const post = () =>
    request(root)
      .post(path)
      .set('Origin', 'https://shop.example.test')
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf)
      .set('Idempotency-Key', 'synthetic-http-init')
      .send({ requestedChannel: 'bkash' })
  const first = await post().expect(200),
    replay = await post().expect(200)
  expect(first.body.data.state).toBe('initiated')
  expect(replay.body.data).toEqual(first.body.data)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await db.connection.db?.collection('orders').countDocuments()).toBe(1)
  const status = await request(root)
    .get(`${path}/${first.body.data.attemptId}`)
    .set('Cookie', who.cookie)
    .expect(200)
  expect(status.body.data).toMatchObject({ id: first.body.data.attemptId, state: 'initiated' })
  expect(status.body.data).not.toHaveProperty('redirectUrl')
  expect(first.headers['cache-control']).toContain('no-store')
  const other = await customer()
  await request(root)
    .get(`${path}/${first.body.data.attemptId}`)
    .set('Cookie', other.cookie)
    .expect(404)
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', other.cookie)
    .set('X-CSRF-Token', other.csrf)
    .set('Idempotency-Key', 'cross-owner')
    .send({ requestedChannel: 'bkash' })
    .expect(404)
  await request(root).get(`${path}/${first.body.data.attemptId}`).expect(401)
})
it('hosted-init HTTP denies missing/invalid CSRF, origins and financial injection before any provider effect', async () => {
  const { who, result } = await customerHeldOrder(),
    { root, transport } = await initiationApp()
  const path = `/api/v1/orders/${result.id}/payment-attempts`
  await request(root)
    .post(path)
    .set('Cookie', who.cookie)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash' })
    .expect(403)
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash' })
    .expect(403)
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash', totalAmount: 1 })
    .expect(400)
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', 'form-cannot-bypass')
    .type('form')
    .send({ requestedChannel: 'bkash' })
    .expect(400)
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentInitiationModel(db.connection).countDocuments()).toBe(0)
})
it('hosted-init defaults off and rejects missing historical postcode without fabricating or dispatching', async () => {
  const { who, result } = await customerHeldOrder(),
    disabled = await initiationApp(false)
  const path = `/api/v1/orders/${result.id}/payment-attempts`
  await request(disabled.root).post(path).send({ requestedChannel: 'bkash' }).expect(404)
  await orderModels(db.connection).orders.collection.updateOne(
    { _id: new Types.ObjectId(result.id) },
    { $unset: { 'deliverySnapshot.postalCode': '' } },
  )
  const { root, transport } = await initiationApp()
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash' })
    .expect(422)
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
})

it('hosted-init authorizes exact proven guest orders with mutation CSRF and never downgrades an invalid customer cookie', async () => {
  const { result } = await heldOrder(),
    { root, transport } = await initiationApp()
  const guests = guestSessionService(
    db.connection,
    identities,
    {
      secret: authSecret,
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'https://api.example.test',
    },
    600,
    guestOrderAccess(db.connection).verify,
    () => now,
  )
  // Proof exchange is separately covered by guest-access tests; this fixture mints only after actual guest-order existence validation.
  const issued = await inTransaction(db.connection, (session) =>
    guests.issueAfterProof(session, result.id),
  )
  const cookie = `sz_guest_order_sid=${issued.token}`,
    path = `/api/v1/orders/${result.id}/payment-attempts`
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', cookie)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash' })
    .expect(401)
  await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .set('X-CSRF-Token', issued.csrfToken)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash' })
    .expect(403)
  const first = await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', cookie)
    .set('X-CSRF-Token', issued.csrfToken)
    .set('Idempotency-Key', 'a')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  await request(root).get(`${path}/${first.body.data.attemptId}`).set('Cookie', cookie).expect(200)
  const other = await heldOrder()
  await request(root)
    .post(`/api/v1/orders/${other.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', cookie)
    .set('X-CSRF-Token', issued.csrfToken)
    .set('Idempotency-Key', 'b')
    .send({ requestedChannel: 'bkash' })
    .expect(401)
  expect(transport).toHaveBeenCalledTimes(1)
})
it('hosted-init HTTP records a durable stock shortfall without an attempt or provider effect', async () => {
  const { who, result, selected } = await customerHeldOrder(),
    { root, transport } = await initiationApp()
  now = new Date(now.getTime() + 900000)
  await expiryJob().run()
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 0 } },
  )
  const path = `/api/v1/orders/${result.id}/payment-attempts`
  const result1 = await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', 'shortfall')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  expect(result1.body.data).toEqual({ state: 'allocation_shortfall' })
  expect((await orderModels(db.connection).orders.findById(result.id))?.fulfillmentHold).toBe(
    'allocation_shortfall',
  )
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(0)
  expect(transport).not.toHaveBeenCalled()
  await productModels(db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 10 } },
  )
  const recovered = await request(root)
    .post(path)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', 'explicit-fresh-retry')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  expect(recovered.body.data.state).toBe('initiated')
  expect(transport).toHaveBeenCalledTimes(1)
  expect(
    (await productModels(db.connection).variants.findById(selected.row._id))?.stock.reserved,
  ).toBe(2)
})

it('hosted-init replay withholds a historical URL after channel disablement, risk review or cancellation', async () => {
  const { who, result } = await customerHeldOrder(),
    { root, transport } = await initiationApp()
  const path = `/api/v1/orders/${result.id}/payment-attempts`
  const post = () =>
    request(root)
      .post(path)
      .set('Origin', 'https://shop.example.test')
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf)
      .set('Idempotency-Key', 'replay-policy')
      .send({ requestedChannel: 'bkash' })
  const first = await post().expect(200)
  expect(first.body.data.redirectUrl).toBeDefined()
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': false } },
  )
  expect((await post().expect(200)).body.data.redirectUrl).toBeUndefined()
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  await paymentModel(db.connection).updateOne(
    { orderId: result.id },
    { $set: { riskStatus: 'review' } },
  )
  expect((await post().expect(200)).body.data.redirectUrl).toBeUndefined()
  expect(
    (
      await request(root)
        .get(`${path}/${first.body.data.attemptId}`)
        .set('Cookie', who.cookie)
        .expect(200)
    ).body.data.riskStatus,
  ).toBe('review')
  await paymentModel(db.connection).updateOne(
    { orderId: result.id },
    { $set: { riskStatus: 'clear' } },
  )
  await orderModels(db.connection).orders.collection.updateOne(
    { _id: new Types.ObjectId(result.id) },
    { $set: { fulfillmentStatus: 'cancelled', cancelledAt: now } },
  )
  expect((await post().expect(200)).body.data.redirectUrl).toBeUndefined()
  expect(transport).toHaveBeenCalledTimes(1)
})

async function processingFixture(
  withCoupon = false,
  existingVariant?: Awaited<ReturnType<typeof variant>>,
) {
  const held = await customerHeldOrder(withCoupon, existingVariant),
    { root } = await initiationApp()
  await request(root)
    .post(`/api/v1/orders/${held.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', held.who.cookie)
    .set('X-CSRF-Token', held.who.csrf)
    .set('Idempotency-Key', 'processing-fixture')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  const attempt = await paymentRecordModels(db.connection)
    .attempts.findOne({ orderId: held.result.id })
    .orFail()
  const merchant = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
  const decimal = (amount: number) =>
    `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
  let provider = {
    status: 'VALIDATED',
    tran_id: attempt.tranId,
    val_id: 'processing-validation',
    bank_tran_id: 'processing-bank',
    amount: decimal(attempt.expectedAmountPoisha),
    currency: 'BDT',
    currency_type: 'BDT',
    currency_amount: decimal(attempt.expectedAmountPoisha),
    tran_date: new Date(now.getTime() - 1000).toISOString(),
    risk_level: '0',
    risk_title: 'Safe',
  }
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      new URL(String(url)).pathname.endsWith('validationserverAPI.php')
        ? Response.json(provider)
        : Response.json({ APIConnect: 'DONE', no_of_trans_found: 1, element: [provider] }),
    )
  const gateway = createSslcommerzAdapter(
    {
      appEnv: 'test',
      mode: 'sandbox',
      storeId: 'synthetic-store',
      storePassword: 'synthetic-password',
      callbackOrigin: 'https://api.example.test',
      timeoutMs: 1000,
    },
    transport,
  )
  const verifier = paymentVerificationService(db.connection, gateway, merchant)
  const processor = () =>
    paymentProcessingService(
      db.connection,
      verifier,
      verifiedFundingOrderAccess(db.connection),
      verifiedAllocationService(db.connection, () => now),
      () => now,
    )
  const claim = {
    merchantAccountKey: merchant,
    tranId: attempt.tranId,
    claimedStatus: 'VALID',
    validationId: provider.val_id,
  }
  return {
    ...held,
    processor,
    verifier,
    gateway,
    claim,
    transport,
    attempt,
    change: (value: Partial<typeof provider>) => {
      provider = { ...provider, ...value }
    },
  }
}
it('receipt batch: concurrent duplicate collections fund once and commit both stock and coupon once across service instances', async () => {
  const f = await processingFixture(true)
  const results = await Promise.all(Array.from({ length: 6 }, () => f.processor().process(f.claim)))
  expect(results).toEqual(Array(6).fill('committed'))
  const records = paymentRecordModels(db.connection)
  expect(await records.intake.countDocuments()).toBe(1)
  expect(await records.collections.countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { physical: 10, reserved: 0, committed: 2 } })
  expect(
    await couponModels(db.connection).redemptions.findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({ status: 'redeemed' })
  const movements = await inventoryMovementModel(db.connection).countDocuments()
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(movements)
  expect(await orderModels(db.connection).orders.findById(f.result.id).lean()).toMatchObject({
    fulfillmentStatus: 'pending',
    fulfillmentHold: 'admin_review',
  })
})
it('receipt batch: stale independently verified failure cannot reverse paid proof or release capacity', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ status: 'FAILED' })
  const { validationId: _unused, ...claim } = f.claim
  expect(await f.processor().process(claim)).toBe('committed')
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})
it('receipt batch: later paid proof supersedes terminal failure without duplicate business effects', async () => {
  const f = await processingFixture()
  f.change({ status: 'FAILED' })
  const { validationId: _unused, ...claim } = f.claim
  expect(await f.processor().process(claim)).toBe('committed')
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_failed' })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  f.change({ status: 'VALIDATED' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
})
it.each(['risk', 'expired'])(
  'receipt batch: risk retains hold while expired paid capacity is recovered safely: %s',
  async (mode) => {
    const f = await processingFixture(true)
    if (mode === 'risk') f.change({ risk_level: '1' })
    else now = new Date(now.getTime() + 900001)
    expect(await f.processor().process(f.claim)).toBe('committed')
    expect(
      await paymentModel(db.connection)
        .findOne({ orderId: f.result.id })
        .sort({ generation: -1 })
        .lean(),
    ).toMatchObject({ paymentStatus: 'paid' })
    expect(
      await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
    ).toMatchObject({
      stock: mode === 'risk' ? { reserved: 2, committed: 0 } : { reserved: 0, committed: 2 },
    })
    expect(
      await couponModels(db.connection)
        .redemptions.findOne({ orderId: f.result.id })
        .sort({ generation: -1 })
        .lean(),
    ).toMatchObject({ status: mode === 'risk' ? 'held' : 'redeemed' })
  },
)
it.each(['unmatched', 'under', 'over', 'cancelled'])(
  'receipt batch: keeps %s verified collection in intake without invented funding',
  async (mode) => {
    const f = await processingFixture()
    if (mode === 'unmatched') f.change({ tran_id: 'unknown-attempt' })
    else if (mode === 'cancelled')
      await orderModels(db.connection).orders.updateOne(
        { _id: f.result.id, fulfillmentStatus: 'pending' },
        { $set: { fulfillmentStatus: 'cancelled', cancelledAt: now } },
      )
    else
      f.change({
        amount: mode === 'under' ? '10.00' : '99.00',
        currency_amount: mode === 'under' ? '10.00' : '99.00',
      })
    expect(await f.processor().process(f.claim)).toBe('committed')
    expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(1)
    expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(
      mode === 'cancelled' ? 1 : 0,
    )
    expect(
      await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean(),
    ).toMatchObject(
      mode === 'cancelled'
        ? {
            paymentStatus: 'paid',
            merchandiseFundedPoisha: 0,
            correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
          }
        : { paymentStatus: 'pending', verifiedCollectedPoisha: 0 },
    )
  },
)
it('receipt batch: offset-free provider time remains retryable and does not guess or lose historical evidence', async () => {
  const f = await processingFixture()
  f.change({ tran_date: '2026-10-29 12:00:00' })
  expect(await f.processor().process(f.claim)).toBe('retry')
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
})
it('receipt batch: conflicting duplicate amount is audited without rewriting the original receipt or funding', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ amount: '99.00', currency_amount: '99.00' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentRecordModels(db.connection).intake.findOne().lean()).toMatchObject({
    amountPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.receipt.conflict' }),
  ).toBe(1)
})
it('receipt batch: failure after stock writes rolls back stock, coupon, receipts and payment; retry can commit', async () => {
  const f = await processingFixture(true)
  const real = verifiedAllocationService(db.connection, () => now)
  const failing = paymentProcessingService(
    db.connection,
    f.verifier,
    verifiedFundingOrderAccess(db.connection),
    {
      ensureCommitted: real.ensureCommitted,
      commitLive: async (session, binding) => {
        await real.commitLive(session, binding)
        throw new Error('synthetic-after-allocation')
      },
    },
    () => now,
  )
  expect(await failing.process(f.claim)).toBe('retry')
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'pending',
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  expect(
    await couponModels(db.connection).redemptions.findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({ status: 'held' })
  expect(await f.processor().process(f.claim)).toBe('committed')
})
it('receipt batch: composed IPN acknowledges only after durable receipt/payment/allocation commit', async () => {
  const f = await processingFixture()
  const { root } = await initiationApp(true, f.gateway)
  await request(root)
    .post('/api/v1/webhooks/sslcommerz/ipn')
    .type('form')
    .send({ status: 'VALID', tran_id: f.attempt.tranId, val_id: 'processing-validation' })
    .expect(200, 'OK')
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})
it('receipt batch: a second distinct collection becomes correction without duplicate merchandise/stock effects', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ bank_tran_id: 'second-bank', val_id: 'second-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'second-validation' })).toBe(
    'committed',
  )
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(2)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(2)
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    unassignedCollectedPoisha: 0,
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
  expect(await orderModels(db.connection).orders.findById(f.result.id).lean()).toMatchObject({
    fulfillmentHold: 'admin_review',
  })
})
it('receipt batch: replayed independent high-risk proof escalates hold without collecting twice', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ risk_level: '1' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    riskStatus: 'review',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(await orderModels(db.connection).orders.findById(f.result.id).lean()).toMatchObject({
    fulfillmentHold: 'risk_review',
  })
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
})
it('receipt batch: simultaneous paid/failure processing never reverses money or releases the committed generation', async () => {
  const f = await processingFixture()
  const failed = paymentProcessingService(
    db.connection,
    {
      verify: async () => ({
        kind: 'nonpayment' as const,
        status: 'FAILED',
        mapping: {
          attemptId: f.attempt._id.toHexString(),
          paymentId: f.attempt.paymentId.toHexString(),
          orderId: f.result.id,
          expectedAmountPoisha: f.attempt.expectedAmountPoisha,
        },
        merchantAccountKey: f.claim.merchantAccountKey,
        evidenceDigest: 'a'.repeat(64),
      }),
    },
    verifiedFundingOrderAccess(db.connection),
    verifiedAllocationService(db.connection, () => now),
    () => now,
  )
  expect(await Promise.all([f.processor().process(f.claim), failed.process(f.claim)])).toEqual([
    'committed',
    'committed',
  ])
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})
it.each(['2026-02-31T12:00:00Z', '2026-10-29 12:00:00', '2026-10-29T25:00:00Z'])(
  'receipt batch: invalid or offset-free collection date %s cannot be committed',
  async (tran_date) => {
    const f = await processingFixture()
    f.change({ tran_date })
    expect(await f.processor().process(f.claim)).toBe('retry')
    expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
  },
)
it('receipt batch: real coupon commit failure after stock processing rolls back the entire receipt transaction', async () => {
  const f = await processingFixture(true)
  const coupons = couponModels(db.connection).coupons
  const promotion = await coupons.findOne({ codeNormalized: 'SYNTHETIC' }).orFail()
  await coupons.collection.updateOne({ _id: promotion._id }, { $set: { heldCount: 0 } })
  expect(await f.processor().process(f.claim)).toBe('retry')
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  await coupons.collection.updateOne({ _id: promotion._id }, { $set: { heldCount: 1 } })
  expect(await f.processor().process(f.claim)).toBe('committed')
})
it('receipt batch: competing expiry and verified late collection preserve money and never double-commit or release paid stock', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 900000)
  const expiry = inTransaction(db.connection, (session) =>
    checkoutExpiryService(db.connection, () => now).expire(session, f.result.id, 1),
  )
  const results = await Promise.allSettled([f.processor().process(f.claim), expiry])
  expect(results[0]).toEqual({ status: 'fulfilled', value: 'committed' })
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  const stock = await productModels(db.connection).variants.findById(f.selected.row._id).lean()
  expect(stock?.stock.committed).toBe(2)
  expect(stock?.stock.reserved).toBe(0)
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(1)
})
it('receipt batch: two distinct concurrent collections cannot overfund merchandise or double commit capacity', async () => {
  const f = await processingFixture()
  const first = await f.verifier.verify(f.claim)
  f.change({ val_id: 'parallel-validation', bank_tran_id: 'parallel-bank' })
  const second = await f.verifier.verify({ ...f.claim, validationId: 'parallel-validation' })
  const process = (verified: typeof first) =>
    paymentProcessingService(
      db.connection,
      { verify: async () => verified },
      verifiedFundingOrderAccess(db.connection),
      verifiedAllocationService(db.connection, () => now),
      () => now,
    ).process(f.claim)
  expect(await Promise.all([process(first), process(second)])).toEqual(['committed', 'committed'])
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    unassignedCollectedPoisha: 0,
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('receipt batch: explicit audit replay preserves the first event and rejects conflicting evidence', async () => {
  const writer = createAuditWriter(db.connection, true)
  const event = {
    actorType: 'system',
    action: 'synthetic.receipt.review',
    targetType: 'payment',
    operationKey: 'synthetic-audit-replay',
    occurredAt: now,
    afterDigest: 'a'.repeat(64),
  }
  await inTransaction(db.connection, (session) => writer(session, event))
  await inTransaction(db.connection, (session) =>
    writer(session, { ...event, occurredAt: new Date(now.getTime() + 1000) }),
  )
  await expect(
    inTransaction(db.connection, (session) =>
      writer(session, { ...event, afterDigest: 'b'.repeat(64) }),
    ),
  ).rejects.toThrow()
  expect(await db.connection.collection('auditLogs').countDocuments({ action: event.action })).toBe(
    1,
  )
})
it('receipt batch: later collection cannot downgrade an existing refund projection to paid', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  // Synthetic projection only: refund execution remains the owning returns/refunds workflow.
  await paymentModel(db.connection).updateOne(
    { orderId: f.result.id },
    { $set: { paymentStatus: 'partially_refunded' } },
  )
  f.change({ bank_tran_id: 'post-refund-bank', val_id: 'post-refund-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'post-refund-validation' })).toBe(
    'committed',
  )
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'partially_refunded',
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    unassignedCollectedPoisha: 0,
  })
})
async function lateRiskFixture(initialRisk = '1') {
  const f = await processingFixture(true)
  f.change({ risk_level: initialRisk })
  expect(await f.processor().process(f.claim)).toBe('committed')
  const orderAccess = verifiedFundingOrderAccess(db.connection)
  const settlement = paymentSettlementService(
    db.connection,
    orderAccess,
    verifiedAllocationService(db.connection, () => now),
    () => now,
  )
  const risk = paymentRiskService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    orderAccess,
    settlement,
    () => now,
  )
  const riskApp = createApp({ apiRouter: paymentRiskRoutes(risk, security, sessions) })
  const admin = await customer('admin')
  const paymentId = f.attempt.paymentId.toHexString()
  const post = (
    data = { decision: 'approve', reason: 'Synthetic independent review' },
    key = 'risk-review',
  ) =>
    request(riskApp)
      .post(`/api/v1/admin/payments/${paymentId}/risk-decisions`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(data)
  return { ...f, risk, riskApp, admin, paymentId, post }
}
it('late/risk batch: late funds recover released stock and coupon atomically under a new generation', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 900001)
  await inTransaction(db.connection, (session) =>
    checkoutExpiryService(db.connection, () => now).expire(session, f.result.id, 1),
  )
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await inventoryReservationModel(db.connection)
      .find({ orderId: f.result.id })
      .sort({ generation: 1 })
      .lean(),
  ).toMatchObject([
    { generation: 1, status: 'released' },
    { generation: 2, status: 'committed' },
  ])
  expect(
    await couponModels(db.connection)
      .redemptions.find({ orderId: f.result.id })
      .sort({ generation: 1 })
      .lean(),
  ).toMatchObject([
    { generation: 1, status: 'released' },
    { generation: 2, status: 'redeemed' },
  ])
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
})
it.each(['stock', 'coupon'])(
  'late/risk batch: unavailable %s preserves Paid and rolls back all partial reacquisition',
  async (missing) => {
    const f = await processingFixture(true)
    now = new Date(now.getTime() + 900001)
    await inTransaction(db.connection, (session) =>
      checkoutExpiryService(db.connection, () => now).expire(session, f.result.id, 1),
    )
    if (missing === 'stock')
      await productModels(db.connection).variants.updateOne(
        { _id: f.selected.row._id },
        { $set: { 'stock.physical': 0 } },
      )
    else
      await couponModels(db.connection).coupons.updateOne(
        { codeNormalized: 'SYNTHETIC' },
        { $set: { status: 'inactive' } },
      )
    expect(await f.processor().process(f.claim)).toBe('committed')
    expect(
      await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean(),
    ).toMatchObject({
      paymentStatus: 'paid',
      merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    })
    expect(
      await inventoryReservationModel(db.connection).countDocuments({
        orderId: f.result.id,
        generation: 2,
      }),
    ).toBe(0)
    expect(
      await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
    ).toMatchObject({ stock: { reserved: 0, committed: 0 } })
    expect(await orderModels(db.connection).orders.findById(f.result.id).lean()).toMatchObject({
      fulfillmentStatus: 'pending',
      fulfillmentHold: 'allocation_shortfall',
    })
  },
)
it('late/risk batch: cancelled late funds create one correction-only obligation without any reallocation or invented payout', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 900001)
  await inTransaction(db.connection, (session) =>
    checkoutExpiryService(db.connection, () => now).expire(session, f.result.id, 1),
  )
  await orderModels(db.connection).orders.updateOne(
    { _id: f.result.id, fulfillmentStatus: 'pending' },
    { $set: { fulfillmentStatus: 'cancelled', cancelledAt: now } },
  )
  expect(
    await Promise.all([f.processor().process(f.claim), f.processor().process(f.claim)]),
  ).toEqual(['committed', 'committed'])
  expect(await paymentModel(db.connection).findOne({ orderId: f.result.id }).lean()).toMatchObject({
    paymentStatus: 'paid',
    merchandiseFundedPoisha: 0,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    correctionRefundHeldPoisha: 0,
  })
  const refunds = await db.connection.collection('refunds').find({}).toArray()
  expect(refunds).toHaveLength(1)
  expect(refunds[0]).toMatchObject({
    status: 'under_review',
    capacityStatus: 'not_reserved',
    classification: 'payment_correction',
    amountPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(refunds[0]).not.toHaveProperty('method')
  expect(refunds[0]).not.toHaveProperty('policyVersion')
  expect(await orderModels(db.connection).orders.findById(f.result.id).lean()).toMatchObject({
    fulfillmentStatus: 'cancelled',
  })
  expect(await inventoryReservationModel(db.connection).countDocuments({ generation: 2 })).toBe(0)
})
it('late/risk batch: authorized approval clears risk only with once-only committed allocation and durable replay', async () => {
  const f = await lateRiskFixture()
  await f
    .post()
    .expect(200)
    .expect((result) =>
      expect(result.body.data).toEqual({ riskStatus: 'clear', fulfillmentHold: 'admin_review' }),
    )
  await f.post().expect(200)
  expect(
    await db.connection.collection('auditLogs').countDocuments({ action: 'payment.risk.decision' }),
  ).toBe(1)
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
  // Same already-reviewed provider flag is a replay, not a fresh risk review.
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    riskStatus: 'clear',
    paymentStatus: 'paid',
  })
  f.change({ bank_tran_id: 'new-risk-bank', val_id: 'new-risk-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'new-risk-validation' })).toBe(
    'committed',
  )
  await f
    .post()
    .expect(200)
    .expect((result) => expect(result.body.data.riskStatus).toBe('review'))
  await f.post({ decision: 'reject', reason: 'Different command' }).expect(409)
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    riskStatus: 'review',
  })
})
it('late/risk batch: rejection preserves verified Paid and risk hold without allocating, releasing or paying', async () => {
  const f = await lateRiskFixture()
  await f
    .post({ decision: 'reject', reason: 'Synthetic risk rejection' })
    .expect(200)
    .expect((result) =>
      expect(result.body.data).toEqual({ riskStatus: 'rejected', fulfillmentHold: 'risk_review' }),
    )
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
    riskStatus: 'rejected',
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  expect(await db.connection.collection('refunds').countDocuments()).toBe(0)
})
it('late/risk batch: approving expired risk payment without capacity keeps Paid on allocation hold', async () => {
  const f = await lateRiskFixture()
  now = new Date(now.getTime() + 900001)
  await productModels(db.connection).variants.updateOne(
    { _id: f.selected.row._id },
    { $set: { 'stock.physical': 2 } },
  )
  await couponModels(db.connection).coupons.updateOne(
    { codeNormalized: 'SYNTHETIC' },
    { $set: { status: 'inactive' } },
  )
  await f
    .post()
    .expect(200)
    .expect((result) =>
      expect(result.body.data).toEqual({
        riskStatus: 'clear',
        fulfillmentHold: 'allocation_shortfall',
      }),
    )
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(await inventoryReservationModel(db.connection).countDocuments({ generation: 2 })).toBe(0)
})
it('late/risk batch: admin route enforces Origin, CSRF, role, current account, exact input and durable key', async () => {
  const f = await lateRiskFixture(),
    path = `/api/v1/admin/payments/${f.paymentId}/risk-decisions`
  await request(f.riskApp).post(path).send({ decision: 'approve', reason: 'review' }).expect(403)
  await request(f.riskApp)
    .post(path)
    .set('Cookie', f.admin.cookie)
    .set('Origin', 'http://localhost:5173')
    .send({ decision: 'approve', reason: 'review' })
    .expect(403)
  await request(f.riskApp)
    .post(path)
    .set('Cookie', f.who.cookie)
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', f.who.csrf)
    .send({ decision: 'approve', reason: 'review' })
    .expect(403)
  await f.post({ decision: 'approve', reason: '' }).expect(400)
  await f.post({ decision: 'approve', reason: 'review' }, '').expect(400)
  await identities.users.updateOne({ _id: f.admin.user._id }, { $set: { status: 'suspended' } })
  await f.post().expect(403)
  await expect(
    f.risk.decide(
      f.admin.credentials.customerToken,
      f.paymentId,
      { decision: 'approve', reason: 'Direct service denial' },
      'direct-denial',
    ),
  ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    riskStatus: 'review',
  })
})
it.each(['stock', 'coupon'])(
  'late/risk batch: concurrent paid orders competing for last %s retain both collections but commit only one allocation',
  async (capacity) => {
    if (capacity === 'coupon') await coupon({ overallLimit: 1 })
    const first = await processingFixture(capacity === 'coupon')
    now = new Date(now.getTime() + 900001)
    await inTransaction(db.connection, (session) =>
      checkoutExpiryService(db.connection, () => now).expire(session, first.result.id, 1),
    )
    const second = await processingFixture(
      capacity === 'coupon',
      capacity === 'stock' ? first.selected : undefined,
    )
    second.change({ val_id: 'other-validation', bank_tran_id: 'other-bank' })
    now = new Date(now.getTime() + 900001)
    await inTransaction(db.connection, (session) =>
      checkoutExpiryService(db.connection, () => now).expire(session, second.result.id, 1),
    )
    if (capacity === 'stock')
      await productModels(db.connection).variants.updateOne(
        { _id: first.selected.row._id },
        { $set: { 'stock.physical': 2 } },
      )
    expect(
      await Promise.all([
        first.processor().process(first.claim),
        second.processor().process({ ...second.claim, validationId: 'other-validation' }),
      ]),
    ).toEqual(['committed', 'committed'])
    expect(await paymentModel(db.connection).countDocuments({ paymentStatus: 'paid' })).toBe(2)
    expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(2)
    expect(
      await inventoryReservationModel(db.connection).countDocuments({ status: 'committed' }),
    ).toBe(1)
    expect(
      await orderModels(db.connection).orders.countDocuments({
        fulfillmentHold: 'allocation_shortfall',
      }),
    ).toBe(1)
    if (capacity === 'coupon')
      expect(
        await couponModels(db.connection).coupons.findOne({ codeNormalized: 'SYNTHETIC' }).lean(),
      ).toMatchObject({ heldCount: 0, redeemedCount: 1 })
    else
      expect(
        await productModels(db.connection).variants.findById(first.selected.row._id).lean(),
      ).toMatchObject({ stock: { physical: 2, reserved: 0, committed: 2 } })
  },
)
it('late/risk batch: competing authorized decisions have one audited winner with no duplicate allocation or automatic payout', async () => {
  const f = await lateRiskFixture()
  const results = await Promise.all([
    f.post({ decision: 'approve', reason: 'Synthetic approval' }, 'approve-key'),
    f.post({ decision: 'reject', reason: 'Synthetic rejection' }, 'reject-key'),
  ])
  expect(results.map((result) => result.status).sort()).toEqual([200, 409])
  expect(
    await db.connection.collection('auditLogs').countDocuments({ action: 'payment.risk.decision' }),
  ).toBe(1)
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(await db.connection.collection('refunds').countDocuments()).toBe(0)
})
it('late/risk batch: a new flag holds already confirmed fulfillment and approval needs retained committed capacity', async () => {
  const f = await lateRiskFixture('0')
  // Synthetic confirmed projection; the owning confirmation workflow is not activated by this test.
  await orderModels(db.connection).orders.updateOne(
    { _id: f.result.id, fulfillmentStatus: 'pending' },
    { $set: { fulfillmentStatus: 'confirmed', confirmedAt: now, fulfillmentHold: 'none' } },
  )
  f.change({ risk_level: '1' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await orderModels(db.connection).orders.findById(f.result.id).lean()).toMatchObject({
    fulfillmentStatus: 'confirmed',
    fulfillmentHold: 'risk_review',
  })
  await f
    .post()
    .expect(200)
    .expect((result) =>
      expect(result.body.data).toEqual({ riskStatus: 'clear', fulfillmentHold: 'none' }),
    )
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('late/risk batch: independently verified contradictory risk description holds funds without fabricating the numeric risk level', async () => {
  const f = await processingFixture()
  f.change({ risk_level: '0', risk_title: 'Not Safe' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
    riskStatus: 'review',
  })
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ riskLevel: 0, riskTitle: 'Not Safe' })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
})

it('late/risk batch: missing audit protection cannot clear risk and the identical key works after safe repair', async () => {
  const f = await lateRiskFixture()
  await db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await f.post().expect(503)
    expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
      riskStatus: 'review',
    })
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  await f.post().expect(200)
})
it('late/risk batch: actual root composition registers current-admin decisions only when admin auth is enabled', async () => {
  const f = await lateRiskFixture()
  const { root } = await initiationApp(false, undefined, true)
  await request(root)
    .post(`/api/v1/admin/payments/${f.paymentId}/risk-decisions`)
    .set('Origin', 'https://admin.example.test')
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .set('Idempotency-Key', 'root-risk')
    .send({ decision: 'approve', reason: 'Synthetic root review' })
    .expect(200)
  const disabled = await initiationApp(false)
  await request(disabled.root)
    .post(`/api/v1/admin/payments/${f.paymentId}/risk-decisions`)
    .send({ decision: 'approve', reason: 'No admin activation' })
    .expect(404)
})
it('late/risk batch: distinct fresh verified risk descriptions on one receipt each create a review without duplicate money', async () => {
  const f = await lateRiskFixture()
  await f.post().expect(200)
  f.change({ risk_title: 'Not Safe' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  await f
    .post({ decision: 'approve', reason: 'Second verified flag reviewed' }, 'second-risk')
    .expect(200)
  f.change({ risk_title: 'Manual Review' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentModel(db.connection).findById(f.paymentId).lean()).toMatchObject({
    riskStatus: 'review',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.receipt.risk_escalation' }),
  ).toBe(2)
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(1)
})
const reconcileOptions = {
  batchSize: 10,
  leaseMs: 30000,
  pollIntervalMs: 1000,
  terminalPollIntervalMs: 5000,
  escalateAfterMs: 5000,
}
function reconciliation(
  f: Awaited<ReturnType<typeof processingFixture>>,
  options = reconcileOptions,
) {
  const domain = paymentReconciliationService(
    db.connection,
    f.processor(),
    f.claim.merchantAccountKey,
    options,
    () => now,
  )
  return { domain, job: paymentReconciliationJob(db.connection, domain, options, () => now) }
}
it('multi/reconcile batch: independently paid overlapping attempts preserve both sources, one merchandise allocation and one correction obligation', async () => {
  const f = await processingFixture(true)
  f.change({ status: 'FAILED' })
  const { validationId: _unused, ...queryClaim } = f.claim
  expect(await f.processor().process(queryClaim)).toBe('committed')
  const { root } = await initiationApp(true, undefined, false, f.gateway)
  const response = await request(root)
    .post(`/api/v1/orders/${f.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', f.who.cookie)
    .set('X-CSRF-Token', f.who.csrf)
    .set('Idempotency-Key', 'second-attempt')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  const second = await paymentRecordModels(db.connection)
    .attempts.findById(response.body.data.attemptId)
    .orFail()
  f.change({ status: 'VALIDATED' })
  const firstProof = await f.verifier.verify(f.claim)
  f.change({
    tran_id: second.tranId,
    val_id: 'second-attempt-validation',
    bank_tran_id: 'second-attempt-bank',
  })
  const secondProof = await f.verifier.verify({
    ...f.claim,
    tranId: second.tranId,
    validationId: 'second-attempt-validation',
  })
  const process = (proof: typeof firstProof) =>
    paymentProcessingService(
      db.connection,
      { verify: async () => proof },
      verifiedFundingOrderAccess(db.connection),
      verifiedAllocationService(db.connection, () => now),
      () => now,
    ).process(f.claim)
  expect(await Promise.all([process(firstProof), process(secondProof)])).toEqual([
    'committed',
    'committed',
  ])
  expect(
    await paymentRecordModels(db.connection).attempts.countDocuments({ state: 'verified_paid' }),
  ).toBe(2)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(2)
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    merchandiseRefundHeldPoisha: 0,
    correctionRefundHeldPoisha: 0,
  })
  expect(
    await db.connection
      .collection('refunds')
      .countDocuments({ classification: 'payment_correction' }),
  ).toBe(1)
  expect(
    await couponModels(db.connection).coupons.findOne({ codeNormalized: 'SYNTHETIC' }).lean(),
  ).toMatchObject({ redeemedCount: 1, heldCount: 0 })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
  expect(await process(firstProof)).toBe('committed')
  expect(await db.connection.collection('refunds').countDocuments()).toBe(1)
})
it('multi/reconcile batch: missing IPN is recovered by the merchant query with durable scheduling and repeat/restart safety', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 1001)
  expect(await reconciliation(f).job.run()).toMatchObject({
    acquired: true,
    scanned: 1,
    resolved: 1,
  })
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(await reconciliation(f).job.run()).toMatchObject({ scanned: 0 })
  now = new Date(now.getTime() + 5001)
  expect(await reconciliation(f).job.run()).toMatchObject({ scanned: 1, resolved: 1 })
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})
it('multi/reconcile batch: provider timeouts remain uncertain and bounded retries escalate once without fabricating failure', async () => {
  const f = await processingFixture()
  now = new Date(now.getTime() + 1001)
  f.transport.mockRejectedValue(new Error('private timeout detail'))
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 0 })
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'uncertain' })
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'pending',
  })
  expect(await reconciliation(f).job.run()).toMatchObject({ scanned: 0 })
  now = new Date(now.getTime() + 6000)
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 1 })
  now = new Date(now.getTime() + 1001)
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 0 })
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.escalated' }),
  ).toBe(1)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
})
it('multi/reconcile batch: competing job instances and IPN apply the independently verified collection once', async () => {
  const f = await processingFixture()
  now = new Date(now.getTime() + 1001)
  const results = await Promise.all([
    reconciliation(f).job.run(),
    reconciliation(f).job.run(),
    f.processor().process(f.claim),
  ])
  expect(results[2]).toBe('committed')
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})
it('multi/reconcile batch: expired runner cannot commit a provider result or checkpoint after lease takeover', async () => {
  const f = await processingFixture()
  now = new Date(now.getTime() + 1001)
  let release!: () => void, started!: () => void
  const barrier = new Promise<void>((resolve) => {
      release = resolve
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve
    })
  const actual = f.transport.getMockImplementation()
  if (!actual) throw new Error('Missing synthetic transport')
  let first = true
  f.transport.mockImplementation(async (...args) => {
    if (first) {
      first = false
      started()
      await barrier
    }
    return actual(...args)
  })
  const old = reconciliation(f).job.run()
  const oldResult = old.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await ready
  now = new Date(now.getTime() + 30001)
  expect(await reconciliation(f).job.run()).toMatchObject({ acquired: true, resolved: 1 })
  release()
  expect(await oldResult).toHaveProperty('error')
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
})
it('multi/reconcile batch: a crash after durable collection before scheduling checkpoint replays safely on restart', async () => {
  const f = await processingFixture()
  now = new Date(now.getTime() + 1001)
  const original = reconciliation(f)
  const failing = paymentReconciliationJob(
    db.connection,
    {
      ...original.domain,
      reconcile: async (id, fence) => {
        await original.domain.reconcile(id, fence)
        throw new Error('synthetic-after-commit')
      },
    },
    reconcileOptions,
    () => now,
  )
  await expect(failing.run()).rejects.toThrow('synthetic-after-commit')
  now = new Date(now.getTime() + 5001)
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
  expect(await db.connection.collection('refunds').countDocuments()).toBe(0)
})
it('multi/reconcile batch: a later provider recovery resolves an escalation without replaying collection', async () => {
  const f = await processingFixture(),
    actual = f.transport.getMockImplementation()
  if (!actual) throw new Error('Missing synthetic transport')
  now = new Date(now.getTime() + 6000)
  f.transport.mockRejectedValue(new Error('synthetic-timeout'))
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 1 })
  f.transport.mockImplementation(actual)
  now = new Date(now.getTime() + 1001)
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.resolved' }),
  ).toBe(1)
  now = new Date(now.getTime() + 5001)
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.resolved' }),
  ).toBe(1)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
})
it('multi/reconcile batch: timing out while revisiting Paid preserves its proof and reports unresolved verification', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  now = new Date(now.getTime() + 6000)
  f.transport.mockRejectedValue(new Error('synthetic-later-timeout'))
  expect(await reconciliation(f).job.run()).toMatchObject({
    resolved: 0,
    unresolved: 1,
    escalated: 1,
  })
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
})
it('multi/reconcile batch: merchant rotation cannot query or change an old account attempt', async () => {
  const f = await processingFixture()
  now = new Date(now.getTime() + 1001)
  const domain = paymentReconciliationService(
    db.connection,
    f.processor(),
    'f'.repeat(64),
    reconcileOptions,
    () => now,
  )
  expect(
    await paymentReconciliationJob(db.connection, domain, reconcileOptions, () => now).run(),
  ).toMatchObject({ scanned: 1, skipped: 1 })
  expect(f.transport).not.toHaveBeenCalled()
  expect(
    await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'initiated' })
})
it('multi/reconcile batch: persistent cursor advances past unresolved records and wraps without starving later attempts', async () => {
  const first = await processingFixture(),
    second = await processingFixture()
  first.transport.mockRejectedValue(new Error('synthetic-unavailable'))
  now = new Date(now.getTime() + 1001)
  const options = { ...reconcileOptions, batchSize: 1 }
  expect(await reconciliation(first, options).job.run()).toMatchObject({
    scanned: 1,
    unresolved: 1,
  })
  expect(await reconciliation(first, options).job.run()).toMatchObject({
    scanned: 1,
    unresolved: 1,
  })
  expect(
    await paymentRecordModels(db.connection).attempts.findById(second.attempt._id).lean(),
  ).toMatchObject({ state: 'uncertain' })
  expect(await reconciliation(first, options).job.run()).toMatchObject({ scanned: 0 })
  now = new Date(now.getTime() + 1001)
  expect(await reconciliation(first, options).job.run()).toMatchObject({ scanned: 1 })
})
it('multi/reconcile batch: compiled worker requires explicit local/test policy, emits only counts and refuses deployed execution', async () => {
  const f = await processingFixture()
  const env = {
    ...identityEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
    PAYMENT_RECONCILIATION_ENABLED: 'true',
    PAYMENT_RECONCILIATION_BATCH_SIZE: '10',
    PAYMENT_RECONCILIATION_LEASE_MS: '30000',
    PAYMENT_RECONCILIATION_POLL_MS: '86400000',
    PAYMENT_RECONCILIATION_TERMINAL_POLL_MS: '86400000',
    PAYMENT_RECONCILIATION_ESCALATE_AFTER_MS: '86400000',
    SSLCOMMERZ_ADAPTER_ENABLED: 'true',
    SSLCOMMERZ_MODE: 'sandbox',
    SSLCOMMERZ_STORE_ID: 'synthetic-store',
    SSLCOMMERZ_STORE_PASSWORD: 'synthetic-password',
    SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test',
    SSLCOMMERZ_TIMEOUT_MS: '1000',
  }
  const hook =
    'globalThis.fetch = () => { throw new Error("Provider network forbidden in fixture") };'
  const run = (change: NodeJS.ProcessEnv = {}) =>
    spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(hook)}`,
        'scripts/reconcile-payments.mjs',
      ],
      { env: { ...env, ...change }, encoding: 'utf8', timeout: 15000 },
    )
  const result = run()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ action: 'payment_reconciliation', scanned: 0 })
  expect(result.stdout).not.toContain(f.attempt.tranId)
  expect(result.stdout).not.toContain(env.SSLCOMMERZ_STORE_PASSWORD)
  expect(run({ PAYMENT_RECONCILIATION_ENABLED: 'false' }).status).toBe(1)
  expect(run({ PAYMENT_RECONCILIATION_POLL_MS: '' }).status).toBe(1)
  const deployed = { ...env, APP_ENV: 'production', NODE_ENV: 'production' }
  expect(loadEnvironment(deployed).APP_ENV).toBe('production')
  expect(run(deployed).status).toBe(1)
})
it('multi/reconcile batch: lease expiry after allocation writes aborts receipt, money and stock before an old runner can commit', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 1001)
  const allocation = verifiedAllocationService(db.connection, () => now)
  const expiring = paymentProcessingService(
    db.connection,
    f.verifier,
    verifiedFundingOrderAccess(db.connection),
    {
      ...allocation,
      commitLive: async (session, binding) => {
        const result = await allocation.commitLive(session, binding)
        now = new Date(now.getTime() + 30001)
        return result
      },
    },
    () => now,
  )
  const domain = paymentReconciliationService(
    db.connection,
    expiring,
    f.claim.merchantAccountKey,
    reconcileOptions,
    () => now,
  )
  await expect(
    paymentReconciliationJob(db.connection, domain, reconcileOptions, () => now).run(),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'pending',
  })
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
})
it('multi/reconcile batch: a Paid attempt with new quarantined money remains an unresolved admin investigation', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  now = new Date(now.getTime() + 6000)
  f.change({
    amount: '99.00',
    currency_amount: '99.00',
    val_id: 'quarantine-validation',
    bank_tran_id: 'quarantine-bank',
  })
  expect(await reconciliation(f).job.run()).toMatchObject({
    unresolved: 1,
    resolved: 0,
    escalated: 1,
  })
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(2)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
})
const retryPost = (
  root: ReturnType<typeof createApp>,
  f: Awaited<ReturnType<typeof processingFixture>>,
  key: string,
) =>
  request(root)
    .post(`/api/v1/orders/${f.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', f.who.cookie)
    .set('X-CSRF-Token', f.who.csrf)
    .set('Idempotency-Key', key)
    .send({ requestedChannel: 'bkash' })
it('retry/notification batch: fresh verified nonpayment precedes renewed stock/coupon generation and one new hosted dispatch', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 900001)
  f.change({ status: 'FAILED' })
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  const first = await retryPost(root, f, 'safe-retry').expect(200)
  expect(first.body.data.attemptId).not.toBe(f.attempt._id.toHexString())
  expect(transport).toHaveBeenCalledTimes(1)
  const reads = f.transport.mock.calls.length
  await retryPost(root, f, 'safe-retry').expect(200)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(f.transport).toHaveBeenCalledTimes(reads)
  const stock = await inventoryReservationModel(db.connection)
    .find({ orderId: f.result.id })
    .sort({ generation: 1 })
    .lean()
  expect(stock).toMatchObject([
    { generation: 1, status: 'released' },
    { generation: 2, status: 'held', heldAt: now },
  ])
  const coupon = await couponModels(db.connection)
    .redemptions.findOne({ orderId: f.result.id, generation: 2 })
    .orFail()
  expect(coupon.heldAt).toEqual(stock[1]?.heldAt)
  expect(coupon.expiresAt).toEqual(stock[1]?.expiresAt)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
})
it.each(['pending', 'timeout', 'paid'])(
  'retry/notification batch: %s previous outcome cannot produce a new charge',
  async (outcome) => {
    const f = await processingFixture(true)
    if (outcome === 'pending') f.change({ status: 'PENDING' })
    if (outcome === 'timeout') f.transport.mockRejectedValue(new Error('synthetic-timeout'))
    const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
    await retryPost(root, f, 'blocked-retry').expect(409)
    expect(transport).not.toHaveBeenCalled()
    expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
    if (outcome === 'paid')
      expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
        paymentStatus: 'paid',
      })
  },
)
it('retry/notification batch: revoked ownership after provider read prevents retry dispatch and capacity mutation', async () => {
  const f = await processingFixture(true)
  f.change({ status: 'FAILED' })
  const original = f.transport.getMockImplementation()
  if (!original) throw new Error('Missing synthetic transport')
  f.transport.mockImplementation(async (...args) => {
    await identities.users.updateOne({ _id: f.who.user._id }, { $set: { status: 'suspended' } })
    return original(...args)
  })
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  await retryPost(root, f, 'revoked-retry').expect(403)
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
})
function paymentDelivery(adapter: EmailAdapter) {
  const store = createRegistrationNotifications(db.connection, () => now)
  return createNotificationDeliveryService(
    store,
    adapter,
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 10 },
    () => now,
    undefined,
    undefined,
    undefined,
    undefined,
    paymentMessageService(
      paymentNotificationAccess(
        db.connection,
        verifiedFundingOrderAccess(db.connection).notificationTarget,
      ),
    ),
  )
}
it('retry/notification batch: duplicate paid receipts queue one accurate email and retry delivery never replays money', async () => {
  const f = await processingFixture()
  expect(
    await Promise.all([f.processor().process(f.claim), f.processor().process(f.claim)]),
  ).toEqual(['committed', 'committed'])
  expect(
    await db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'payment_success' }),
  ).toBe(1)
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValueOnce({ kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' })
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-mail' })
  await paymentDelivery({ send }).runBatch()
  now = new Date(now.getTime() + 1001)
  await paymentDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[0]?.[0].idempotencyKey).toBe(send.mock.calls[1]?.[0].idempotencyKey)
  expect(send.mock.calls[0]?.[0].text).toContain('does not confirm fulfillment')
  expect(send.mock.calls[0]?.[0].text).not.toMatch(/synthetic-bank|synthetic-password|card/)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
})
it('retry/notification batch: verified failure and pending are deduped, while stale negative messages are suppressed after Paid', async () => {
  const f = await processingFixture()
  f.change({ status: 'PENDING' })
  const { validationId: _unused, ...claim } = f.claim
  expect(await f.processor().process(claim)).toBe('retry')
  expect(await f.processor().process(claim)).toBe('retry')
  expect(
    await db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'payment_pending' }),
  ).toBe(1)
  f.change({ status: 'FAILED' })
  expect(await f.processor().process(claim)).toBe('committed')
  f.change({ status: 'VALIDATED' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-mail' })
  await paymentDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[0].subject).toContain('payment success')
})
it('retry/notification batch: tampered recipient cannot receive a financial notification', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  await db.connection
    .collection('notifications')
    .updateOne(
      { eventType: 'payment_success' },
      { $set: { 'recipient.emailNormalized': 'other@example.test' } },
    )
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' })
  await paymentDelivery({ send }).runBatch()
  expect(send).not.toHaveBeenCalled()
})
it('retry/notification batch: competing fresh retry keys cannot create overlapping new dispatches', async () => {
  const f = await processingFixture(true)
  f.change({ status: 'FAILED' })
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  const results = await Promise.all([retryPost(root, f, 'retry-A'), retryPost(root, f, 'retry-B')])
  expect(results.map((result) => result.status).sort()).toEqual([200, 409])
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(2)
  expect(
    await productModels(db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
})
it('retry/notification batch: email timeout remains delivery_uncertain without resending or reversing Paid', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' })
  await paymentDelivery({ send }).runBatch()
  now = new Date(now.getTime() + 60000)
  await paymentDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(
    await db.connection.collection('notifications').findOne({ eventType: 'payment_success' }),
  ).toMatchObject({ status: 'delivery_uncertain' })
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
})
it('retry/notification batch: actual notification worker activates payment templates explicitly and never sends a welcome fallback', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  const config = loadEnvironment(identityEnvironment())
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-payment-email' })
  const settings = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    claimTtlMs: 30000,
    batchSize: 10,
  }
  await (
    await composeNotificationWorker(db.connection, config, { adapter: { send }, settings })
  ).runBatch()
  expect(send).not.toHaveBeenCalled()
  await (
    await composeNotificationWorker(db.connection, config, {
      adapter: { send },
      settings,
      paymentsEnabled: true,
    })
  ).runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[0].subject).toContain('payment success')
})
it('retry/notification batch: new coupon terms that cannot honor accepted pricing leave a durable shortfall without dispatch', async () => {
  const f = await processingFixture(true)
  now = new Date(now.getTime() + 900001)
  f.change({ status: 'FAILED' })
  await couponModels(db.connection).coupons.updateOne(
    { codeNormalized: 'SYNTHETIC' },
    { $set: { status: 'inactive' } },
  )
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  await retryPost(root, f, 'coupon-review')
    .expect(200)
    .expect((result) => expect(result.body.data.state).toBe('allocation_shortfall'))
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
  expect(await inventoryReservationModel(db.connection).countDocuments({ generation: 2 })).toBe(0)
})
it('retry/notification batch: notification-intent persistence failure is retryable and cannot partially commit payment or allocation', async () => {
  const f = await processingFixture(true)
  await db.connection.collection('notifications').dropIndex('notifications_event_key_unique')
  try {
    expect(await f.processor().process(f.claim)).toBe('retry')
    expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
    expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
      paymentStatus: 'pending',
    })
  } finally {
    await createRegistrationNotifications(db.connection).initialize()
  }
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'payment_success' }),
  ).toBe(1)
})
it('retry/notification batch: new verified quarantined money suppresses an old unsuccessful-attempt email', async () => {
  const f = await processingFixture()
  f.change({ status: 'FAILED' })
  const { validationId: _unused, ...claim } = f.claim
  expect(await f.processor().process(claim)).toBe('committed')
  f.change({ status: 'VALIDATED', amount: '99.00', currency_amount: '99.00' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-email' })
  await paymentDelivery({ send }).runBatch()
  expect(send).not.toHaveBeenCalled()
})
it('retry/notification batch: a late Paid callback before retry admission prevents any fresh hosted charge', async () => {
  const f = await processingFixture(true)
  const paid = await f.verifier.verify(f.claim)
  const applyPaid = paymentProcessingService(
    db.connection,
    { verify: async () => paid },
    verifiedFundingOrderAccess(db.connection),
    verifiedAllocationService(db.connection, () => now),
    () => now,
  )
  f.change({ status: 'FAILED' })
  const original = f.transport.getMockImplementation()
  if (!original) throw new Error('Missing synthetic transport')
  let applied = false
  f.transport.mockImplementation(async (...args) => {
    const result = await original(...args)
    if (!applied) {
      applied = true
      expect(await applyPaid.process(f.claim)).toBe('committed')
    }
    return result
  })
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  await retryPost(root, f, 'late-paid-race').expect(409)
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentRecordModels(db.connection).attempts.countDocuments()).toBe(1)
  expect(await paymentModel(db.connection).findById(f.attempt.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
})

async function monitorFixture() {
  const f = await processingFixture(),
    admin = await customer('admin')
  const service = paymentMonitorService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
  )
  const monitorApp = createApp({ apiRouter: paymentMonitorRoutes(service, security, sessions) })
  const paymentId = f.attempt.paymentId.toHexString(),
    path = `/api/v1/admin/payments/${paymentId}`
  const get = (suffix = '') =>
    request(monitorApp).get(`${path}${suffix}`).set('Cookie', admin.cookie)
  const reconcile = (
    body: object = { reason: 'Investigate missing IPN' },
    key = 'manual-reconcile',
  ) =>
    request(monitorApp)
      .post(`${path}/reconcile`)
      .set('Cookie', admin.cookie)
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(body)
  return { ...f, admin, service, monitorApp, paymentId, path, get, reconcile }
}
it('monitor/claim batch: payment list/detail enforce current admin scope and strict bounded pagination', async () => {
  const f = await monitorFixture()
  await request(f.monitorApp).get('/api/v1/admin/payments').expect(401)
  await request(f.monitorApp).get(f.path).set('Cookie', f.who.cookie).expect(401)
  const result = await request(f.monitorApp)
    .get('/api/v1/admin/payments?pageSize=1&method=online')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(result.body.data.items).toHaveLength(1)
  expect(result.body.meta).toMatchObject({ page: 1, pageSize: 1, totalItems: 1 })
  await f.get('?pageSize=101').expect(400)
  await f.get('?providerPassword=secret').expect(400)
  await identities.users.updateOne({ _id: f.admin.user._id }, { $set: { status: 'suspended' } })
  await f.get().expect(401)
})
it('monitor/claim batch: allowlisted detail preserves collections/corrections and excludes provider secrets and free text', async () => {
  const f = await monitorFixture()
  await f.processor().process(f.claim)
  f.change({ bank_tran_id: 'second-secret-bank', val_id: 'second-secret-validation' })
  await f.processor().process({ ...f.claim, validationId: 'second-secret-validation' })
  const result = await f.get('?pageSize=1').expect(200)
  expect(result.body.data.collections).toHaveLength(1)
  expect(result.body.data.pagination.collections.totalItems).toBe(2)
  expect(result.body.data.corrections).toHaveLength(1)
  expect(result.body.data.payment.paymentStatus).toBe('paid')
  const encoded = JSON.stringify(result.body)
  for (const secret of [
    'providerSessionId',
    'bankTranId',
    'validationId',
    'merchantAccountKey',
    'evidenceDigest',
    'second-secret-bank',
    'customerSnapshot',
    'reason',
  ])
    expect(encoded).not.toContain(secret)
})
it('monitor/claim batch: quarantined/unmatched investigation is admin-only and cannot assign or discard funds', async () => {
  const f = await monitorFixture()
  f.change({ amount: '1.00' })
  await f.processor().process(f.claim)
  const result = await request(f.monitorApp)
    .get('/api/v1/admin/payments?view=quarantined')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(result.body.data.intake).toHaveLength(1)
  expect(result.body.data.items).toEqual([])
  expect(result.body.data.intake[0]).toMatchObject({
    matchingStatus: 'quarantined',
    amountPoisha: 100,
  })
  await request(f.monitorApp)
    .get('/api/v1/admin/payments?view=quarantined&method=online')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
})
it('monitor/claim batch: reconciliation queues once with immutable evidence, CSRF and changed-key-body protection', async () => {
  const f = await monitorFixture(),
    original = await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean()
  await request(f.monitorApp)
    .post(`${f.path}/reconcile`)
    .set('Cookie', f.admin.cookie)
    .send({ reason: 'review' })
    .expect(403)
  await f.reconcile({ reason: '' }).expect(400)
  await f.reconcile().expect(202)
  await f.reconcile().expect(202)
  await f.reconcile({ reason: 'changed' }).expect(409)
  const after = await paymentRecordModels(db.connection).attempts.findById(f.attempt._id).lean()
  expect(after).toEqual(original)
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.request' }),
  ).toBe(1)
  expect((await paymentModel(db.connection).findById(f.paymentId))?.paymentStatus).toBe('pending')
})
it('monitor/claim batch: concurrent reconciliation keys replay safely without replaying provider calls', async () => {
  const f = await monitorFixture()
  const results = await Promise.all([f.reconcile(), f.reconcile(), f.reconcile()])
  expect(results.every((r) => r.status === 202)).toBe(true)
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.request' }),
  ).toBe(1)
})
it('monitor/claim batch: manual request makes recent attempts due without falsifying lastCheckedAt', async () => {
  const f = await monitorFixture()
  const checked = new Date(Date.now() - 1000)
  await paymentRecordModels(db.connection).attempts.updateOne(
    { _id: f.attempt._id, state: f.attempt.state },
    { $set: { lastCheckedAt: checked } },
  )
  const worker = paymentReconciliationService(
    db.connection,
    f.processor(),
    f.claim.merchantAccountKey,
    {
      batchSize: 10,
      leaseMs: 10000,
      pollIntervalMs: 60000,
      terminalPollIntervalMs: 60000,
      escalateAfterMs: 60000,
    },
    () => new Date(),
  )
  expect(await worker.due()).not.toContain(f.attempt._id.toHexString())
  await f.reconcile().expect(202)
  expect(await worker.due()).toContain(f.attempt._id.toHexString())
  expect(
    (await paymentRecordModels(db.connection).attempts.findById(f.attempt._id))?.lastCheckedAt,
  ).toEqual(checked)
  await worker.reconcile(f.attempt._id.toHexString(), async () => {})
  expect(await worker.due()).not.toContain(f.attempt._id.toHexString())
})
it('monitor/claim batch: missing audit protection rolls back manual request and permits recovery with same key', async () => {
  const f = await monitorFixture()
  await db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await f.reconcile().expect(503)
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect(
    await db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.request' }),
  ).toBe(0)
  await f.reconcile().expect(202)
})
it('monitor/claim batch: actual root exposes monitoring only with admin activation', async () => {
  const f = await monitorFixture(),
    disabled = await initiationApp(true),
    enabled = await initiationApp(true, undefined, true)
  await request(disabled.root).get(f.path).set('Cookie', f.admin.cookie).expect(404)
  await request(enabled.root).get(f.path).set('Cookie', f.admin.cookie).expect(200)
})
it('monitor/claim batch: attempt/collection identity filters intersect without disclosing unmatched records', async () => {
  const f = await monitorFixture()
  await f.processor().process(f.claim)
  const collection = await paymentRecordModels(db.connection).collections.findOne({
    paymentId: f.paymentId,
  })
  if (!collection) throw new Error('Missing collection')
  const list = (query: string) =>
    request(f.monitorApp).get(`/api/v1/admin/payments?${query}`).set('Cookie', f.admin.cookie)
  const found = await list(
    `attemptId=${f.attempt._id.toHexString()}&collectionId=${collection._id.toHexString()}`,
  ).expect(200)
  expect(found.body.data.items[0].id).toBe(f.paymentId)
  expect(
    (await list(`attemptId=${new Types.ObjectId().toHexString()}`).expect(200)).body.data.items,
  ).toEqual([])
  await f.reconcile({ reason: 'review', paymentStatus: 'paid' }).expect(400)
  await request(f.monitorApp)
    .get(`/api/v1/admin/payments/${new Types.ObjectId().toHexString()}`)
    .set('Cookie', f.admin.cookie)
    .expect(404)
})

async function lifecycleFixture(approved = true) {
  await initializePaymentRecordPersistence(db.connection)
  await initializeCorrectionPersistence(db.connection)
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await service.create(who.credentials, input)
  const placed = await placeCod(who, submit(input, quote)).expect(201),
    id = placed.body.data.order.id
  const payment = await paymentModel(db.connection).findOne({ orderId: id }).orFail(),
    admin = await customer('admin'),
    adminAccess = createAdminAccountAccess(db.connection, identities, sessions)
  const lifecycle = orderLifecycleService(
    db.connection,
    adminAccess,
    fulfillmentPaymentAccess(db.connection),
    fulfillmentAllocationService(db.connection, () => now),
    approved ? async () => {} : undefined,
    () => now,
  )
  const token = admin.credentials.customerToken
  const move = (to: string, key = to) =>
    lifecycle.transition(
      token,
      id,
      {
        to,
        reason: 'Synthetic lifecycle review',
        ...(to === 'shipped'
          ? { dispatchReference: 'synthetic-dispatch', carrierLabel: 'Store delivery' }
          : {}),
      },
      key,
    )
  const collectedAt = new Date(now)
  const proof = (data: {
    paymentId: string
    amountPoisha: number
    collectionReference: string
    evidenceRef: string
  }) => ({
    paymentId: data.paymentId,
    amountPoisha: data.amountPoisha,
    collectionReference: data.collectionReference,
    evidenceRef: data.evidenceRef,
    collectedAt,
    digest: createHash('sha256')
      .update(`${data.paymentId}:${data.collectionReference}:${data.amountPoisha}`)
      .digest('hex'),
  })
  const receipt = codCollectionService(
    db.connection,
    adminAccess,
    codCollectionOrderAccess(db.connection),
    async (data) => proof(data),
    () => now,
  )
  const cash = (amount = payment.expectedPoisha, ref = 'cash-receipt-1', key = ref) =>
    receipt.collect(
      token,
      payment._id.toHexString(),
      {
        amountPoisha: amount,
        collectionReference: ref,
        evidenceRef: 'synthetic:private-cash-evidence',
        reason: 'Synthetic verified cash',
      },
      key,
    )
  return {
    who,
    selected,
    id,
    payment,
    admin,
    adminAccess,
    token,
    lifecycle,
    move,
    receipt,
    cash,
    proof,
  }
}
it('lifecycle/COD local: missing qualified approval blocks confirmation without stock/payment/order changes', async () => {
  const f = await lifecycleFixture(false),
    before = await orderModels(db.connection).orders.findById(f.id).lean()
  await expect(f.move('confirmed')).rejects.toThrow()
  expect(await orderModels(db.connection).orders.findById(f.id).lean()).toEqual(before)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.revision).toBe(0)
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
})
it('lifecycle/COD local: ordinary graph, exact shipping generation and delivery retain independent Pending cash', async () => {
  const f = await lifecycleFixture()
  await expect(f.move('shipped')).rejects.toThrow()
  await f.move('confirmed')
  await f.move('processing')
  await f.move('shipped')
  await f.move('delivered')
  const row = await orderModels(db.connection).orders.findById(f.id)
  expect(row?.fulfillmentStatus).toBe('delivered')
  expect(row?.statusHistory).toHaveLength(4)
  expect(row?.deliveryCommitment.status).toBe('calculated')
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 8, committed: 0, reserved: 0 })
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'dispatch' })).toBe(1)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.paymentStatus).toBe('pending')
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
  await expect(f.move('processing', 'terminal-skip')).rejects.toThrow()
})
it('lifecycle/COD local: repeated/concurrent shipping is exactly once, historical key cannot dispatch again', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  await Promise.all([f.move('shipped', 'dispatch-key'), f.move('shipped', 'dispatch-key')])
  await f.move('delivered')
  expect((await f.move('shipped', 'dispatch-key')).fulfillmentStatus).toBe('delivered')
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'dispatch' })).toBe(1)
  await expect(
    f.lifecycle.transition(
      f.token,
      f.id,
      { to: 'shipped', reason: 'Changed', dispatchReference: 'other' },
      'dispatch-key',
    ),
  ).rejects.toThrow()
})
it('lifecycle/COD local: missing dispatch reference, stale generation and ordinary cancellation are denied', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  await expect(
    f.lifecycle.transition(f.token, f.id, { to: 'shipped', reason: 'No proof' }, 'no-reference'),
  ).rejects.toThrow()
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'dispatch' })).toBe(0)
  await expect(f.move('cancelled')).rejects.toThrow()
  await inventoryReservationModel(db.connection).updateOne(
    { orderId: f.id, status: 'committed' },
    {
      $set: { status: 'released', releasedAt: now, releaseReason: 'Synthetic stale generation' },
      $unset: { activeKey: '' },
    },
  )
  await expect(f.move('shipped')).rejects.toThrow()
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'processing',
  )
})
it('lifecycle/COD local: missing audit readiness prevents physical stock/order changes and permits retry', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  const stockBefore = (await productModels(db.connection).variants.findById(f.selected.row._id))
    ?.stock
  await db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.move('shipped')).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect((await productModels(db.connection).variants.findById(f.selected.row._id))?.stock).toEqual(
    stockBefore,
  )
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'processing',
  )
  await f.move('shipped')
})
it('lifecycle/COD local: current admin authorization, risk and monotonic timestamps gate mutations', async () => {
  const f = await lifecycleFixture()
  await expect(
    f.lifecycle.transition(
      undefined,
      f.id,
      { to: 'confirmed', reason: 'No session' },
      'no-session',
    ),
  ).rejects.toThrow()
  await paymentModel(db.connection).updateOne(
    { _id: f.payment._id },
    { $set: { riskStatus: 'review' } },
  )
  await expect(f.move('confirmed')).rejects.toThrow()
  await paymentModel(db.connection).updateOne(
    { _id: f.payment._id },
    { $set: { riskStatus: 'clear' } },
  )
  await f.move('confirmed')
  now = new Date(now.getTime() - 1)
  await expect(f.move('processing')).rejects.toThrow()
  now = new Date(now.getTime() + 1)
  await identities.users.updateOne({ _id: f.admin.user._id }, { $set: { status: 'suspended' } })
  await expect(f.move('processing')).rejects.toThrow()
})
it('lifecycle/COD local: partial cash, final cash and distinct excess preserve source accounting without stock effects', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  const half = Math.floor(f.payment.expectedPoisha / 2)
  await f.cash(half, 'cash-first')
  expect((await paymentModel(db.connection).findById(f.payment._id))?.paymentStatus).toBe('pending')
  await f.cash(f.payment.expectedPoisha - half, 'cash-second')
  expect((await paymentModel(db.connection).findById(f.payment._id))?.paymentStatus).toBe('paid')
  await f.cash(100, 'cash-excess')
  expect(
    await db.connection
      .collection('refunds')
      .countDocuments({ capacityStatus: 'not_reserved', amountPoisha: 100 }),
  ).toBe(1)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(3)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.merchandiseFundedPoisha).toBe(
    f.payment.expectedPoisha,
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
})
it('lifecycle/COD local: duplicate cash reference and concurrent same-key retries collect once', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  const [one, two] = await Promise.all([f.cash(), f.cash()])
  expect(one.id).toBe(two.id)
  expect((await f.cash(f.payment.expectedPoisha, 'cash-receipt-1', 'different-key')).id).toBe(
    one.id,
  )
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.verifiedCollectedPoisha).toBe(
    f.payment.expectedPoisha,
  )
  await expect(f.cash(1, 'cash-receipt-1', 'changed-body')).rejects.toThrow()
})
it('lifecycle/COD local: unconfirmed COD and missing/mismatched evidence cannot create Paid', async () => {
  const f = await lifecycleFixture()
  await expect(f.cash()).rejects.toThrow()
  await f.move('confirmed')
  const unavailable = codCollectionService(
    db.connection,
    f.adminAccess,
    codCollectionOrderAccess(db.connection),
    undefined,
    () => now,
  )
  const body = {
    amountPoisha: f.payment.expectedPoisha,
    collectionReference: 'no-evidence',
    evidenceRef: 'synthetic:unverified',
    reason: 'Review',
  }
  await expect(
    unavailable.collect(f.token, f.payment._id.toHexString(), body, 'no-evidence'),
  ).rejects.toThrow()
  const wrong = codCollectionService(
    db.connection,
    f.adminAccess,
    codCollectionOrderAccess(db.connection),
    async (data) => ({ ...f.proof(data), amountPoisha: data.amountPoisha + 1 }),
    () => now,
  )
  await expect(
    wrong.collect(f.token, f.payment._id.toHexString(), body, 'wrong-evidence'),
  ).rejects.toThrow()
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
})
it('lifecycle/COD local: identity revoked during evidence read cannot commit a collection', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  const receipt = codCollectionService(
    db.connection,
    f.adminAccess,
    codCollectionOrderAccess(db.connection),
    async (data) => {
      await identities.users.updateOne({ _id: f.admin.user._id }, { $set: { status: 'suspended' } })
      return f.proof(data)
    },
    () => now,
  )
  await expect(
    receipt.collect(
      f.token,
      f.payment._id.toHexString(),
      {
        amountPoisha: f.payment.expectedPoisha,
        collectionReference: 'revoked',
        evidenceRef: 'synthetic:private',
        reason: 'Review',
      },
      'revoked',
    ),
  ).rejects.toThrow()
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
})
it('lifecycle/COD local: cash audit failure rolls back receipt and balances; same key recovers', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.cash()).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.verifiedCollectedPoisha).toBe(
    0,
  )
  await f.cash()
})

it('lifecycle/COD local: late correction failure rolls back the newly verified receipt and all payment amounts', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await db.connection.collection('refunds').dropIndex('refund_decision_unique')
  try {
    await expect(f.cash(f.payment.expectedPoisha + 100, 'late-failure')).rejects.toThrow()
  } finally {
    await initializeCorrectionPersistence(db.connection)
  }
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.verifiedCollectedPoisha).toBe(
    0,
  )
  await f.cash(f.payment.expectedPoisha + 100, 'late-failure')
  expect(
    (await paymentModel(db.connection).findById(f.payment._id))?.correctionCollectedPoisha,
  ).toBe(100)
})
it('lifecycle/COD local: unfunded online confirmation is denied, while verified fully funded stock ships once', async () => {
  const f = await processingFixture(true),
    admin = await customer('admin'),
    access = createAdminAccountAccess(db.connection, identities, sessions)
  const lifecycle = orderLifecycleService(
    db.connection,
    access,
    fulfillmentPaymentAccess(db.connection),
    fulfillmentAllocationService(db.connection, () => now),
    async () => {},
    () => now,
  )
  const move = (to: string) =>
    lifecycle.transition(
      admin.credentials.customerToken,
      f.result.id,
      {
        to,
        reason: 'Synthetic verified online fulfillment',
        ...(to === 'shipped' ? { dispatchReference: 'online-dispatch' } : {}),
      },
      `online-${to}`,
    )
  await expect(move('confirmed')).rejects.toThrow()
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect((await orderModels(db.connection).orders.findById(f.result.id))?.fulfillmentHold).toBe(
    'admin_review',
  )
  await move('confirmed')
  await move('processing')
  await move('shipped')
  expect((await orderModels(db.connection).orders.findById(f.result.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect((await paymentModel(db.connection).findById(f.attempt.paymentId))?.paymentStatus).toBe(
    'paid',
  )
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'dispatch' })).toBe(1)
})
it('lifecycle/COD local: different admins can concurrently dispatch and record cash without losing either fact', async () => {
  const f = await lifecycleFixture(),
    other = await customer('admin')
  await f.move('confirmed')
  await f.move('processing')
  await Promise.all([
    f.lifecycle.transition(
      other.credentials.customerToken,
      f.id,
      { to: 'shipped', reason: 'Independent dispatch', dispatchReference: 'concurrent-dispatch' },
      'concurrent-dispatch',
    ),
    f.cash(),
  ])
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect((await paymentModel(db.connection).findById(f.payment._id))?.paymentStatus).toBe('paid')
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'dispatch' })).toBe(1)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
})
it('lifecycle/COD local: a globally repeated cash reference cannot credit another order', async () => {
  const first = await lifecycleFixture()
  await first.move('confirmed')
  await first.cash()
  const second = await lifecycleFixture()
  await second.move('confirmed')
  await expect(second.cash()).rejects.toThrow()
  expect(
    (await paymentModel(db.connection).findById(second.payment._id))?.verifiedCollectedPoisha,
  ).toBe(0)
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(1)
})
it('lifecycle/COD local: cash evidence timestamps cannot predate the order or lie in the future', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  for (const delta of [-1, 1]) {
    const receipt = codCollectionService(
      db.connection,
      f.adminAccess,
      codCollectionOrderAccess(db.connection),
      async (data) => ({ ...f.proof(data), collectedAt: new Date(now.getTime() + delta) }),
      () => now,
    )
    await expect(
      receipt.collect(
        f.token,
        f.payment._id.toHexString(),
        {
          amountPoisha: f.payment.expectedPoisha,
          collectionReference: `bad-clock-${delta}`,
          evidenceRef: 'synthetic:private',
          reason: 'Review',
        },
        `bad-clock-${delta}`,
      ),
    ).rejects.toThrow()
  }
  expect(await paymentRecordModels(db.connection).collections.countDocuments()).toBe(0)
})
it('lifecycle/COD local: risk review retains verified cash while continuing to block fulfillment', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await paymentModel(db.connection).updateOne(
    { _id: f.payment._id },
    { $set: { riskStatus: 'review' } },
  )
  await f.cash()
  await expect(f.move('processing')).rejects.toThrow()
  expect((await paymentModel(db.connection).findById(f.payment._id))?.paymentStatus).toBe('paid')
  expect((await paymentModel(db.connection).findById(f.payment._id))?.riskStatus).toBe('review')
})

async function cancellationReadFixture(online = false) {
  await initializeCancellationPersistence(db.connection)
  await initializePaymentRecordPersistence(db.connection)
  const who = await customer(),
    selected = await variant(),
    input = { ...body([selected.item]), ...(online ? { method: 'bkash' } : {}) }
  const quotes = online
    ? makeService({
        methods: paymentEligibility(async () => [
          { channel: 'bkash', active: true, minPoisha: 1000, maxPoisha: 50000 },
        ]),
      })
    : service
  const quote = await quotes.create(who.credentials, input)
  const placed = await submissionService(quotes).submit(
      who.credentials,
      submit(input, quote),
      'cancel-read-order',
    ),
    id = placed.id
  const customers = createCustomerAccountAccess(db.connection, identities, sessions),
    scope = orderScopeAccess(customers, sessions),
    admin = await customer('admin'),
    adminAccess = createAdminAccountAccess(db.connection, identities, sessions)
  const cancellation = cancellationService(
    db.connection,
    scope,
    adminAccess,
    cancellationAllocationService(db.connection, () => now),
    cancellationPaymentAccess(db.connection),
    undefined,
    () => now,
  )
  const creds = { ...who.credentials, csrfToken: who.csrf }
  const reading = orderReadService(
    db.connection,
    customers,
    scope,
    customerPaymentSummaryAccess(db.connection),
    orderPolicySnapshotAccess(db.connection),
    () => now,
  )
  const readApp = createApp({ apiRouter: orderReadRoutes(reading, security) })
  const ask = (reason = 'Please cancel', key = 'cancellation-request') =>
    cancellation.request(creds, id, { reason }, key)
  const decide = (
    requestId: string,
    decision: 'approve' | 'reject' = 'approve',
    extra: object = {},
    key = 'cancel-decision',
  ) =>
    cancellation.decide(
      admin.credentials.customerToken,
      requestId,
      { decision, reason: 'Synthetic administrator review', ...extra },
      key,
    )
  return { who, selected, id, admin, cancellation, creds, reading, readApp, ask, decide }
}
it('cancellation/read local: submission only requests review and concurrent duplicates protect one pending identity', async () => {
  const f = await cancellationReadFixture(),
    rows = await Promise.all([f.ask(), f.ask(), f.ask()])
  expect(new Set(rows.map((r) => r.id)).size).toBe(1)
  expect(await cancellationModel(db.connection).countDocuments()).toBe(1)
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.committed,
  ).toBe(2)
  await expect(f.ask('Different pending explanation')).rejects.toThrow()
})
it('cancellation/read local: authorized unpaid COD approval releases once without a monetary refund', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask()
  await f.decide(asked.id)
  await f.decide(asked.id)
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(1)
  expect(await db.connection.collection('refunds').countDocuments()).toBe(0)
  await expect(f.decide(asked.id, 'reject')).rejects.toThrow()
})
it('cancellation/read local: rejecting a request preserves fulfillment and allocation; only admins decide', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask()
  await expect(
    f.cancellation.decide(
      f.who.credentials.customerToken,
      asked.id,
      { decision: 'approve', reason: 'Forbidden' },
      'customer-decision',
    ),
  ).rejects.toThrow()
  await f.decide(asked.id, 'reject')
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.committed,
  ).toBe(2)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(0)
})
it('cancellation/read local: request ownership and mutation CSRF cannot be supplied by an order ID', async () => {
  const f = await cancellationReadFixture(),
    other = await customer()
  await expect(
    f.cancellation.request(
      { ...other.credentials, csrfToken: other.csrf },
      f.id,
      {
        reason: 'Wrong account',
      },
      'wrong-owner-request',
    ),
  ).rejects.toThrow()
  await expect(
    f.cancellation.request(
      { ...f.creds, csrfToken: undefined },
      f.id,
      { reason: 'No CSRF' },
      'no-csrf-request',
    ),
  ).rejects.toThrow()
  expect(await cancellationModel(db.connection).countDocuments()).toBe(0)
})
it('cancellation/read local: Processing needs explicit no-dispatch verification and Shipped cannot cancel', async () => {
  const f = await cancellationReadFixture(),
    lifecycle = orderLifecycleService(
      db.connection,
      createAdminAccountAccess(db.connection, identities, sessions),
      fulfillmentPaymentAccess(db.connection),
      fulfillmentAllocationService(db.connection, () => now),
      async () => {},
      () => now,
    )
  for (const to of ['confirmed', 'processing'])
    await lifecycle.transition(
      f.admin.credentials.customerToken,
      f.id,
      { to, reason: 'Synthetic prior state' },
      `prepare-${to}`,
    )
  const asked = await f.ask()
  await expect(f.decide(asked.id)).rejects.toThrow()
  await lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'shipped', dispatchReference: 'already-dispatched', reason: 'Actual local dispatch' },
    'actual-dispatch',
  )
  await expect(
    f.decide(asked.id, 'approve', { dispatchNotStartedConfirmed: true }),
  ).rejects.toThrow()
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
})
it('cancellation/read local: collected cash blocks approval until a real refund obligation capability exists', async () => {
  const f = await cancellationReadFixture(),
    lifecycle = orderLifecycleService(
      db.connection,
      createAdminAccountAccess(db.connection, identities, sessions),
      fulfillmentPaymentAccess(db.connection),
      fulfillmentAllocationService(db.connection, () => now),
      async () => {},
      () => now,
    )
  await lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'confirmed', reason: 'Synthetic confirmation' },
    'confirmed-cancel',
  )
  const payment = await paymentModel(db.connection).findOne({ orderId: f.id }).orFail()
  const receipt = codCollectionService(
    db.connection,
    createAdminAccountAccess(db.connection, identities, sessions),
    codCollectionOrderAccess(db.connection),
    async (data) => ({
      paymentId: data.paymentId,
      amountPoisha: data.amountPoisha,
      collectionReference: data.collectionReference,
      evidenceRef: data.evidenceRef,
      collectedAt: now,
      digest: 'a'.repeat(64),
    }),
    () => now,
  )
  await receipt.collect(
    f.admin.credentials.customerToken,
    payment._id.toHexString(),
    {
      amountPoisha: payment.expectedPoisha,
      collectionReference: 'protected-paid-cancel',
      evidenceRef: 'synthetic:cash-proof',
      reason: 'Fixture',
    },
    'paid-cancel-proof',
  )
  const asked = await f.ask()
  await expect(f.decide(asked.id)).rejects.toThrow()
  expect((await cancellationModel(db.connection).findById(asked.id))?.status).toBe('requested')
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'confirmed',
  )
  expect((await paymentModel(db.connection).findById(payment._id))?.paymentStatus).toBe('paid')
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.committed,
  ).toBe(2)
})
it('cancellation/read local: audit readiness failure leaves request/order/stock recoverable with the same decision key', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask()
  await db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.decide(asked.id)).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  await f.decide(asked.id)
})
it('cancellation/read local: customer history is scoped, paginated, no-store and independent from private payment evidence', async () => {
  const f = await cancellationReadFixture(),
    other = await customer()
  const list = await request(f.readApp)
    .get('/api/v1/orders?pageSize=1')
    .set('Cookie', f.who.cookie)
    .expect(200)
  expect(list.body.data).toHaveLength(1)
  expect(list.body.meta).toMatchObject({ page: 1, pageSize: 1, totalItems: 1 })
  expect(list.headers['cache-control']).toBe('no-store')
  expect(
    (await request(f.readApp).get('/api/v1/orders').set('Cookie', other.cookie).expect(200)).body
      .data,
  ).toEqual([])
  await request(f.readApp)
    .get('/api/v1/orders?pageSize=101')
    .set('Cookie', f.who.cookie)
    .expect(400)
  await request(f.readApp)
    .get('/api/v1/orders?userId=anything')
    .set('Cookie', f.who.cookie)
    .expect(400)
  await request(f.readApp).get(`/api/v1/orders/${f.id}`).set('Cookie', other.cookie).expect(404)
})
it('cancellation/read local: detail uses historical snapshots and consumed policy references after catalog/config changes', async () => {
  const f = await cancellationReadFixture(),
    path = `/api/v1/orders/${f.id}`
  const before = await request(f.readApp).get(path).set('Cookie', f.who.cookie).expect(200)
  await productModels(db.connection).variants.updateOne(
    { _id: f.selected.row._id },
    { $set: { regularPricePoisha: 99999, status: 'inactive' } },
  )
  await productModels(db.connection).products.updateOne(
    { _id: f.selected.product._id },
    { $set: { name: 'Changed current product' } },
  )
  await settingsModel(db.connection).updateOne({}, { $set: { activePolicyVersions: {} } })
  const after = await request(f.readApp).get(path).set('Cookie', f.who.cookie).expect(200)
  expect(after.body.data).toEqual(before.body.data)
  const raw = JSON.stringify(after.body.data)
  for (const key of [
    'approvedBy',
    'ruleDigest',
    'evidenceRef',
    'commercialDigest',
    'operationKey',
    'passwordHash',
    'providerSessionId',
    'customerSnapshot',
  ])
    expect(raw).not.toContain(key)
  expect(after.body.data.paymentSummary.status).toBe('pending')
  expect(after.body.data.claimEligibility).toEqual({ status: 'under_review' })
})
it('cancellation/read local: current account suspension denies reads and missing policy history fails closed', async () => {
  const f = await cancellationReadFixture()
  await checkoutQuoteModel(db.connection).deleteMany({ orderId: f.id })
  await request(f.readApp).get(`/api/v1/orders/${f.id}`).set('Cookie', f.who.cookie).expect(503)
  await request(f.readApp)
    .get(`/api/v1/orders/${f.id}/status`)
    .set('Cookie', f.who.cookie)
    .expect(200)
  await identities.users.updateOne({ _id: f.who.user._id }, { $set: { status: 'suspended' } })
  await request(f.readApp).get('/api/v1/orders').set('Cookie', f.who.cookie).expect(401)
})
it('cancellation/read local: actual root read activation defaults off and only enables explicitly', async () => {
  const f = await cancellationReadFixture(),
    disabled = await initiationApp(),
    enabled = await initiationApp(true, undefined, false, undefined, true)
  await request(disabled.root).get(`/api/v1/orders/${f.id}`).set('Cookie', f.who.cookie).expect(404)
  await request(enabled.root).get(`/api/v1/orders/${f.id}`).set('Cookie', f.who.cookie).expect(200)
})
it('cancellation/read local: a historical submission key returns the reviewed request and a changed reason conflicts', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask()
  await f.decide(asked.id, 'reject')
  expect((await f.ask()).status).toBe('rejected')
  expect((await f.ask()).id).toBe(asked.id)
  await expect(f.ask('Changed key body')).rejects.toThrow()
  await expect(
    f.cancellation.request(f.creds, f.id, { reason: 'Missing key' }, undefined),
  ).rejects.toThrow()
  const second = await f.ask('New reviewed request', 'new-submission-key')
  expect(second.id).not.toBe(asked.id)
  expect(await cancellationModel(db.connection).countDocuments()).toBe(2)
})
it('cancellation/read local: exact guest proof reads only its order, cannot enumerate, and invalid customer cookies never fall back', async () => {
  const held = await heldOrder(),
    customers = createCustomerAccountAccess(db.connection, identities, sessions)
  const guests = guestSessionService(
    db.connection,
    identities,
    {
      secret: authSecret,
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'https://api.example.test',
    },
    600,
    guestOrderAccess(db.connection).verify,
    () => now,
  )
  const proof = await inTransaction(db.connection, (session) =>
    guests.issueAfterProof(session, held.result.id),
  )
  const scope = orderScopeAccess(customers, sessions, guests),
    reading = orderReadService(
      db.connection,
      customers,
      scope,
      customerPaymentSummaryAccess(db.connection),
      orderPolicySnapshotAccess(db.connection),
      () => now,
    ),
    root = createApp({ apiRouter: orderReadRoutes(reading, security) }),
    cookie = `sz_guest_order_sid=${proof.token}`
  await request(root).get(`/api/v1/orders/${held.result.id}`).set('Cookie', cookie).expect(200)
  await request(root).get('/api/v1/orders').set('Cookie', cookie).expect(401)
  const other = await heldOrder()
  await request(root).get(`/api/v1/orders/${other.result.id}`).set('Cookie', cookie).expect(401)
  await request(root)
    .get(`/api/v1/orders/${held.result.id}`)
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .expect(401)
  await initializeCancellationPersistence(db.connection)
  const cancel = cancellationService(
    db.connection,
    scope,
    createAdminAccountAccess(db.connection, identities, sessions),
    cancellationAllocationService(db.connection, () => now),
    cancellationPaymentAccess(db.connection),
    undefined,
    () => now,
  )
  const asked = await cancel.request(
    { customerPresent: false, guestToken: proof.token, csrfToken: proof.csrfToken },
    held.result.id,
    { reason: 'Verified guest request' },
    'guest-key',
  )
  expect((await cancellationModel(db.connection).findById(asked.id))?.requestedBy.kind).toBe(
    'guest_order',
  )
  now = new Date(now.getTime() + 600001)
  await request(root).get(`/api/v1/orders/${held.result.id}`).set('Cookie', cookie).expect(401)
})
it('cancellation/read local: pending online attempts keep reconciliation and late collections become correction only', async () => {
  await initializeCancellationPersistence(db.connection)
  await initializeCorrectionPersistence(db.connection)
  const f = await processingFixture(true),
    customers = createCustomerAccountAccess(db.connection, identities, sessions),
    admin = await customer('admin')
  const cancel = cancellationService(
    db.connection,
    orderScopeAccess(customers, sessions),
    createAdminAccountAccess(db.connection, identities, sessions),
    cancellationAllocationService(db.connection, () => now),
    cancellationPaymentAccess(db.connection),
    undefined,
    () => now,
  )
  const asked = await cancel.request(
    { ...f.who.credentials, csrfToken: f.who.csrf },
    f.result.id,
    { reason: 'Cancel pending online order' },
    'online-cancel-key',
  )
  await cancel.decide(
    admin.credentials.customerToken,
    asked.id,
    { decision: 'approve', reason: 'Synthetic reviewed cancellation' },
    'online-decision',
  )
  expect((await paymentRecordModels(db.connection).attempts.findById(f.attempt._id))?.state).toBe(
    'initiated',
  )
  expect(
    (await couponModels(db.connection).redemptions.findOne({ orderId: f.result.id }))?.status,
  ).toBe('released')
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect((await orderModels(db.connection).orders.findById(f.result.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(
    (await paymentModel(db.connection).findById(f.attempt.paymentId))?.merchandiseFundedPoisha,
  ).toBe(0)
  expect(
    (await paymentModel(db.connection).findById(f.attempt.paymentId))?.correctionCollectedPoisha,
  ).toBe(f.attempt.expectedAmountPoisha)
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 0, reserved: 0 })
  const reading = orderReadService(
    db.connection,
    customers,
    orderScopeAccess(customers, sessions),
    customerPaymentSummaryAccess(db.connection),
    orderPolicySnapshotAccess(db.connection),
    () => now,
  )
  expect(await reading.read(f.who.credentials, f.result.id, true)).toMatchObject({
    fulfillmentStatus: 'cancelled',
    paymentSummary: { status: 'paid', fundingContext: 'correction_only' },
  })
})
it('cancellation/read local: failure after actual release rolls back stock, request and order before safe retry', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask(),
    release = cancellationAllocationService(db.connection, () => now)
  const cancel = cancellationService(
    db.connection,
    orderScopeAccess(createCustomerAccountAccess(db.connection, identities, sessions), sessions),
    createAdminAccountAccess(db.connection, identities, sessions),
    async (session, binding) => {
      await release(session, binding)
      throw new Error('Synthetic downstream failure')
    },
    cancellationPaymentAccess(db.connection),
    undefined,
    () => now,
  )
  await expect(
    cancel.decide(
      f.admin.credentials.customerToken,
      asked.id,
      { decision: 'approve', reason: 'Rollback test' },
      'rollback-decision',
    ),
  ).rejects.toThrow()
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect((await cancellationModel(db.connection).findById(asked.id))?.status).toBe('requested')
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.committed,
  ).toBe(2)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(0)
  await f.decide(asked.id)
})
it('cancellation/read local: different-admin dispatch and cancellation race cannot release shipped quantities', async () => {
  const f = await cancellationReadFixture(),
    other = await customer('admin'),
    lifecycle = orderLifecycleService(
      db.connection,
      createAdminAccountAccess(db.connection, identities, sessions),
      fulfillmentPaymentAccess(db.connection),
      fulfillmentAllocationService(db.connection, () => now),
      async () => {},
      () => now,
    )
  for (const to of ['confirmed', 'processing'])
    await lifecycle.transition(
      f.admin.credentials.customerToken,
      f.id,
      { to, reason: 'Synthetic preparation' },
      `race-${to}`,
    )
  const asked = await f.ask()
  const outcomes = await Promise.allSettled([
    f.decide(asked.id, 'approve', { dispatchNotStartedConfirmed: true }),
    lifecycle.transition(
      other.credentials.customerToken,
      f.id,
      { to: 'shipped', dispatchReference: 'race-dispatch', reason: 'Synthetic physical dispatch' },
      'race-dispatch',
    ),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const order = await orderModels(db.connection).orders.findById(f.id),
    stock = (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock
  expect(['shipped', 'cancelled']).toContain(order?.fulfillmentStatus)
  expect(stock).toMatchObject({
    physical: order?.fulfillmentStatus === 'shipped' ? 8 : 10,
    committed: 0,
    reserved: 0,
  })
  expect((await cancellationModel(db.connection).findById(asked.id))?.status).toBe(
    order?.fulfillmentStatus === 'cancelled' ? 'approved' : 'requested',
  )
})
it('cancellation/read local: cancellation bootstrap is additive and unknown validator drift is refused', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask(),
    env = {
      ...identityEnvironment(),
      MONGODB_URI: db.replica.getUri(),
      MONGODB_DB_NAME: db.connection.name,
    }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-cancellations.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await cancellationModel(db.connection).findById(asked.id))?.status).toBe('requested')
  await db.connection.db?.command({ collMod: 'cancellationRequests', validator: {} })
  try {
    await expect(verifyCancellationPersistence(db.connection)).rejects.toThrow()
  } finally {
    await db.connection.db?.command({
      collMod: 'cancellationRequests',
      validator: cancellationValidator,
    })
  }
  const deployed = spawnSync(process.execPath, ['scripts/bootstrap-cancellations.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(deployed.status).not.toBe(0)
})

function commerceDelivery(adapter: EmailAdapter) {
  return createNotificationDeliveryService(
    createRegistrationNotifications(db.connection, () => now),
    adapter,
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 10 },
    () => now,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    orderMessageService(orderNotificationAccess(db.connection)),
  )
}
async function exceptionFixture(protectedDisposition = true) {
  await initializeDeliveryExceptionPersistence(db.connection)
  await initializeComplaintPersistence(db.connection)
  const f = await cancellationReadFixture(),
    adminAccess = createAdminAccountAccess(db.connection, identities, sessions)
  const lifecycle = orderLifecycleService(
    db.connection,
    adminAccess,
    fulfillmentPaymentAccess(db.connection),
    fulfillmentAllocationService(db.connection, () => now),
    async () => {},
    () => now,
  )
  for (const to of ['confirmed', 'processing', 'shipped'])
    await lifecycle.transition(
      f.admin.credentials.customerToken,
      f.id,
      {
        to,
        reason: 'Synthetic protected delivery',
        ...(to === 'shipped' ? { dispatchReference: 'exception-dispatch' } : {}),
      },
      `exception-${to}`,
    )
  const exceptions = deliveryExceptionService(
    db.connection,
    adminAccess,
    cancellationPaymentAccess(db.connection),
    recoveryReceiptService(db.connection, () => now),
    protectedDisposition ? async () => 'a'.repeat(64) : undefined,
    undefined,
    () => now,
  )
  const order = await orderModels(db.connection).orders.findById(f.id).orFail(),
    item = order.items[0]
  if (!item) throw new Error('Missing line')
  const disposition = [
    {
      orderItemId: item.id.toHexString(),
      quantity: 1,
      custody: 'recovered',
      inspectedResellableQty: 1,
    },
    { orderItemId: item.id.toHexString(), quantity: 1, custody: 'lost', inspectedResellableQty: 0 },
  ]
  const token = f.admin.credentials.customerToken
  const create = (type = 'failed_attempt', key = type) =>
    exceptions.create(
      token,
      f.id,
      {
        type,
        reason: 'Synthetic recorded delivery concern',
        contact: { channel: 'phone', outcome: 'Synthetic follow-up' },
      },
      key,
    )
  const resolve = (
    id: string,
    body: object = { resolution: 'Documented retry planned' },
    key = 'exception-resolution',
  ) => exceptions.resolve(token, id, body, key)
  const complaints = complaintService(
    db.connection,
    orderScopeAccess(createCustomerAccountAccess(db.connection, identities, sessions), sessions),
    complaintOrderAccess(db.connection),
    adminAccess,
    () => now,
  )
  return {
    ...f,
    lifecycle,
    exceptions,
    create,
    resolve,
    disposition,
    item,
    complaints,
    token,
    adminAccess,
  }
}
it('commerce/exception batch: actual lifecycle commits one order email event per cause and delivery remains financially independent', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('confirmed')
  await f.move('processing')
  await f.move('shipped')
  await f.move('shipped')
  await f.move('delivered')
  for (const eventType of [
    'order_received',
    'order_confirmation',
    'shipment_update',
    'delivery_completion',
  ])
    expect(await db.connection.collection('notifications').countDocuments({ eventType })).toBe(1)
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(4)
  expect(
    send.mock.calls.some(([message]) =>
      message.text.includes('Delivery does not confirm payment collection.'),
    ),
  ).toBe(true)
  expect((await paymentModel(db.connection).findById(f.payment._id))?.paymentStatus).toBe('pending')
})
it('commerce/exception batch: cancellation email is atomic and historical messages retain immutable event references', async () => {
  const f = await cancellationReadFixture(),
    lifecycle = orderLifecycleService(
      db.connection,
      createAdminAccountAccess(db.connection, identities, sessions),
      fulfillmentPaymentAccess(db.connection),
      fulfillmentAllocationService(db.connection, () => now),
      async () => {},
      () => now,
    )
  await lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'confirmed', reason: 'Synthetic confirmation' },
    'mail-confirm',
  )
  const asked = await f.ask()
  await f.decide(asked.id)
  await f.decide(asked.id)
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(3)
  for (const [message] of send.mock.calls) {
    expect(message.text).toContain('Check your secure order status for current fulfillment')
    expect(message.text).not.toContain('Synthetic administrator review')
  }
  expect(
    await db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'order_cancellation' }),
  ).toBe(1)
})
it('commerce/exception batch: known mail rejection keeps the exact provider payload even after later cancellation', async () => {
  const f = await cancellationReadFixture(),
    send = vi
      .fn<EmailAdapter['send']>()
      .mockResolvedValueOnce({ kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' })
      .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  const original = send.mock.calls[0]?.[0]
  if (!original) throw new Error('Missing first delivery attempt')
  const asked = await f.ask()
  await f.decide(asked.id)
  now = new Date(now.getTime() + 1001)
  await commerceDelivery({ send }).runBatch()
  const retries = send.mock.calls
    .map(([message]) => message)
    .filter((message) => message.idempotencyKey === original.idempotencyKey)
  expect(retries).toHaveLength(2)
  expect(retries[1]).toEqual(original)
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'commit_cod' })).toBe(1)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(1)
})

it('commerce/exception batch: uncertain delivery stops automatic resend without changing committed commerce', async () => {
  const f = await cancellationReadFixture(),
    send = vi
      .fn<EmailAdapter['send']>()
      .mockResolvedValue({ kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' })
  await commerceDelivery({ send }).runBatch()
  now = new Date(now.getTime() + 100000)
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(
    (await db.connection.collection('notifications').findOne({ orderId: new Types.ObjectId(f.id) }))
      ?.status,
  ).toBe('delivery_uncertain')
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
})
it('commerce/exception batch: default root worker skips order templates and explicit local activation renders commerce not welcome', async () => {
  await cancellationReadFixture()
  const config = loadEnvironment({ ...identityEnvironment(), SESSION_SECRET: authSecret }),
    send = vi
      .fn<EmailAdapter['send']>()
      .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' }),
    settings = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      claimTtlMs: 30000,
      batchSize: 10,
    }
  const disabled = await composeNotificationWorker(db.connection, config, {
    adapter: { send },
    settings,
  })
  await disabled.runBatch()
  expect(send).not.toHaveBeenCalled()
  const enabled = await composeNotificationWorker(db.connection, config, {
    adapter: { send },
    settings,
    commerceEnabled: true,
  })
  await enabled.runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[0].subject).toContain('order update')
  expect(send.mock.calls[0]?.[0].text).toContain('does not confirm fulfillment')
})
it('commerce/exception batch: destination tamper suppresses every order message', async () => {
  const f = await exceptionFixture()
  await db.connection
    .collection('notifications')
    .updateMany(
      { orderId: new Types.ObjectId(f.id) },
      { $set: { 'recipient.emailNormalized': 'wrong@example.test' } },
    )
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  expect(send).not.toHaveBeenCalled()
})
it('commerce/exception batch: tampered event proof cannot email a fabricated transition', async () => {
  await exceptionFixture()
  await db.connection
    .collection('notifications')
    .updateOne(
      { eventType: 'shipment_update' },
      { $set: { 'payload.operationKey': '0'.repeat(64) } },
    )
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls.some(([message]) => message.text.includes('was shipped'))).toBe(false)
})
it('commerce/exception batch: missing outbox protection after dispatch writes rolls back stock and fulfillment', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  await db.connection.collection('notifications').dropIndex('notifications_event_key_unique')
  try {
    await expect(f.move('shipped')).rejects.toThrow()
  } finally {
    await createRegistrationNotifications(db.connection).initialize()
  }
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'processing',
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
  expect(await inventoryMovementModel(db.connection).countDocuments({ type: 'dispatch' })).toBe(0)
  await f.move('shipped')
})
it('commerce/exception batch: exact payment notification predecessor upgrades without rewriting prior evidence', async () => {
  await cancellationReadFixture()
  const before = await db.connection.collection('notifications').findOne({})
  if (!before) throw new Error('Missing notification fixture')
  await db.connection.db?.command({
    collMod: 'notifications',
    validator: paymentNotificationValidator,
  })
  const store = createRegistrationNotifications(db.connection)
  await expect(store.verifyIndexes()).rejects.toThrow()
  await store.migrateFoundation()
  await store.migrateFoundation()
  expect(await db.connection.collection('notifications').findOne({ _id: before._id })).toEqual(
    before,
  )
})
it('commerce/exception batch: failed attempts and delay resolution retain Shipped, contacts, deadlines and stock', async () => {
  const f = await exceptionFixture(),
    before = (await orderModels(db.connection).orders.findById(f.id).lean())?.deliveryCommitment
  const event = await f.create()
  await f.create()
  await f.resolve(event.id, { resolution: 'Retry scheduled', contactOutcome: 'Customer contacted' })
  await f.resolve(event.id, { resolution: 'Retry scheduled', contactOutcome: 'Customer contacted' })
  expect(await deliveryExceptionModel(db.connection).countDocuments()).toBe(1)
  expect(
    (await deliveryExceptionModel(db.connection).findById(event.id))?.contactHistory,
  ).toHaveLength(2)
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect(
    (await orderModels(db.connection).orders.findById(f.id).lean())?.deliveryCommitment,
  ).toEqual(before)
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.physical,
  ).toBe(8)
})
it('commerce/exception batch: final closure without protected custody/inspection proof is refused', async () => {
  const f = await exceptionFixture(false),
    event = await f.create('final_non_delivery')
  await expect(
    f.resolve(event.id, { resolution: 'Cannot establish custody', disposition: f.disposition }),
  ).rejects.toThrow()
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(0)
})
it('commerce/exception batch: final disposition must cover every unit and never restock lost/damaged goods', async () => {
  const f = await exceptionFixture(),
    event = await f.create('final_non_delivery')
  await expect(
    f.resolve(event.id, { resolution: 'Incomplete units', disposition: f.disposition.slice(0, 1) }),
  ).rejects.toThrow()
  await expect(
    f.resolve(event.id, {
      resolution: 'Invalid resale',
      disposition: f.disposition.map((d) => ({ ...d, custody: 'lost' })),
    }),
  ).rejects.toThrow()
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
})
it('commerce/exception batch: complete mixed custody closes once and restores only recovered inspected resale stock', async () => {
  const f = await exceptionFixture(),
    event = await f.create('final_non_delivery'),
    body = { resolution: 'Verified final non-delivery', disposition: f.disposition }
  await f.resolve(event.id, body)
  await f.resolve(event.id, body)
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 9, committed: 0, reserved: 0 })
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(1)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(0)
  expect(
    await db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'order_cancellation' }),
  ).toBe(1)
})
it('commerce/exception batch: competing final exceptions across admins have one custody/restock winner', async () => {
  const f = await exceptionFixture(),
    other = await customer('admin'),
    one = await f.create('final_non_delivery', 'final-one'),
    two = await f.create('final_non_delivery', 'final-two'),
    body = { resolution: 'Qualified disposition', disposition: f.disposition }
  const outcomes = await Promise.allSettled([
    f.resolve(one.id, body, 'final-one'),
    f.exceptions.resolve(other.credentials.customerToken, two.id, body, 'final-two'),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(await deliveryExceptionModel(db.connection).countDocuments({ status: 'resolved' })).toBe(1)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(1)
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.physical,
  ).toBe(9)
})
it('commerce/exception batch: paid final closure waits for a real refund planner and preserves evidence/stock', async () => {
  const f = await exceptionFixture(),
    payment = await paymentModel(db.connection).findOne({ orderId: f.id }).orFail()
  const cash = codCollectionService(
    db.connection,
    f.adminAccess,
    codCollectionOrderAccess(db.connection),
    async (data) => ({
      paymentId: data.paymentId,
      amountPoisha: data.amountPoisha,
      collectionReference: data.collectionReference,
      evidenceRef: data.evidenceRef,
      collectedAt: now,
      digest: 'a'.repeat(64),
    }),
    () => now,
  )
  await cash.collect(
    f.token,
    payment._id.toHexString(),
    {
      amountPoisha: payment.expectedPoisha,
      collectionReference: 'exception-cash',
      evidenceRef: 'synthetic:protected',
      reason: 'Recorded local cash',
    },
    'exception-cash',
  )
  const event = await f.create('final_non_delivery')
  await expect(
    f.resolve(event.id, { resolution: 'Paid failed delivery', disposition: f.disposition }),
  ).rejects.toThrow()
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect((await paymentModel(db.connection).findById(payment._id))?.paymentStatus).toBe('paid')
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.physical,
  ).toBe(8)
})
it('commerce/exception batch: downstream recovery failure rolls back receipt, final state and exception proof', async () => {
  const f = await exceptionFixture(),
    event = await f.create('final_non_delivery'),
    restore = recoveryReceiptService(db.connection, () => now)
  const failing = deliveryExceptionService(
    db.connection,
    f.adminAccess,
    cancellationPaymentAccess(db.connection),
    async (session, input) => {
      await restore(session, input)
      throw new Error('Synthetic downstream failure')
    },
    async () => 'a'.repeat(64),
    undefined,
    () => now,
  )
  await expect(
    failing.resolve(
      f.token,
      event.id,
      { resolution: 'Verified custody', disposition: f.disposition },
      'recovery-failure',
    ),
  ).rejects.toThrow()
  expect((await deliveryExceptionModel(db.connection).findById(event.id))?.status).toBe('open')
  expect((await orderModels(db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect(
    (await productModels(db.connection).variants.findById(f.selected.row._id))?.stock.physical,
  ).toBe(8)
  expect(
    await inventoryMovementModel(db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(0)
})
it('commerce/exception batch: ordinary model transition still cannot cancel shipped orders', async () => {
  const f = await exceptionFixture()
  await expect(
    orderModels(db.connection).orders.updateOne(
      { _id: f.id, fulfillmentStatus: 'shipped' },
      { $set: { fulfillmentStatus: 'cancelled' } },
    ),
  ).rejects.toThrow()
})
it('commerce/exception batch: scoped complaint contact resolution and privacy never use submitted contact as ownership proof', async () => {
  const f = await exceptionFixture(),
    other = await customer()
  const complaint = await f.complaints.submit(f.creds, f.id, {
    issue: 'Synthetic delivery concern',
  })
  const stored = await complaintModel(db.connection).findById(complaint.id).select('+contact')
  expect(stored?.contact.emailNormalized).toBe(
    (await orderModels(db.connection).orders.findById(f.id))?.customerSnapshot.emailNormalized,
  )
  const listed = await f.complaints.list(f.creds, f.id)
  expect(listed).toHaveLength(1)
  for (const key of ['contact', 'emailNormalized', 'phone', 'userId'])
    expect(JSON.stringify(listed)).not.toContain(key)
  await expect(
    f.complaints.submit({ ...other.credentials, csrfToken: other.csrf }, f.id, {
      issue: 'Wrong owner',
      contactEmail: f.who.user.emailNormalized,
    }),
  ).rejects.toThrow()
  await expect(f.complaints.list(other.credentials, f.id)).rejects.toThrow()
})
it('commerce/exception batch: complaints require documented response to resolve and preserve first response on close/replay', async () => {
  const f = await exceptionFixture(),
    complaint = await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic issue' })
  await expect(
    f.complaints.resolve(
      f.who.credentials.customerToken,
      complaint.id,
      { status: 'resolved', resolution: 'Unauthorized', contactOutcome: 'Claimed response' },
      'bad-admin',
    ),
  ).rejects.toThrow()
  await expect(
    f.complaints.resolve(
      f.token,
      complaint.id,
      { status: 'resolved', resolution: 'No response fact' },
      'no-response',
    ),
  ).rejects.toThrow()
  const reviewed = await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'in_review', resolution: 'Investigating', contactOutcome: 'Called customer' },
    'review',
  )
  now = new Date(now.getTime() + 1000)
  await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'resolved', resolution: 'Issue addressed', contactOutcome: 'Response recorded' },
    'resolve',
  )
  await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'closed', resolution: 'Case closed' },
    'close',
  )
  const replay = await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'in_review', resolution: 'Investigating', contactOutcome: 'Called customer' },
    'review',
  )
  expect(replay.status).toBe('closed')
  expect(replay.respondedAt).toBe(reviewed.respondedAt)
  expect(replay).not.toHaveProperty('deadlineAt')
})
it('commerce/exception batch: complaint audit failure rolls back private contact/issue and does not fabricate a response', async () => {
  const f = await exceptionFixture()
  await db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(
      f.complaints.submit(f.creds, f.id, { issue: 'Private synthetic issue' }),
    ).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect(await complaintModel(db.connection).countDocuments()).toBe(0)
  const saved = await f.complaints.submit(f.creds, f.id, { issue: 'Private synthetic issue' })
  expect(saved.status).toBe('open')
  expect(saved.respondedAt).toBeUndefined()
})
it('commerce/exception batch: compiled support/bootstrap preserves events and refuses deployed activation', async () => {
  const f = await exceptionFixture(),
    event = await f.create()
  await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic retained issue' })
  const env = {
    ...identityEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-delivery-support.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await deliveryExceptionModel(db.connection).findById(event.id))?.status).toBe('open')
  expect(await complaintModel(db.connection).countDocuments()).toBe(1)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-delivery-support.mjs'], {
    env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(refused.status).not.toBe(0)
})
it('commerce/exception batch: verified guest complaint scope is exact and public contact data never grants order access', async () => {
  await initializeComplaintPersistence(db.connection)
  const held = await heldOrder(),
    customers = createCustomerAccountAccess(db.connection, identities, sessions),
    guests = guestSessionService(
      db.connection,
      identities,
      {
        secret: authSecret,
        customerTtlSeconds: 600,
        adminTtlSeconds: 300,
        sameSite: 'lax',
        appEnvironment: 'test',
        apiOrigin: 'https://api.example.test',
      },
      600,
      guestOrderAccess(db.connection).verify,
      () => now,
    )
  const proof = await inTransaction(db.connection, (session) =>
      guests.issueAfterProof(session, held.result.id),
    ),
    scope = orderScopeAccess(customers, sessions, guests),
    support = complaintService(
      db.connection,
      scope,
      complaintOrderAccess(db.connection),
      createAdminAccountAccess(db.connection, identities, sessions),
      () => now,
    ),
    credentials = { customerPresent: false, guestToken: proof.token, csrfToken: proof.csrfToken }
  await support.submit(credentials, held.result.id, {
    issue: 'Scoped guest concern',
    contactName: '😀'.repeat(120),
  })
  expect(await support.list(credentials, held.result.id)).toHaveLength(1)
  const other = await heldOrder()
  await expect(support.list(credentials, other.result.id)).rejects.toThrow()
  await expect(
    support.submit({ customerPresent: false }, held.result.id, {
      issue: 'Anonymous contact is not proof',
      contactEmail: 'synthetic@example.test',
    }),
  ).rejects.toThrow()
})
it('commerce/exception batch: strict exception/complaint persistence prevents unsupported mutable evidence writes', async () => {
  const f = await exceptionFixture(),
    event = await f.create(),
    complaint = await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic integrity concern' })
  await expect(
    deliveryExceptionModel(db.connection).updateOne(
      { _id: event.id },
      { $set: { reason: 'Rewritten evidence' } },
    ),
  ).rejects.toThrow()
  await expect(
    complaintModel(db.connection).updateOne(
      { _id: complaint.id },
      { $set: { issue: 'Rewritten report' } },
    ),
  ).rejects.toThrow()
  await expect(
    db.connection.collection('deliveryExceptions').insertOne({
      _id: new Types.ObjectId(),
      orderId: new Types.ObjectId(f.id),
      type: 'final_non_delivery',
      reason: 'Invalid custody',
      status: 'resolved',
      operationKey: 'a'.repeat(64),
      requestDigest: 'b'.repeat(64),
      revision: 0,
      createdAt: now,
      updatedAt: now,
      resolvedAt: now,
      resolution: 'Invalid',
      contactHistory: [],
      disposition: [
        { orderItemId: f.item.id, quantity: 1, custody: 'lost', inspectedResellableQty: 1 },
      ],
      dispositionDigest: 'c'.repeat(64),
    }),
  ).rejects.toThrow()
})
it('commerce/exception batch: a pending-order delay concern records no fabricated confirmation or deadline', async () => {
  await initializeDeliveryExceptionPersistence(db.connection)
  const f = await cancellationReadFixture(),
    service = deliveryExceptionService(
      db.connection,
      createAdminAccountAccess(db.connection, identities, sessions),
      cancellationPaymentAccess(db.connection),
      recoveryReceiptService(db.connection, () => now),
      undefined,
      undefined,
      () => now,
    )
  const before = (await orderModels(db.connection).orders.findById(f.id).lean())?.deliveryCommitment
  await service.create(
    f.admin.credentials.customerToken,
    f.id,
    { type: 'delay', reason: 'Confirmation is awaiting qualified review' },
    'pending-delay',
  )
  const after = await orderModels(db.connection).orders.findById(f.id).lean()
  expect(after?.fulfillmentStatus).toBe('pending')
  expect(after?.confirmedAt).toBeUndefined()
  expect(after?.deliveryCommitment).toEqual(before)
  await expect(
    service.create(
      f.admin.credentials.customerToken,
      f.id,
      { type: 'final_non_delivery', reason: 'No shipment exists' },
      'invalid-final',
    ),
  ).rejects.toThrow()
})

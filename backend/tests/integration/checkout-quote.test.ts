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
    'orderItemBalances',
    'payments',
    'paymentAttempts',
    'paymentInitiations',
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
async function initiationApp(enabled = true) {
  await initializePaymentRecordPersistence(db.connection)
  await initializePaymentInitiationPersistence(db.connection)
  const config = loadEnvironment({
    ...identityEnvironment(),
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
  )
  return { root, transport }
}
async function customerHeldOrder() {
  const who = await customer(),
    selected = await variant(2000, 1500)
  await settingsModel(db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash' },
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

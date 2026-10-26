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
  sessions = createSessionService(db.connection, identities, {
    secret: randomBytes(32).toString('hex'),
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
  await db.connection.db?.collection('authRateLimits').deleteMany({})
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

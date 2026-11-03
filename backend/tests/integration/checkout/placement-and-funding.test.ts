import { spawnSync } from 'node:child_process'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { categoryModel } from '../../../src/modules/catalog/categories/category.model.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { variantStockAccess } from '../../../src/modules/catalog/products/variant.service.js'
import {
  createCheckoutCompletionService,
  createCheckoutExpiryService,
  createCheckoutIntentService,
} from '../../../src/modules/checkout/checkout.service.js'
import { checkoutIntentModel } from '../../../src/modules/checkout/checkout-intent.model.js'
import { checkoutQuoteModel } from '../../../src/modules/checkout/checkout-quote.model.js'
import { deliveryModels } from '../../../src/modules/delivery/delivery.model.js'
import { createDeliveryAreaRoutes } from '../../../src/modules/delivery/delivery.routes.js'
import { deliveryAreasAccess } from '../../../src/modules/delivery/delivery.service.js'
import {
  inventoryMovementModel,
  inventoryReservationModel,
} from '../../../src/modules/inventory/inventory.model.js'
import { createAllocationService } from '../../../src/modules/inventory/inventory.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { createDeliveryDeadlineService } from '../../../src/modules/orders/delivery-deadline.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  guestOrderAccess,
  initialOrderAllocationAccess,
  paymentAllocationOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import { createOrderAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { paymentEligibility } from '../../../src/modules/payments/attempts/payment-eligibility.service.js'
import { paymentInitiationModel } from '../../../src/modules/payments/attempts/payment-initiation.model.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { paymentInitiationEligibilityAccess } from '../../../src/modules/payments/payment.service.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { initializeCouponPersistence } from '../../../src/modules/promotions/promotion.persistence.js'
import { policyModel } from '../../../src/modules/settings/policy.model.js'
import { settingsModel } from '../../../src/modules/settings/setting.model.js'
import {
  composeApplication,
  composeAuditAccess,
  composeCheckoutCompletionDependencies,
  composeCheckoutExpiryDependencies,
  composeCheckoutIntentDependencies,
  composeOrderAllocationDependencies,
  composePaymentEligibilityDependencies,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  initializeJobLeases,
  jobLeaseModel,
  jobLeaseValidator,
} from '../../../src/shared/jobs/job-lease.model.js'
import { jobLeaseService } from '../../../src/shared/jobs/job-lease.service.js'
import { createLogger } from '../../../src/shared/logger.js'
import {
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
} from '../../helpers/commerce/base.js'
import {
  codApp,
  customerHeldOrder,
  expiryJob,
  heldOrder,
  initiationApp,
  paymentAllocations,
  placeCod,
  submissionService,
} from '../../helpers/commerce/checkout.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'
import { testEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

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
  const persisted = await checkoutQuoteModel(context.db.connection)
    .findById(result.body.data.quoteId)
    .orFail()
  expect(persisted.scopeType).toBe('guest_context')
  expect(persisted.scopeKeyHash).not.toContain(who.credentials.contextToken)
  expect(persisted.expiresAt?.getTime()).toBe(context.now.getTime() + 300000)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  for (const collection of [
    'orders',
    'inventoryReservations',
    'couponRedemptions',
    'payments',
    'paymentAttempts',
  ])
    expect(await context.db.connection.db?.collection(collection).countDocuments()).toBe(0)
})

it('requires exact Origin/CSRF and does not downgrade invalid/duplicate/customer-role cookies to guest', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item])
  await request(context.app).post(path).send(input).expect(403)
  await request(context.app)
    .post(path)
    .set('Origin', 'https://foreign.invalid')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .send(input)
    .expect(403)
  await request(context.app)
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
  expect(await checkoutQuoteModel(context.db.connection).countDocuments()).toBe(0)
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
  expect(await checkoutQuoteModel(context.db.connection).countDocuments()).toBe(0)
})

it('resolves only the current customer saved address and copies buyer/recipient contacts separately', async () => {
  const who = await customer(),
    foreign = await customer(),
    selected = await variant(),
    id = new Types.ObjectId()
  await context.identities.users.updateOne(
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
  const row = await checkoutQuoteModel(context.db.connection)
    .findById(result.body.data.quoteId)
    .orFail()
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
  await productModels(context.db.connection).products.updateOne(
    { _id: selected.product._id },
    { $set: { status: 'inactive' } },
  )
  await post(who, body([selected.item])).expect(409)
  await productModels(context.db.connection).products.updateOne(
    { _id: selected.product._id },
    { $set: { status: 'active' } },
  )
  await post(who, {
    ...body([selected.item]),
    recipient: { ...recipient, areaKey: 'unsupported' },
  }).expect(400)
  expect(await checkoutQuoteModel(context.db.connection).countDocuments()).toBe(0)
})

it('checks AND coupon scopes and applies the discount only to jointly eligible merchandise', async () => {
  const who = await guest(),
    a = await variant(),
    category = await categoryModel(context.db.connection).create({
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
  expect((await couponModels(context.db.connection).coupons.findOne())?.heldCount).toBe(0)
  expect(await couponModels(context.db.connection).redemptions.countDocuments()).toBe(0)
})

it('rejects per-customer coupons for guests and enforces canonical current usage for customers', async () => {
  const who = await guest(),
    c = await customer(),
    selected = await variant(),
    policy = await coupon({ perCustomerLimit: 1 }),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' }
  await post(who, input).expect(409)
  await post(c, input).expect(200)
  await couponModels(context.db.connection).customers.create({
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
  await settingsModel(context.db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  await post(who, { ...input, method: 'bkash' }).expect(422)
  const known = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
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
  await settingsModel(context.db.connection).updateOne(
    { key: 'primary' },
    { $unset: { 'activePolicyVersions.terms': 1 } },
  )
  await post(who, input).expect(503)
  expect(await checkoutQuoteModel(context.db.connection).countDocuments()).toBe(0)
})

it('revalidates stable line IDs without treating sufficient advisory stock changes as commercial changes', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = (await post(who, input).expect(200)).body.data
  const accepted = submit(input, quote)
  await productModels(context.db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 9 } },
  )
  const result = await revalidate(who.credentials, accepted)
  expect(result.snapshot.items[0]?.id).toBe(quote.items[0].id)
  expect((await checkoutQuoteModel(context.db.connection).findById(quote.quoteId))?.status).toBe(
    'open',
  )
  await productModels(context.db.connection).variants.updateOne(
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
  context.now = new Date(context.now.getTime() + 300000)
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'QUOTE_EXPIRED',
  })
  expect((await checkoutQuoteModel(context.db.connection).findById(quote.quoteId))?.status).toBe(
    'open',
  )
})

it('revalidates current stock/coupon capacity with their specific errors', async () => {
  const who = await guest(),
    selected = await variant(),
    policy = await coupon({ overallLimit: 1 }),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    quote = (await post(who, input).expect(200)).body.data,
    accepted = submit(input, quote)
  await productModels(context.db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 1 } },
  )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'OUT_OF_STOCK',
  })
  await productModels(context.db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 10 } },
  )
  await couponModels(context.db.connection).coupons.updateOne(
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
  const delivery = deliveryModels(context.db.connection)
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
    effectiveFrom: context.now,
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
  await productModels(context.db.connection).variants.updateOne(
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
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 2, reserved: 0, committed: 0 })
})

it('rejects changed policy pointers and corrupted consent snapshots before returning a submission basis', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = (await post(who, input).expect(200)).body.data,
    accepted = submit(input, quote)
  await policyModel(context.db.connection).create({
    type: 'terms',
    version: 'synthetic-terms-v2',
    content: 'Synthetic replacement',
    contentDigest: 'b'.repeat(64),
    status: 'published',
    effectiveAt: context.now,
    approvedAt: context.now,
    approvalEvidenceRef: 'synthetic:test-only',
    createdBy: new Types.ObjectId(),
  })
  await settingsModel(context.db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'activePolicyVersions.terms': 'synthetic-terms-v2' } },
  )
  await expect(revalidate(who.credentials, accepted)).rejects.toMatchObject({
    code: 'QUOTE_CHANGED',
  })
  await settingsModel(context.db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'activePolicyVersions.terms': 'synthetic-terms-v1' } },
  )
  await context.db.connection.db
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
  expect(await checkoutQuoteModel(context.db.connection).countDocuments()).toBe(10)
  const c = await customer()
  await context.identities.users.updateOne({ _id: c.user._id }, { $set: { status: 'suspended' } })
  await expect(context.service.create(c.credentials, input)).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
})

it('lists only active effective delivery areas with bounded filters and safe public CORS', async () => {
  const publicApp = createApp({
    apiRouter: createDeliveryAreaRoutes(
      deliveryAreasAccess(context.db.connection, () => context.now),
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
  const { zones, charges } = deliveryModels(context.db.connection),
    zone = await zones.findOne().orFail()
  await charges.create({
    zoneId: zone._id,
    coverageKey: 'dhaka:future',
    amountPoisha: 1,
    ruleVersion: 1,
    status: 'scheduled',
    effectiveFrom: new Date(context.now.getTime() + 10000),
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
    context.db.connection,
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
    context.db.connection,
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
    MONGODB_URI: context.db.replica.getUri(),
    MONGODB_DB_NAME: context.db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-checkout-quotes.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await checkoutQuoteModel(context.db.connection).findById(quote.quoteId))?.status).toBe(
    'open',
  )
  const indexes = await checkoutQuoteModel(context.db.connection).listIndexes()
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
  const stored = await checkoutQuoteModel(context.db.connection).findById(quote.quoteId).orFail()
  expect(stored.commercialSnapshot.coupon?.couponId).toBe(policy._id.toHexString())
  await couponModels(context.db.connection).coupons.updateOne(
    { _id: policy._id },
    { $inc: { termsVersion: 1 } },
  )
  await expect(revalidate(who.credentials, submit(input, quote))).rejects.toMatchObject({
    code: 'QUOTE_CHANGED',
  })
})

it('COD HTTP commits stock/coupon, pending payment and one order_received intent; replay is 200', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon(),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' }
  const quote = await context.service.create(who.credentials, input),
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
  context.now = new Date(context.now.getTime() + 600000)
  expect((await placeCod(who, payload).expect(200)).body.data).toEqual(first.body.data)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2, reserved: 0 })
  expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(1)
  expect(await paymentModel(context.db.connection).findOne()).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
    merchandiseFundedPoisha: 0,
  })
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.redeemedCount,
  ).toBe(1)
  const notification = await context.db.connection.db
    ?.collection('notifications')
    .findOne({ eventType: 'order_received' })
  expect(notification).toMatchObject({
    status: 'queued',
    templateVersion: 'order-received-v1',
    payload: {},
  })
  expect(notification).not.toHaveProperty('userId')
  expect(
    await context.db.connection.db
      ?.collection('notifications')
      .countDocuments({ eventType: 'order_received' }),
  ).toBe(1)
  for (const name of ['paymentCollections', 'paymentAttempts', 'providerReceiptIntake'])
    expect(await context.db.connection.db?.collection(name).countDocuments()).toBe(0)
})

it('COD HTTP rejects missing keys, wrong origins/CSRF, invalid cookies, financial injection and online activation', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await context.service.create(who.credentials, input),
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
  expect(await orderModels(context.db.connection).orders.countDocuments()).toBe(0)
})

it('concurrent COD submissions create one order and one effect set per scoped key', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await context.service.create(who.credentials, input),
    payload = submit(input, quote)
  const results = await Promise.all([
    placeCod(who, payload),
    placeCod(who, payload),
    placeCod(who, payload),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([200, 200, 201])
  expect(new Set(results.map((row) => row.body.data.order.id)).size).toBe(1)
  expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(1)
  expect(await paymentModel(context.db.connection).countDocuments()).toBe(1)
})

it('last-stock race across independent COD quotes admits one whole order and no losing effects', async () => {
  const selected = await variant(),
    a = await guest(),
    b = await guest()
  await productModels(context.db.connection).variants.updateOne(
    { _id: selected.row._id },
    { $set: { 'stock.physical': 2 } },
  )
  const input = body([selected.item]),
    qa = await context.service.create(a.credentials, input),
    qb = await context.service.create(b.credentials, input)
  const results = await Promise.all([
    placeCod(a, submit(input, qa), 'last-a'),
    placeCod(b, submit(input, qb), 'last-b'),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([201, 409])
  expect(await checkoutIntentModel(context.db.connection).countDocuments()).toBe(1)
  expect(await orderModels(context.db.connection).orders.countDocuments()).toBe(1)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 2, reserved: 0, committed: 2 })
})

it('final coupon race rolls back losing stock, order and consent atomically', async () => {
  const selected = await variant(),
    a = await guest(),
    b = await guest(),
    promotion = await coupon({ overallLimit: 1 })
  const input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    qa = await context.service.create(a.credentials, input),
    qb = await context.service.create(b.credentials, input)
  const results = await Promise.all([
    placeCod(a, submit(input, qa), 'coupon-a'),
    placeCod(b, submit(input, qb), 'coupon-b'),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([201, 409])
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.redeemedCount,
  ).toBe(1)
  expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(1)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .committed,
  ).toBe(2)
  expect(await checkoutQuoteModel(context.db.connection).countDocuments({ status: 'open' })).toBe(1)
})

it('notification persistence failure rolls back COD order, payment, stock and quote consumption', async () => {
  const who = await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await context.service.create(who.credentials, input)
  const notifications = createNotificationService(context.db.connection)
  await notifications.verifyIndexes()
  await context.db.connection.db
    ?.collection('notifications')
    .dropIndex('notifications_event_key_unique')
  try {
    await expect(
      submissionService().submit(who.credentials, submit(input, quote), 'notification-fail'),
    ).rejects.toThrow()
    for (const name of [
      'orders',
      'orderItemBalances',
      'returnRequests',
      'reviews',
      'checkoutIntents',
      'payments',
      'inventoryMovements',
    ])
      expect(await context.db.connection.db?.collection(name).countDocuments()).toBe(0)
    expect(
      (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
        .committed,
    ).toBe(0)
    expect((await checkoutQuoteModel(context.db.connection).findById(quote.quoteId))?.status).toBe(
      'open',
    )
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
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const input = { ...body([first.item, second.item]), method: 'bkash', couponCode: 'SYNTHETIC' }
  const quote = await quotes.create(who.credentials, input),
    api = submissionService(quotes),
    began = context.now.getTime()
  const result = await api.submit(who.credentials, submit(input, quote), 'synthetic-online')
  const holds = await inventoryReservationModel(context.db.connection).find({ orderId: result.id })
  expect(holds).toHaveLength(2)
  for (const hold of holds) {
    expect(hold.status).toBe('held')
    expect(hold.heldAt?.getTime()).toBe(began)
    expect(hold.expiresAt?.getTime()).toBe(began + 900000)
  }
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id })
    .orFail()
  expect(redemption.heldAt?.getTime()).toBe(began)
  expect(redemption.expiresAt?.getTime()).toBe(began + 900000)
  context.now = new Date(began + 300000)
  expect((await api.submit(who.credentials, submit(input, quote), 'synthetic-online')).id).toBe(
    result.id,
  )
  expect(
    (
      await couponModels(context.db.connection).redemptions.findById(redemption._id)
    )?.expiresAt?.getTime(),
  ).toBe(began + 900000)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(1)
  expect(await paymentModel(context.db.connection).findOne()).toMatchObject({
    method: 'online',
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.fulfillmentHold,
  ).toBe('payment_pending')
  expect(await context.db.connection.db?.collection('paymentAttempts').countDocuments()).toBe(0)
})

it('coordinated held release is retry-safe and a new generation gets a fresh shared 15-minute clock', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion =
      (await couponModels(context.db.connection).coupons.findOne({
        codeNormalized: 'SYNTHETIC',
      })) ?? (await coupon())
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
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
  const began = context.now.getTime()
  // Synthetic later lifecycle authority, kept out of production composition. The actual expiry/
  // payment/cancellation owner must authorize its own durable decisions in P06-010/P07/P06-013.
  const initial = initialOrderAllocationAccess(context.db.connection)
  const allocations = createOrderAllocationService(
    createAllocationService(
      context.db.connection,
      variantStockAccess(context.db.connection),
      () => context.now,
    ),
    {
      async authorize(session, orderId, generation, action) {
        if (orderId !== result.id || !['release_held', 'hold', 'commit'].includes(action))
          throw new Error('Synthetic decision denied')
        const binding = await initial.authorize(session, orderId, 1, 'hold')
        return { ...binding, generation }
      },
    },
    composeOrderAllocationDependencies(context.db.connection),
    () => context.now,
  )
  const run = (action: string, generation: number) =>
    inTransaction(context.db.connection, (session) =>
      allocations.apply(session, { orderId: result.id, generation, action }),
    )
  context.now = new Date(began + 900000)
  await run('release_held', 1)
  await run('release_held', 1)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ reserved: 0, committed: 0 })
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(0)
  context.now = new Date(began + 1200000)
  await run('hold', 2)
  const newest = await inventoryReservationModel(context.db.connection)
    .findOne({ orderId: result.id, generation: 2 })
    .orFail()
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id, generation: 2 })
    .orFail()
  expect(newest.heldAt?.getTime()).toBe(context.now.getTime())
  expect(newest.expiresAt?.getTime()).toBe(context.now.getTime() + 900000)
  expect(redemption.expiresAt).toEqual(newest.expiresAt)
  context.now = new Date(context.now.getTime() + 10000)
  await run('hold', 2)
  expect(
    (await inventoryReservationModel(context.db.connection).findById(newest._id))?.expiresAt,
  ).toEqual(newest.expiresAt)
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ orderId: result.id }),
  ).toBe(2)
  await run('commit', 2)
  await run('commit', 2)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 2 })
  expect(await couponModels(context.db.connection).coupons.findById(promotion._id)).toMatchObject({
    heldCount: 0,
    redeemedCount: 1,
  })
})

it('allocation authority and late coupon failure prevent partial release or unauthorized commitment', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon(),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    quote = await context.service.create(who.credentials, input)
  const result = await submissionService().submit(
    who.credentials,
    submit(input, quote),
    'release-rollback',
  )
  const initial = initialOrderAllocationAccess(context.db.connection),
    stock = createAllocationService(
      context.db.connection,
      variantStockAccess(context.db.connection),
      () => context.now,
    )
  const denied = createOrderAllocationService(
    stock,
    initial,
    composeOrderAllocationDependencies(context.db.connection),
    () => context.now,
  )
  await expect(
    inTransaction(context.db.connection, (session) =>
      denied.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
    ),
  ).rejects.toThrow()
  const synthetic = createOrderAllocationService(
    stock,
    {
      async authorize(session, orderId, generation, action) {
        if (action !== 'release_committed' || orderId !== result.id)
          throw new Error('Synthetic cancellation denied')
        return initial.authorize(session, orderId, generation, 'cod')
      },
    },
    composeOrderAllocationDependencies(context.db.connection),
    () => context.now,
  )
  await couponModels(context.db.connection).redemptions.collection.dropIndex(
    'coupon_order_generation_unique',
  )
  try {
    await expect(
      inTransaction(context.db.connection, (session) =>
        synthetic.apply(session, {
          orderId: result.id,
          generation: 1,
          action: 'release_committed',
        }),
      ),
    ).rejects.toThrow()
    expect(
      (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
        .committed,
    ).toBe(2)
    expect(
      (await couponModels(context.db.connection).coupons.findById(promotion._id))?.redeemedCount,
    ).toBe(1)
    expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(1)
  } finally {
    await initializeCouponPersistence(context.db.connection)
  }
  await inTransaction(context.db.connection, (session) =>
    synthetic.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
  )
  await inTransaction(context.db.connection, (session) =>
    synthetic.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
  )
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .committed,
  ).toBe(0)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.redeemedCount,
  ).toBe(0)
  expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(2)
})

it('registered COD placement stays pending and rejects unsupported financial success without receipts', async () => {
  const who = await customer(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await context.service.create(who.credentials, input)
  const first = await placeCod(who, submit(input, quote)).expect(201)
  const order = await orderModels(context.db.connection)
    .orders.findById(first.body.data.order.id)
    .orFail()
  expect(order.userId?.equals(who.user._id)).toBe(true)
  expect(order.confirmedAt).toBeUndefined()
  expect(order.fulfillmentStatus).toBe('pending')
  await expect(
    paymentModel(context.db.connection).collection.updateOne(
      { orderId: order._id },
      { $set: { paymentStatus: 'paid' } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    paymentModel(context.db.connection).collection.updateOne(
      { orderId: order._id },
      { $set: { verifiedCollectedPoisha: 1 } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    paymentModel(context.db.connection).collection.updateOne(
      { orderId: order._id },
      { $set: { expectedPoisha: 0.5 } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await context.identities.users.updateOne({ _id: who.user._id }, { $set: { status: 'suspended' } })
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
    context.db.connection,
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
    context.db.connection,
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
    quote = await context.service.create(who.credentials, input)
  await submissionService().submit(who.credentials, submit(input, quote), 'bootstrap-cod')
  const env = {
    ...testEnvironment(),
    MONGODB_URI: context.db.replica.getUri(),
    MONGODB_DB_NAME: context.db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-checkout-submit.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect(await orderModels(context.db.connection).orders.countDocuments()).toBe(1)
  expect(await paymentModel(context.db.connection).countDocuments()).toBe(1)
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-checkout-submit.mjs'], {
    env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).not.toContain(env.MONGODB_URI)
})

it('expires a whole unpaid generation at the exact boundary without cancelling its order/payment', async () => {
  const { result, selected, promotion } = await heldOrder(),
    started = context.now.getTime()
  context.now = new Date(started + 899999)
  expect((await expiryJob().run()).released).toBe(0)
  context.now = new Date(started + 900000)
  expect((await expiryJob().run()).released).toBe(1)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  expect(await couponModels(context.db.connection).coupons.findById(promotion._id)).toMatchObject({
    heldCount: 0,
    redeemedCount: 0,
  })
  expect(await paymentModel(context.db.connection).findOne({ orderId: result.id })).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.fulfillmentStatus,
  ).toBe('pending')
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({
      orderId: result.id,
      status: 'released',
    }),
  ).toBe(1)
  expect(
    await context.db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'checkout.hold.expire' }),
  ).toBe(1)
})

it('concurrent expiry runners release capacity and record the event only once', async () => {
  const { result } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  const outcomes = await Promise.all([expiryJob().run(), expiryJob().run(), expiryJob().run()])
  expect(outcomes.reduce((sum, item) => sum + item.released, 0)).toBe(1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({
      orderId: result.id,
      type: 'release_hold',
    }),
  ).toBe(1)
})

it('expiry retains verified-funded and risk-held capacity for reconciliation', async () => {
  const { result, selected } = await heldOrder()
  const payment = await paymentModel(context.db.connection).findOne({ orderId: result.id }).orFail()
  await paymentModel(context.db.connection).updateOne(
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
  context.now = new Date(context.now.getTime() + 900000)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
})

it('rolls back every expiry effect on audit failure, then resumes safely after restart', async () => {
  const { result, selected, promotion } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  await context.db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
  try {
    await expect(expiryJob().run()).rejects.toThrow()
    expect(
      (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
        .reserved,
    ).toBe(2)
    expect(
      (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
    ).toBe(1)
    expect(
      (await inventoryReservationModel(context.db.connection).findOne({ orderId: result.id }))
        ?.status,
    ).toBe('held')
    expect(
      await jobLeaseModel(context.db.connection).findOne({ jobKey: 'reservation-expiry' }),
    ).toMatchObject({ failureCount: 1, lastErrorCode: 'JOB_FAILED' })
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect((await expiryJob().run()).released).toBe(1)
})

it('rejects mixed stock/coupon clocks instead of partially releasing a generation', async () => {
  const { result, selected } = await heldOrder()
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id })
    .orFail()
  await couponModels(context.db.connection).redemptions.updateOne(
    { _id: redemption._id },
    {
      $set: {
        heldAt: new Date(context.now.getTime() + 1),
        expiresAt: new Date(context.now.getTime() + 900001),
      },
    },
  )
  context.now = new Date(context.now.getTime() + 900001)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
})

it('durable cursor moves past protected holds without starving eligible later orders', async () => {
  const first = await heldOrder(),
    second = await heldOrder()
  await paymentModel(context.db.connection).updateOne(
    { orderId: first.result.id },
    { $set: { riskStatus: 'review' } },
  )
  context.now = new Date(context.now.getTime() + 900000)
  expect((await expiryJob(1).run()).released).toBe(0)
  expect((await expiryJob(1).run()).released).toBe(1)
  expect(
    (await inventoryReservationModel(context.db.connection).findOne({ orderId: second.result.id }))
      ?.status,
  ).toBe('released')
  expect(
    (await inventoryReservationModel(context.db.connection).findOne({ orderId: first.result.id }))
      ?.status,
  ).toBe('held')
})

it('expired lease owners cannot mutate or checkpoint after a new runner takes ownership', async () => {
  const { result } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  const leases = jobLeaseService(
      context.db.connection,
      'reservation-expiry',
      1000,
      () => context.now,
    ),
    old = await leases.acquire()
  if (!old) throw new Error('Missing synthetic lease')
  context.now = new Date(context.now.getTime() + 1000)
  expect((await expiryJob().run()).released).toBe(1)
  await expect(
    inTransaction(context.db.connection, async (session) => {
      await leases.fence(session, old.owner)
      await createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, result.id, 1)
    }),
  ).rejects.toThrow()
  await expect(leases.finish(old.owner)).rejects.toThrow()
})

it('compiled expiry entry requires explicit options and runs bounded work without exposing identifiers', async () => {
  const env = {
    ...testEnvironment(),
    MONGODB_URI: context.db.replica.getUri(),
    MONGODB_DB_NAME: context.db.connection.name,
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
    model = paymentModel(context.db.connection),
    payment = await model.findOne({ orderId: result.id }).orFail()
  context.now = new Date(context.now.getTime() + 900000)
  // Synthetic verified-receipt application updates the same canonical aggregate fence. It does
  // not claim a live provider or late-payment stock reacquisition implementation.
  await Promise.all([
    expiryJob().run(),
    inTransaction(context.db.connection, async (session) => {
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
  const stock = (await productModels(context.db.connection).variants.findById(selected.row._id))
    ?.stock
  expect([0, 2]).toContain(stock?.reserved)
  expect(stock?.committed).toBe(0)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(stock?.reserved === 0 ? 0 : 1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({
      orderId: result.id,
      type: 'release_hold',
    }),
  ).toBeLessThanOrEqual(1)
})

it('lease loss after domain writes rolls back those writes before any stale owner can commit', async () => {
  const { result, selected } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  const leases = jobLeaseService(
      context.db.connection,
      'reservation-expiry',
      1000,
      () => context.now,
    ),
    claim = await leases.acquire()
  if (!claim) throw new Error('Missing synthetic claim')
  await expect(
    inTransaction(context.db.connection, async (session) => {
      await leases.fence(session, claim.owner)
      await createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, result.id, 1)
      context.now = new Date(context.now.getTime() + 1000)
      await leases.fence(session, claim.owner)
    }),
  ).rejects.toThrow()
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    await context.db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'checkout.hold.expire' }),
  ).toBe(0)
  expect((await expiryJob().run()).released).toBe(1)
})

it('job registry rejects TTL or validator drift rather than silently rewriting durable history', async () => {
  await jobLeaseModel(context.db.connection).collection.createIndex(
    { lastSucceededAt: 1 },
    { expireAfterSeconds: 0, name: 'synthetic_job_ttl' },
  )
  try {
    await expect(expiryJob().run()).rejects.toThrow('TTL')
    await expect(initializeJobLeases(context.db.connection)).rejects.toThrow('TTL')
  } finally {
    await jobLeaseModel(context.db.connection).collection.dropIndex('synthetic_job_ttl')
  }
  await context.db.connection.db?.command({ collMod: 'jobLeases', validator: {} })
  try {
    await expect(expiryJob().run()).rejects.toThrow('reviewed provisioning')
    await expect(initializeJobLeases(context.db.connection)).rejects.toThrow(
      'reviewed provisioning',
    )
  } finally {
    await context.db.connection.db?.command({ collMod: 'jobLeases', validator: jobLeaseValidator })
  }
})

it('initial hold clocks equal actual order placement even when service calls advance the server clock', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon()
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  let tick = context.now.getTime()
  const advancing = () => new Date(tick++)
  const api = createCheckoutIntentService(
    context.db.connection,
    context.access,
    quotes,
    createCheckoutCompletionService(
      composeAuditAccess(context.db.connection),
      composeCheckoutCompletionDependencies(context.db.connection),
      advancing,
    ),
    composeCheckoutIntentDependencies(),
    advancing,
  )
  const result = await api.submit(who.credentials, submit(input, quote), 'placement-clock')
  const order = await orderModels(context.db.connection).orders.findById(result.id).orFail()
  const reservation = await inventoryReservationModel(context.db.connection)
    .findOne({ orderId: result.id })
    .orFail()
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id, couponId: promotion._id })
    .orFail()
  expect(reservation.heldAt).toEqual(order.placedAt)
  expect(redemption.heldAt).toEqual(order.placedAt)
  expect(reservation.expiresAt?.getTime()).toBe(order.placedAt.getTime() + 900000)
  expect(redemption.expiresAt).toEqual(reservation.expiresAt)
})

it('payment allocation preparation retains valid holds and never extends a generation on replay', async () => {
  const { result } = await heldOrder(),
    allocation = await paymentAllocations()
  const initial = await inTransaction(context.db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  context.now = new Date(context.now.getTime() + 1000)
  const replay = await inTransaction(context.db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  expect(replay).toEqual(initial)
  expect(initial.generation).toBe(1)
})

it('payment preparation atomically reacquires expired stock and coupon under one new 15-minute generation', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  context.now = new Date(context.now.getTime() + 900000)
  const result2 = await inTransaction(context.db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  expect(result2).toEqual({
    generation: 2,
    heldAt: context.now,
    expiresAt: new Date(context.now.getTime() + 900000),
  })
  expect(
    await inventoryReservationModel(context.db.connection).findOne({
      orderId: result.id,
      generation: 1,
    }),
  ).toMatchObject({ status: 'released' })
  expect(
    await couponModels(context.db.connection).redemptions.findOne({
      orderId: result.id,
      generation: 2,
    }),
  ).toMatchObject({ status: 'held', heldAt: context.now, expiresAt: result2.expiresAt })
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(1)
})

it('concurrent payment reacquisition/expiry retains exactly one active stock/coupon generation', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  context.now = new Date(context.now.getTime() + 900000)
  const [refreshed] = await Promise.all([
    Promise.all([
      inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
      inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
    ]),
    expiryJob().run(),
  ])
  expect(refreshed[0]).toEqual(refreshed[1])
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({
      orderId: result.id,
      activeKey: 'active',
    }),
  ).toBe(1)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(1)
})

it('a late coupon failure rolls back stock release/reacquisition and leaves the original snapshots untouched', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  const original = (await orderModels(context.db.connection).orders.findById(result.id))
    ?.pricingSnapshot
  context.now = new Date(context.now.getTime() + 900000)
  await couponModels(context.db.connection).coupons.updateOne(
    { _id: promotion._id },
    { $set: { status: 'inactive' } },
  )
  await expect(
    inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
  ).rejects.toMatchObject({ code: 'COUPON_UNAVAILABLE' })
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ orderId: result.id }),
  ).toBe(1)
  expect(
    (await inventoryReservationModel(context.db.connection).findOne({ orderId: result.id }))
      ?.status,
  ).toBe('held')
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.pricingSnapshot,
  ).toEqual(original)
})

it('unresolved attempts protect both stock/coupon capacity against payment reacquisition and shortfall writes', async () => {
  const { result } = await heldOrder(),
    allocation = await paymentAllocations()
  const payment = await paymentModel(context.db.connection).findOne({ orderId: result.id }).orFail()
  await paymentRecordModels(context.db.connection).attempts.create({
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
  context.now = new Date(context.now.getTime() + 900000)
  await expect(
    inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const orderAccess = paymentAllocationOrderAccess(
    context.db.connection,
    paymentInitiationEligibilityAccess(context.db.connection),
  )
  await expect(
    inTransaction(context.db.connection, (session) => orderAccess.shortfall(session, result.id)),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({
      orderId: result.id,
      status: 'held',
    }),
  ).toBe(1)
})

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
  expect(await context.db.connection.db?.collection('orders').countDocuments()).toBe(1)
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
  expect(await paymentInitiationModel(context.db.connection).countDocuments()).toBe(0)
})

it('hosted-init defaults off and rejects missing historical postcode without fabricating or dispatching', async () => {
  const { who, result } = await customerHeldOrder(),
    disabled = await initiationApp(false)
  const path = `/api/v1/orders/${result.id}/payment-attempts`
  await request(disabled.root).post(path).send({ requestedChannel: 'bkash' }).expect(404)
  await orderModels(context.db.connection).orders.collection.updateOne(
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
  expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(0)
})

it('hosted-init authorizes exact proven guest orders with mutation CSRF and never downgrades an invalid customer cookie', async () => {
  const { result } = await heldOrder(),
    { root, transport } = await initiationApp()
  const guests = createGuestSessionService(
    context.db.connection,
    context.identities,
    {
      secret: authSecret,
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'https://api.example.test',
    },
    600,
    guestOrderAccess(context.db.connection).verify,
    () => context.now,
  )
  // Proof exchange is separately covered by guest-access tests; this fixture mints only after actual guest-order existence validation.
  const issued = await inTransaction(context.db.connection, (session) =>
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
  context.now = new Date(context.now.getTime() + 900000)
  await expiryJob().run()
  await productModels(context.db.connection).variants.updateOne(
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
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.fulfillmentHold,
  ).toBe('allocation_shortfall')
  expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(0)
  expect(transport).not.toHaveBeenCalled()
  await productModels(context.db.connection).variants.updateOne(
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
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
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
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': false } },
  )
  expect((await post().expect(200)).body.data.redirectUrl).toBeUndefined()
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  await paymentModel(context.db.connection).updateOne(
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
  await paymentModel(context.db.connection).updateOne(
    { orderId: result.id },
    { $set: { riskStatus: 'clear' } },
  )
  await orderModels(context.db.connection).orders.collection.updateOne(
    { _id: new Types.ObjectId(result.id) },
    { $set: { fulfillmentStatus: 'cancelled', cancelledAt: context.now } },
  )
  expect((await post().expect(200)).body.data.redirectUrl).toBeUndefined()
  expect(transport).toHaveBeenCalledTimes(1)
})

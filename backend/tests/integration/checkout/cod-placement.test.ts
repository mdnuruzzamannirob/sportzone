import { spawnSync } from 'node:child_process'
import request from 'supertest'
import { expect, it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { checkoutIntentModel } from '../../../src/modules/checkout/checkout-intent.model.js'
import { checkoutQuoteModel } from '../../../src/modules/checkout/checkout-quote.model.js'
import { inventoryMovementModel } from '../../../src/modules/inventory/inventory.model.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { composeApplication } from '../../../src/setup.js'
import { createLogger } from '../../../src/shared/logger.js'
import {
  body,
  context,
  coupon,
  customer,
  deadline,
  guest,
  options,
  origin,
  registerCommerceFixture,
  submit,
  variant,
} from '../../helpers/commerce/base.js'
import { codApp, placeCod, submissionService } from '../../helpers/commerce/checkout.js'
import { testEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

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

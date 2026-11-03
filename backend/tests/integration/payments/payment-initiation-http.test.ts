import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { guestOrderAccess } from '../../../src/modules/orders/order.service.js'
import { paymentInitiationModel } from '../../../src/modules/payments/attempts/payment-initiation.model.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { settingsModel } from '../../../src/modules/settings/setting.model.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  authSecret,
  context,
  customer,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import {
  customerHeldOrder,
  expiryJob,
  heldOrder,
  initiationApp,
} from '../../helpers/commerce/checkout.js'

registerCommerceFixture()

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

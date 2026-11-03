import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { sessionCookies } from '../../../src/modules/auth/auth.composition.js'
import { catalogCheckoutAccess } from '../../../src/modules/catalog/catalog.service.js'
import { checkoutDeliveryAccess } from '../../../src/modules/delivery/delivery.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { createCouponPreviewRoutes } from '../../../src/modules/promotions/promotion.routes.js'
import { createCouponPreviewService } from '../../../src/modules/promotions/promotion.service.js'
import { composeCatalogCheckoutAccessDependencies } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  context,
  coupon,
  customer,
  origin,
  registerCommerceFixture,
  variant,
} from '../../helpers/commerce/base.js'
import { customerHeldOrder, initiationApp } from '../../helpers/commerce/checkout.js'
import { cancellationReadFixture } from '../../helpers/commerce/orders.js'
import { packageCPost } from '../../helpers/commerce/refunds.js'
import { packageFRoot } from '../../helpers/commerce/support.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'

registerCommerceFixture()

it('backend completion: delivery/payment histories require exact current order scope and project only public authoritative facts', async () => {
  const f = await cancellationReadFixture(),
    other = await customer()
  for (const suffix of ['delivery-events', 'payments']) {
    const url = `/api/v1/orders/${f.id}/${suffix}`
    await request(f.readApp).get(url).expect(401)
    await request(f.readApp).get(url).set('Cookie', other.cookie).expect(404)
    await request(f.readApp).get(`${url}?extra=true`).set('Cookie', f.who.cookie).expect(400)
    const result = await request(f.readApp).get(url).set('Cookie', f.who.cookie).expect(200)
    expect(JSON.stringify(result.body)).not.toMatch(
      /providerPayload|secretHash|deliveryEnvelope|passwordHash|merchantAccountKey/,
    )
    if (suffix === 'delivery-events') {
      expect(result.body.data.status).toBe('pending')
      expect(result.body.data.events).toEqual([])
      expect(result.body.data.deadline).toBeDefined()
    } else {
      expect(result.body.data.payment.status).toBe('pending')
      expect(result.body.data.attempts).toEqual([])
    }
  }
  await context.identities.users.updateOne(
    { _id: f.who.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(f.readApp)
    .get(`/api/v1/orders/${f.id}/payments`)
    .set('Cookie', f.who.cookie)
    .expect(401)
})

it('backend completion: coupon preview uses authoritative pricing, denies CSRF/tampering, and never holds or redeems capacity', async () => {
  const who = await customer(),
    selected = await variant(),
    discount = await coupon()
  const preview = createCouponPreviewService(
    context.db.connection,
    context.access,
    catalogCheckoutAccess(context.db.connection, composeCatalogCheckoutAccessDependencies()),
    checkoutDeliveryAccess(context.db.connection),
    () => context.now,
  )
  const root = createApp({
    apiRouter: createCouponPreviewRoutes(preview, context.security, sessionCookies),
  })
  const input = { code: discount.codeNormalized, items: [selected.item] }
  const send = (body: object, token = who.csrf) =>
    request(root)
      .post('/api/v1/coupons/preview')
      .set('Origin', origin)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', token)
      .send(body)
  await send(input, 'invalid').expect(403)
  await send({ ...input, discountPoisha: 1 }).expect(400)
  await send({ ...input, items: [selected.item, selected.item] }).expect(400)
  const expected = await preview.preview({ ...who.credentials, csrfToken: who.csrf }, input)
  expect(expected.eligible).toBe(true)
  expect(expected.discountPoisha).toBeGreaterThan(0)
  for (let retry = 0; retry < 2; retry++)
    expect((await send(input).expect(200)).body.data).toEqual(expected)
  const current = await couponModels(context.db.connection).coupons.findById(discount._id).orFail()
  expect(current.heldCount).toBe(0)
  expect(current.redeemedCount).toBe(0)
  expect(await couponModels(context.db.connection).customers.countDocuments()).toBe(0)
  expect(await couponModels(context.db.connection).redemptions.countDocuments()).toBe(0)
  expect((await send({ ...input, code: 'ABSENT' }).expect(200)).body.data).toEqual({
    eligible: false,
    discountPoisha: 0,
    reasonCode: 'COUPON_UNAVAILABLE',
  })
})

it('backend completion: payment history exposes bounded safe attempt facts without gateway redirects or raw provider evidence', async () => {
  const { who, result } = await customerHeldOrder(),
    { root } = await initiationApp(true, undefined, false, undefined, true)
  const initiated = await request(root)
    .post(`/api/v1/orders/${result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', 'history-attempt')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  const response = await request(root)
    .get(`/api/v1/orders/${result.id}/payments`)
    .set('Cookie', who.cookie)
    .expect(200)
  expect(response.body.data.attempts).toHaveLength(1)
  expect(response.body.data.attempts[0]).toMatchObject({
    id: initiated.body.data.attemptId,
    state: 'initiated',
    amountDisposition: 'not_checked',
    expectedAmountPoisha: initiated.body.data.expectedAmountPoisha,
  })
  expect(JSON.stringify(response.body.data)).not.toMatch(
    /redirectUrl|sessionKey|merchantAccountKey|providerPayload|validationId|bankTranId/,
  )
})

it('backend completion: admin notification filters include email verification but retry cannot resend an identity proof', async () => {
  const root = await packageFRoot(),
    administrator = await customer('admin'),
    buyer = await customer(),
    id = new Types.ObjectId(),
    store = createNotificationService(context.db.connection)
  await inTransaction(context.db.connection, (session) =>
    store.enqueueEmailVerification(
      {
        id,
        challengeId: new Types.ObjectId(),
        userId: buyer.user._id,
        email: buyer.user.emailNormalized,
      },
      session,
    ),
  )
  await context.db.connection.collection('notifications').updateOne(
    { _id: id },
    {
      $set: { status: 'failed', lastErrorCode: 'PROVIDER_REJECTED' },
    },
  )
  const listed = await request(root)
    .get('/api/v1/admin/notifications?eventType=email_verification')
    .set('Cookie', administrator.cookie)
    .expect(200)
  expect(listed.body.data.map((row: { id: string }) => row.id)).toEqual([id.toHexString()])
  await packageCPost(root, administrator, `/admin/notifications/${id}/retry`, {
    reason: 'Do not resend verification proof',
  }).expect(422)
  expect(
    (await context.db.connection.collection('notifications').findOne({ _id: id }))?.status,
  ).toBe('failed')
})

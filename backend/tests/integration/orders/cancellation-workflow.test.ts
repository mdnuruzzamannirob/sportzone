import { spawnSync } from 'node:child_process'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import {
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { sessionCookies } from '../../../src/modules/auth/auth.composition.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { orderPolicySnapshotAccess } from '../../../src/modules/checkout/checkout.service.js'
import { checkoutQuoteModel } from '../../../src/modules/checkout/checkout-quote.model.js'
import { inventoryMovementModel } from '../../../src/modules/inventory/inventory.model.js'
import { cancellationModel } from '../../../src/modules/orders/cancellation.model.js'
import {
  cancellationValidator,
  initializeCancellationPersistence,
  verifyCancellationPersistence,
} from '../../../src/modules/orders/cancellation.persistence.js'
import { createCancellationService } from '../../../src/modules/orders/cancellation.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  createCancellationRoutes,
  createOrderReadRoutes,
} from '../../../src/modules/orders/order.routes.js'
import {
  codCollectionOrderAccess,
  guestOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import {
  createCancellationAllocationService,
  createFulfillmentAllocationService,
} from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { createOrderReadService } from '../../../src/modules/orders/order-read.service.js'
import { createCodCollectionService } from '../../../src/modules/payments/collections/cod-collection.service.js'
import { createPaymentMonitorService } from '../../../src/modules/payments/collections/payment-monitor.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { initializePaymentRecordPersistence } from '../../../src/modules/payments/collections/payment-record.persistence.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import {
  cancellationPaymentAccess,
  customerPaymentSummaryAccess,
  fulfillmentPaymentAccess,
} from '../../../src/modules/payments/payment.service.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { settingsModel } from '../../../src/modules/settings/setting.model.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composeCancellationDependencies,
  composeCodCollectionDependencies,
  composeFulfillmentAllocationDependencies,
  composeOrderLifecycleDependencies,
  composeOrderReadDependencies,
  composePaymentMonitorDependencies,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { sessionHttpFor } from '../../helpers/auth.js'
import {
  authSecret,
  context,
  customer,
  origin,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { heldOrder, initiationApp } from '../../helpers/commerce/checkout.js'
import {
  cancellationReadFixture,
  fundedCancellationFixture,
} from '../../helpers/commerce/orders.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('cancellation/read local: submission only requests review and concurrent duplicates protect one pending identity', async () => {
  const f = await cancellationReadFixture(),
    rows = await Promise.all([f.ask(), f.ask(), f.ask()])
  expect(new Set(rows.map((r) => r.id)).size).toBe(1)
  expect(await cancellationModel(context.db.connection).countDocuments()).toBe(1)
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .committed,
  ).toBe(2)
  await expect(f.ask('Different pending explanation')).rejects.toThrow()
})

it('cancellation/read local: authorized unpaid COD approval releases once without a monetary refund', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask()
  await f.decide(asked.id)
  await f.decide(asked.id)
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(1)
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
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
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .committed,
  ).toBe(2)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'release_commit' }),
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
  expect(await cancellationModel(context.db.connection).countDocuments()).toBe(0)
})

it('cancellation/read local: Processing needs explicit no-dispatch verification and Shipped cannot cancel', async () => {
  const f = await cancellationReadFixture(),
    lifecycle = createOrderLifecycleService(
      context.db.connection,
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      fulfillmentPaymentAccess(context.db.connection),
      createFulfillmentAllocationService(
        composeFulfillmentAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composeOrderLifecycleDependencies(context.db.connection),
      async () => {},
      () => context.now,
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
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
})

it('cancellation/read local: collected cash blocks approval until a real refund obligation capability exists', async () => {
  const f = await cancellationReadFixture(),
    lifecycle = createOrderLifecycleService(
      context.db.connection,
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      fulfillmentPaymentAccess(context.db.connection),
      createFulfillmentAllocationService(
        composeFulfillmentAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composeOrderLifecycleDependencies(context.db.connection),
      async () => {},
      () => context.now,
    )
  await lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'confirmed', reason: 'Synthetic confirmation' },
    'confirmed-cancel',
  )
  const payment = await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  const receipt = createCodCollectionService(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (data) => ({
      paymentId: data.paymentId,
      amountPoisha: data.amountPoisha,
      collectionReference: data.collectionReference,
      evidenceRef: data.evidenceRef,
      collectedAt: context.now,
      digest: 'a'.repeat(64),
    }),
    () => context.now,
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
  expect((await cancellationModel(context.db.connection).findById(asked.id))?.status).toBe(
    'requested',
  )
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'confirmed',
  )
  expect((await paymentModel(context.db.connection).findById(payment._id))?.paymentStatus).toBe(
    'paid',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .committed,
  ).toBe(2)
})

it('funded cancellation: approval reserves every collected poisha with durable intents and releases stock exactly once', async () => {
  const f = await fundedCancellationFixture(),
    asked = await f.ask()
  const input = { decision: 'approve', reason: 'Synthetic approved cancellation' }
  const first = await f.cancellation.decide(
    f.admin.credentials.customerToken,
    asked.id,
    input,
    'approve-funded',
  )
  expect(first.status).toBe('approved')
  expect(
    await f.cancellation.decide(
      f.admin.credentials.customerToken,
      asked.id,
      input,
      'approve-funded',
    ),
  ).toEqual(first)
  const refunds = await refundModel(context.db.connection).find({ orderId: f.id })
  expect(refunds.reduce((sum, r) => sum + r.amountPoisha, 0)).toBe(f.amount)
  expect(refunds.every((r) => r.basis === 'cancellation' && r.capacityStatus === 'reserved')).toBe(
    true,
  )
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(refunds.length)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('cancelled')
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock.committed,
  ).toBe(0)
  const payment = await paymentModel(context.db.connection).findById(f.payment._id).orFail()
  expect(payment.merchandiseRefundHeldPoisha).toBe(f.amount)
  expect(payment.merchandiseRefundCompletedPoisha).toBe(0)
  expect(payment.paymentStatus).toBe('paid')
  const monitoring = await createPaymentMonitorService(
    context.db.connection,
    f.admins,
    composeAuditAccess(context.db.connection),
    composePaymentMonitorDependencies(context.db.connection),
  ).detail(f.admin.credentials.customerToken, f.payment._id.toHexString(), {})
  expect(monitoring.corrections).toEqual([])
  expect(monitoring.pagination.corrections.totalItems).toBe(0)
})

it('funded cancellation: partially collected COD creates only the verified amount of refund liability', async () => {
  const f = await fundedCancellationFixture(true),
    asked = await f.ask()
  await f.cancellation.decide(
    f.admin.credentials.customerToken,
    asked.id,
    { decision: 'approve', reason: 'Synthetic partial cash cancellation' },
    'partial-cancel',
  )
  const rows = await refundModel(context.db.connection).find({ orderId: f.id })
  expect(rows.reduce((sum, r) => sum + r.amountPoisha, 0)).toBe(1)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id).orFail())
      .verifiedCollectedPoisha,
  ).toBe(1)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('cancelled')
})

it('funded cancellation: downstream allocation failure rolls back the refund holds, attempts and cancellation together', async () => {
  const f = await fundedCancellationFixture(),
    asked = await f.ask()
  const failing = createCancellationService(
    context.db.connection,
    f.scope,
    f.admins,
    async (session, binding) => {
      await f.release(session, binding)
      throw new Error('Synthetic release failure after durable refund writes')
    },
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    f.refund,
    () => context.now,
  )
  await expect(
    failing.decide(
      f.admin.credentials.customerToken,
      asked.id,
      { decision: 'approve', reason: 'Synthetic rollback' },
      'rollback',
    ),
  ).rejects.toThrow()
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(0)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(0)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id).orFail())
      .merchandiseRefundHeldPoisha,
  ).toBe(0)
  expect((await cancellationModel(context.db.connection).findById(asked.id).orFail()).status).toBe(
    'requested',
  )
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('confirmed')
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock.committed,
  ).toBe(2)
})

it('funded cancellation: concurrent shipment and paid cancellation across admins have one whole-order winner', async () => {
  const f = await fundedCancellationFixture(),
    other = await customer('admin')
  await f.lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'processing', reason: 'Synthetic processing' },
    'process-funded',
  )
  const asked = await f.ask()
  const outcomes = await Promise.allSettled([
    f.cancellation.decide(
      f.admin.credentials.customerToken,
      asked.id,
      {
        decision: 'approve',
        reason: 'Synthetic no-dispatch proof',
        dispatchNotStartedConfirmed: true,
      },
      'race-cancel',
    ),
    f.lifecycle.transition(
      other.credentials.customerToken,
      f.id,
      { to: 'shipped', reason: 'Synthetic shipment', dispatchReference: 'funded-race-dispatch' },
      'race-ship',
    ),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const order = await orderModels(context.db.connection).orders.findById(f.id).orFail()
  const payment = await paymentModel(context.db.connection).findById(f.payment._id).orFail()
  expect(payment.merchandiseRefundHeldPoisha).toBe(
    order.fulfillmentStatus === 'cancelled' ? f.amount : 0,
  )
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(
    order.fulfillmentStatus === 'cancelled' ? 1 : 0,
  )
})

it('cancellation HTTP: scoped request and protected paid decision use real reservation and remain replay-safe', async () => {
  const f = await fundedCancellationFixture(),
    other = await customer()
  const root = createApp({
    apiRouter: createCancellationRoutes(
      f.cancellation,
      context.security,
      sessionHttpFor(context.sessions),
      origin,
    ),
  })
  const path = `/api/v1/orders/${f.id}/cancellation-requests`
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', f.who.cookie)
    .set('X-CSRF-Token', f.who.csrf)
    .send({ reason: 'Request without key' })
    .expect(400)
  const created = await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', f.who.cookie)
    .set('X-CSRF-Token', f.who.csrf)
    .set('Idempotency-Key', 'http-request')
    .send({ reason: 'Synthetic customer request' })
    .expect(201)
  await request(root).get(path).set('Cookie', other.cookie).expect(404)
  expect(
    (await request(root).get(path).set('Cookie', f.who.cookie).expect(200)).body.data,
  ).toHaveLength(1)
  const queue = await request(root)
    .get('/api/v1/admin/cancellation-requests?status=requested&pageSize=1')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(queue.body.data[0].id).toBe(created.body.data.id)
  const decisionPath = `/api/v1/admin/cancellation-requests/${created.body.data.id}/decision`
  await request(root)
    .post(decisionPath)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', f.admin.cookie)
    .send({ decision: 'approve', reason: 'Missing CSRF' })
    .expect(403)
  const approve = () =>
    request(root)
      .post(decisionPath)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', f.admin.cookie)
      .set('X-CSRF-Token', f.admin.csrf)
      .set('Idempotency-Key', 'http-approve')
      .send({ decision: 'approve', reason: 'Synthetic authorized approval' })
  await approve().expect(200)
  await approve().expect(200)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('cancelled')
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id).orFail())
      .merchandiseRefundHeldPoisha,
  ).toBe(f.amount)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(1)
})

it('cancellation HTTP: verified guest scope and CSRF are exact and invalid customer cookies never downgrade', async () => {
  const held = await heldOrder()
  await initializeCancellationPersistence(context.db.connection)
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
  const proof = await inTransaction(context.db.connection, (session) =>
    guests.issueAfterProof(session, held.result.id),
  )
  const scope = orderScopeAccess(
    createCustomerAccountAccess(context.db.connection, context.identities, context.sessions),
    context.sessions,
    guests,
  )
  const service = createCancellationService(
    context.db.connection,
    scope,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    createCancellationAllocationService(
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    undefined,
    () => context.now,
  )
  const root = createApp({
    apiRouter: createCancellationRoutes(
      service,
      context.security,
      sessionHttpFor(context.sessions),
      origin,
    ),
  })
  const path = `/api/v1/orders/${held.result.id}/cancellation-requests`,
    cookie = `sz_guest_order_sid=${proof.token}`
  await request(root)
    .post(path)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', proof.csrfToken)
    .set('Idempotency-Key', 'missing-origin')
    .send({ reason: 'No origin' })
    .expect(403)
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', 'bad')
    .set('Idempotency-Key', 'bad-csrf')
    .send({ reason: 'Wrong CSRF' })
    .expect(403)
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', proof.csrfToken)
    .set('Idempotency-Key', 'guest-cancel')
    .send({ reason: 'Verified guest request' })
    .expect(201)
  await request(root).get(path).set('Cookie', `${cookie}; sz_customer_sid=invalid`).expect(401)
  await request(root).get(path).set('Cookie', cookie).expect(200)
})

it('cancellation/read local: audit readiness failure leaves request/order/stock recoverable with the same decision key', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask()
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.decide(asked.id)).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
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
  await productModels(context.db.connection).variants.updateOne(
    { _id: f.selected.row._id },
    { $set: { regularPricePoisha: 99999, status: 'inactive' } },
  )
  await productModels(context.db.connection).products.updateOne(
    { _id: f.selected.product._id },
    { $set: { name: 'Changed current product' } },
  )
  await settingsModel(context.db.connection).updateOne({}, { $set: { activePolicyVersions: {} } })
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
  await checkoutQuoteModel(context.db.connection).deleteMany({ orderId: f.id })
  await request(f.readApp).get(`/api/v1/orders/${f.id}`).set('Cookie', f.who.cookie).expect(503)
  await request(f.readApp)
    .get(`/api/v1/orders/${f.id}/status`)
    .set('Cookie', f.who.cookie)
    .expect(200)
  await context.identities.users.updateOne(
    { _id: f.who.user._id },
    { $set: { status: 'suspended' } },
  )
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
  expect(await cancellationModel(context.db.connection).countDocuments()).toBe(2)
})

it('cancellation/read local: exact guest proof reads only its order, cannot enumerate, and invalid customer cookies never fall back', async () => {
  await initializePaymentRecordPersistence(context.db.connection)
  const held = await heldOrder(),
    customers = createCustomerAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    )
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
  const proof = await inTransaction(context.db.connection, (session) =>
    guests.issueAfterProof(session, held.result.id),
  )
  const scope = orderScopeAccess(customers, context.sessions, guests),
    reading = createOrderReadService(
      context.db.connection,
      customers,
      scope,
      customerPaymentSummaryAccess(context.db.connection),
      orderPolicySnapshotAccess(context.db.connection),
      composeOrderReadDependencies(),
      () => context.now,
    ),
    root = createApp({
      apiRouter: createOrderReadRoutes(reading, context.security, sessionCookies),
    }),
    cookie = `sz_guest_order_sid=${proof.token}`
  await request(root).get(`/api/v1/orders/${held.result.id}`).set('Cookie', cookie).expect(200)
  for (const suffix of ['delivery-events', 'payments']) {
    await request(root)
      .get(`/api/v1/orders/${held.result.id}/${suffix}`)
      .set('Cookie', cookie)
      .expect(200)
    await request(root)
      .get(`/api/v1/orders/${new Types.ObjectId()}/${suffix}`)
      .set('Cookie', cookie)
      .expect(401)
    await request(root)
      .get(`/api/v1/orders/${held.result.id}/${suffix}`)
      .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
      .expect(401)
  }
  await request(root).get('/api/v1/orders').set('Cookie', cookie).expect(401)
  const other = await heldOrder()
  await request(root).get(`/api/v1/orders/${other.result.id}`).set('Cookie', cookie).expect(401)
  await request(root)
    .get(`/api/v1/orders/${held.result.id}`)
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .expect(401)
  await initializeCancellationPersistence(context.db.connection)
  const cancel = createCancellationService(
    context.db.connection,
    scope,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    createCancellationAllocationService(
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    undefined,
    () => context.now,
  )
  const asked = await cancel.request(
    { customerPresent: false, guestToken: proof.token, csrfToken: proof.csrfToken },
    held.result.id,
    { reason: 'Verified guest request' },
    'guest-key',
  )
  expect(
    (await cancellationModel(context.db.connection).findById(asked.id))?.requestedBy.kind,
  ).toBe('guest_order')
  context.now = new Date(context.now.getTime() + 600001)
  await request(root).get(`/api/v1/orders/${held.result.id}`).set('Cookie', cookie).expect(401)
})

it('cancellation/read local: pending online attempts keep reconciliation and late collections become correction only', async () => {
  await initializeCancellationPersistence(context.db.connection)
  await initializeCorrectionPersistence(context.db.connection)
  const f = await processingFixture(true),
    customers = createCustomerAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    ),
    admin = await customer('admin')
  const cancel = createCancellationService(
    context.db.connection,
    orderScopeAccess(customers, context.sessions),
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    createCancellationAllocationService(
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    undefined,
    () => context.now,
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
  expect(
    (await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id))?.state,
  ).toBe('initiated')
  expect(
    (await couponModels(context.db.connection).redemptions.findOne({ orderId: f.result.id }))
      ?.status,
  ).toBe('released')
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    (await orderModels(context.db.connection).orders.findById(f.result.id))?.fulfillmentStatus,
  ).toBe('cancelled')
  expect(
    (await paymentModel(context.db.connection).findById(f.attempt.paymentId))
      ?.merchandiseFundedPoisha,
  ).toBe(0)
  expect(
    (await paymentModel(context.db.connection).findById(f.attempt.paymentId))
      ?.correctionCollectedPoisha,
  ).toBe(f.attempt.expectedAmountPoisha)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 0, reserved: 0 })
  const reading = createOrderReadService(
    context.db.connection,
    customers,
    orderScopeAccess(customers, context.sessions),
    customerPaymentSummaryAccess(context.db.connection),
    orderPolicySnapshotAccess(context.db.connection),
    composeOrderReadDependencies(),
    () => context.now,
  )
  expect(await reading.read(f.who.credentials, f.result.id, true)).toMatchObject({
    fulfillmentStatus: 'cancelled',
    paymentSummary: { status: 'paid', fundingContext: 'correction_only' },
  })
})

it('cancellation/read local: failure after actual release rolls back stock, request and order before safe retry', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask(),
    release = createCancellationAllocationService(
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    )
  const cancel = createCancellationService(
    context.db.connection,
    orderScopeAccess(
      createCustomerAccountAccess(context.db.connection, context.identities, context.sessions),
      context.sessions,
    ),
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    async (session, binding) => {
      await release(session, binding)
      throw new Error('Synthetic downstream failure')
    },
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    undefined,
    () => context.now,
  )
  await expect(
    cancel.decide(
      f.admin.credentials.customerToken,
      asked.id,
      { decision: 'approve', reason: 'Rollback test' },
      'rollback-decision',
    ),
  ).rejects.toThrow()
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
  expect((await cancellationModel(context.db.connection).findById(asked.id))?.status).toBe(
    'requested',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .committed,
  ).toBe(2)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(0)
  await f.decide(asked.id)
})

it('cancellation/read local: different-admin dispatch and cancellation race cannot release shipped quantities', async () => {
  const f = await cancellationReadFixture(),
    other = await customer('admin'),
    lifecycle = createOrderLifecycleService(
      context.db.connection,
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      fulfillmentPaymentAccess(context.db.connection),
      createFulfillmentAllocationService(
        composeFulfillmentAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composeOrderLifecycleDependencies(context.db.connection),
      async () => {},
      () => context.now,
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
  const order = await orderModels(context.db.connection).orders.findById(f.id),
    stock = (await productModels(context.db.connection).variants.findById(f.selected.row._id))
      ?.stock
  expect(['shipped', 'cancelled']).toContain(order?.fulfillmentStatus)
  expect(stock).toMatchObject({
    physical: order?.fulfillmentStatus === 'shipped' ? 8 : 10,
    committed: 0,
    reserved: 0,
  })
  expect((await cancellationModel(context.db.connection).findById(asked.id))?.status).toBe(
    order?.fulfillmentStatus === 'cancelled' ? 'approved' : 'requested',
  )
})

it('cancellation/read local: cancellation bootstrap is additive and unknown validator drift is refused', async () => {
  const f = await cancellationReadFixture(),
    asked = await f.ask(),
    env = {
      ...identityEnvironment(),
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
    }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-cancellations.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await cancellationModel(context.db.connection).findById(asked.id))?.status).toBe(
    'requested',
  )
  await context.db.connection.db?.command({ collMod: 'cancellationRequests', validator: {} })
  try {
    await expect(verifyCancellationPersistence(context.db.connection)).rejects.toThrow()
  } finally {
    await context.db.connection.db?.command({
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

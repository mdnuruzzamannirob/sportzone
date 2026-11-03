import { expect, it, vi } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { inventoryReservationModel } from '../../../src/modules/inventory/inventory.model.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import type { EmailAdapter } from '../../../src/modules/notifications/notification.types.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { verifiedFundingOrderAccess } from '../../../src/modules/orders/order.service.js'
import { createVerifiedAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createPaymentProcessingService } from '../../../src/modules/payments/collections/payment-processing.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composeNotificationWorker,
  composePaymentOutcomeDependencies,
} from '../../../src/setup.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { initiationApp } from '../../helpers/commerce/checkout.js'
import { paymentDelivery, processingFixture, retryPost } from '../../helpers/commerce/payments.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('retry/notification batch: fresh verified nonpayment precedes renewed stock/coupon generation and one new hosted dispatch', async () => {
  const f = await processingFixture(true)
  context.now = new Date(context.now.getTime() + 900001)
  f.change({ status: 'FAILED' })
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  const first = await retryPost(root, f, 'safe-retry').expect(200)
  expect(first.body.data.attemptId).not.toBe(f.attempt._id.toHexString())
  expect(transport).toHaveBeenCalledTimes(1)
  const reads = f.transport.mock.calls.length
  await retryPost(root, f, 'safe-retry').expect(200)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(f.transport).toHaveBeenCalledTimes(reads)
  const stock = await inventoryReservationModel(context.db.connection)
    .find({ orderId: f.result.id })
    .sort({ generation: 1 })
    .lean()
  expect(stock).toMatchObject([
    { generation: 1, status: 'released' },
    { generation: 2, status: 'held', heldAt: context.now },
  ])
  const coupon = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: f.result.id, generation: 2 })
    .orFail()
  expect(coupon.heldAt).toEqual(stock[1]?.heldAt)
  expect(coupon.expiresAt).toEqual(stock[1]?.expiresAt)
  expect(await orderModels(context.db.connection).orders.countDocuments()).toBe(1)
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
    expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(1)
    if (outcome === 'paid')
      expect(
        await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
      ).toMatchObject({
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
    await context.identities.users.updateOne(
      { _id: f.who.user._id },
      { $set: { status: 'suspended' } },
    )
    return original(...args)
  })
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  await retryPost(root, f, 'revoked-retry').expect(403)
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(1)
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
})

it('retry/notification batch: duplicate paid receipts queue one accurate email and retry delivery never replays money', async () => {
  const f = await processingFixture()
  expect(
    await Promise.all([f.processor().process(f.claim), f.processor().process(f.claim)]),
  ).toEqual(['committed', 'committed'])
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'payment_success' }),
  ).toBe(1)
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValueOnce({ kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' })
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-mail' })
  await paymentDelivery({ send }).runBatch()
  context.now = new Date(context.now.getTime() + 1001)
  await paymentDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[0]?.[0].idempotencyKey).toBe(send.mock.calls[1]?.[0].idempotencyKey)
  expect(send.mock.calls[0]?.[0].text).toContain('does not confirm fulfillment')
  expect(send.mock.calls[0]?.[0].text).not.toMatch(/synthetic-bank|synthetic-password|card/)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
})

it('retry/notification batch: verified failure and pending are deduped, while stale negative messages are suppressed after Paid', async () => {
  const f = await processingFixture()
  f.change({ status: 'PENDING' })
  const { validationId: _unused, ...claim } = f.claim
  expect(await f.processor().process(claim)).toBe('retry')
  expect(await f.processor().process(claim)).toBe('retry')
  expect(
    await context.db.connection
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
  await context.db.connection
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
  expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(2)
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
})

it('retry/notification batch: email timeout remains delivery_uncertain without resending or reversing Paid', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' })
  await paymentDelivery({ send }).runBatch()
  context.now = new Date(context.now.getTime() + 60000)
  await paymentDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(
    await context.db.connection
      .collection('notifications')
      .findOne({ eventType: 'payment_success' }),
  ).toMatchObject({ status: 'delivery_uncertain' })
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
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
    await composeNotificationWorker(context.db.connection, config, { adapter: { send }, settings })
  ).runBatch()
  expect(send).not.toHaveBeenCalled()
  await (
    await composeNotificationWorker(context.db.connection, config, {
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
  context.now = new Date(context.now.getTime() + 900001)
  f.change({ status: 'FAILED' })
  await couponModels(context.db.connection).coupons.updateOne(
    { codeNormalized: 'SYNTHETIC' },
    { $set: { status: 'inactive' } },
  )
  const { root, transport } = await initiationApp(true, undefined, false, f.gateway)
  await retryPost(root, f, 'coupon-review')
    .expect(200)
    .expect((result) => expect(result.body.data.state).toBe('allocation_shortfall'))
  expect(transport).not.toHaveBeenCalled()
  expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(1)
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ generation: 2 }),
  ).toBe(0)
})

it('retry/notification batch: notification-intent persistence failure is retryable and cannot partially commit payment or allocation', async () => {
  const f = await processingFixture(true)
  await context.db.connection
    .collection('notifications')
    .dropIndex('notifications_event_key_unique')
  try {
    expect(await f.processor().process(f.claim)).toBe('retry')
    expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(0)
    expect(
      await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
    ).toMatchObject({
      paymentStatus: 'pending',
    })
  } finally {
    await createNotificationService(context.db.connection).initialize()
  }
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await context.db.connection
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
  const applyPaid = createPaymentProcessingService(
    context.db.connection,
    { verify: async () => paid },
    verifiedFundingOrderAccess(context.db.connection),
    createVerifiedAllocationService(
      composeAuditAccess(context.db.connection),
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    composeAuditAccess(context.db.connection),
    composePaymentOutcomeDependencies(context.db.connection),
    () => context.now,
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
  expect(await paymentRecordModels(context.db.connection).attempts.countDocuments()).toBe(1)
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
})

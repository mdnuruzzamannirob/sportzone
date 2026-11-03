import request from 'supertest'
import { expect, it } from 'vitest'
import { createAuditWriter } from '../../../src/modules/audit/audit.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { createCheckoutExpiryService } from '../../../src/modules/checkout/checkout.service.js'
import { inventoryMovementModel } from '../../../src/modules/inventory/inventory.model.js'
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
  composeCheckoutExpiryDependencies,
  composePaymentOutcomeDependencies,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { initiationApp } from '../../helpers/commerce/checkout.js'
import { processingFixture } from '../../helpers/commerce/payments.js'

registerCommerceFixture()

it('receipt batch: concurrent duplicate collections fund once and commit both stock and coupon once across service instances', async () => {
  const f = await processingFixture(true)
  const results = await Promise.all(Array.from({ length: 6 }, () => f.processor().process(f.claim)))
  expect(results).toEqual(Array(6).fill('committed'))
  const records = paymentRecordModels(context.db.connection)
  expect(await records.intake.countDocuments()).toBe(1)
  expect(await records.collections.countDocuments()).toBe(1)
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { physical: 10, reserved: 0, committed: 2 } })
  expect(
    await couponModels(context.db.connection).redemptions.findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({ status: 'redeemed' })
  const movements = await inventoryMovementModel(context.db.connection).countDocuments()
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(movements)
  expect(
    await orderModels(context.db.connection).orders.findById(f.result.id).lean(),
  ).toMatchObject({
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
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('receipt batch: later paid proof supersedes terminal failure without duplicate business effects', async () => {
  const f = await processingFixture()
  f.change({ status: 'FAILED' })
  const { validationId: _unused, ...claim } = f.claim
  expect(await f.processor().process(claim)).toBe('committed')
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_failed' })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  f.change({ status: 'VALIDATED' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
})

it.each(['risk', 'expired'])(
  'receipt batch: risk retains hold while expired paid capacity is recovered safely: %s',
  async (mode) => {
    const f = await processingFixture(true)
    if (mode === 'risk') f.change({ risk_level: '1' })
    else context.now = new Date(context.now.getTime() + 900001)
    expect(await f.processor().process(f.claim)).toBe('committed')
    expect(
      await paymentModel(context.db.connection)
        .findOne({ orderId: f.result.id })
        .sort({ generation: -1 })
        .lean(),
    ).toMatchObject({ paymentStatus: 'paid' })
    expect(
      await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
    ).toMatchObject({
      stock: mode === 'risk' ? { reserved: 2, committed: 0 } : { reserved: 0, committed: 2 },
    })
    expect(
      await couponModels(context.db.connection)
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
      await orderModels(context.db.connection).orders.updateOne(
        { _id: f.result.id, fulfillmentStatus: 'pending' },
        { $set: { fulfillmentStatus: 'cancelled', cancelledAt: context.now } },
      )
    else
      f.change({
        amount: mode === 'under' ? '10.00' : '99.00',
        currency_amount: mode === 'under' ? '10.00' : '99.00',
      })
    expect(await f.processor().process(f.claim)).toBe('committed')
    expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(1)
    expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(
      mode === 'cancelled' ? 1 : 0,
    )
    expect(
      await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
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
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(0)
})

it('receipt batch: conflicting duplicate amount is audited without rewriting the original receipt or funding', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ amount: '99.00', currency_amount: '99.00' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentRecordModels(context.db.connection).intake.findOne().lean()).toMatchObject({
    amountPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.receipt.conflict' }),
  ).toBe(1)
})

it('receipt batch: failure after stock writes rolls back stock, coupon, receipts and payment; retry can commit', async () => {
  const f = await processingFixture(true)
  const real = createVerifiedAllocationService(
    composeAuditAccess(context.db.connection),
    composeAllocationDependencies(context.db.connection),
    () => context.now,
  )
  const failing = createPaymentProcessingService(
    context.db.connection,
    f.verifier,
    verifiedFundingOrderAccess(context.db.connection),
    {
      ensureCommitted: real.ensureCommitted,
      commitLive: async (session, binding) => {
        await real.commitLive(session, binding)
        throw new Error('synthetic-after-allocation')
      },
    },
    composeAuditAccess(context.db.connection),
    composePaymentOutcomeDependencies(context.db.connection),
    () => context.now,
  )
  expect(await failing.process(f.claim)).toBe('retry')
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(0)
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'pending',
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  expect(
    await couponModels(context.db.connection).redemptions.findOne({ orderId: f.result.id }).lean(),
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
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('receipt batch: a second distinct collection becomes correction without duplicate merchandise/stock effects', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ bank_tran_id: 'second-bank', val_id: 'second-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'second-validation' })).toBe(
    'committed',
  )
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(2)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(2)
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    unassignedCollectedPoisha: 0,
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
  expect(
    await orderModels(context.db.connection).orders.findById(f.result.id).lean(),
  ).toMatchObject({
    fulfillmentHold: 'admin_review',
  })
})

it('receipt batch: replayed independent high-risk proof escalates hold without collecting twice', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ risk_level: '1' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    riskStatus: 'review',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await orderModels(context.db.connection).orders.findById(f.result.id).lean(),
  ).toMatchObject({
    fulfillmentHold: 'risk_review',
  })
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
})

it('receipt batch: simultaneous paid/failure processing never reverses money or releases the committed generation', async () => {
  const f = await processingFixture()
  const failed = createPaymentProcessingService(
    context.db.connection,
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
  expect(await Promise.all([f.processor().process(f.claim), failed.process(f.claim)])).toEqual([
    'committed',
    'committed',
  ])
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it.each(['2026-02-31T12:00:00Z', '2026-10-29 12:00:00', '2026-10-29T25:00:00Z'])(
  'receipt batch: invalid or offset-free collection date %s cannot be committed',
  async (tran_date) => {
    const f = await processingFixture()
    f.change({ tran_date })
    expect(await f.processor().process(f.claim)).toBe('retry')
    expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(0)
  },
)

it('receipt batch: real coupon commit failure after stock processing rolls back the entire receipt transaction', async () => {
  const f = await processingFixture(true)
  const coupons = couponModels(context.db.connection).coupons
  const promotion = await coupons.findOne({ codeNormalized: 'SYNTHETIC' }).orFail()
  await coupons.collection.updateOne({ _id: promotion._id }, { $set: { heldCount: 0 } })
  expect(await f.processor().process(f.claim)).toBe('retry')
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(0)
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  await coupons.collection.updateOne({ _id: promotion._id }, { $set: { heldCount: 1 } })
  expect(await f.processor().process(f.claim)).toBe('committed')
})

it('receipt batch: competing expiry and verified late collection preserve money and never double-commit or release paid stock', async () => {
  const f = await processingFixture(true)
  context.now = new Date(context.now.getTime() + 900000)
  const expiry = inTransaction(context.db.connection, (session) =>
    createCheckoutExpiryService(
      composeAuditAccess(context.db.connection),
      composeCheckoutExpiryDependencies(context.db.connection),
      () => context.now,
    ).expire(session, f.result.id, 1),
  )
  const results = await Promise.allSettled([f.processor().process(f.claim), expiry])
  expect(results[0]).toEqual({ status: 'fulfilled', value: 'committed' })
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  const stock = await productModels(context.db.connection)
    .variants.findById(f.selected.row._id)
    .lean()
  expect(stock?.stock.committed).toBe(2)
  expect(stock?.stock.reserved).toBe(0)
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(1)
})

it('receipt batch: two distinct concurrent collections cannot overfund merchandise or double commit capacity', async () => {
  const f = await processingFixture()
  const first = await f.verifier.verify(f.claim)
  f.change({ val_id: 'parallel-validation', bank_tran_id: 'parallel-bank' })
  const second = await f.verifier.verify({ ...f.claim, validationId: 'parallel-validation' })
  const process = (verified: typeof first) =>
    createPaymentProcessingService(
      context.db.connection,
      { verify: async () => verified },
      verifiedFundingOrderAccess(context.db.connection),
      createVerifiedAllocationService(
        composeAuditAccess(context.db.connection),
        composeAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composePaymentOutcomeDependencies(context.db.connection),
      () => context.now,
    ).process(f.claim)
  expect(await Promise.all([process(first), process(second)])).toEqual(['committed', 'committed'])
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    unassignedCollectedPoisha: 0,
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('receipt batch: explicit audit replay preserves the first event and rejects conflicting evidence', async () => {
  const writer = createAuditWriter(context.db.connection, true)
  const event = {
    actorType: 'system',
    action: 'synthetic.receipt.review',
    targetType: 'payment',
    operationKey: 'synthetic-audit-replay',
    occurredAt: context.now,
    afterDigest: 'a'.repeat(64),
  }
  await inTransaction(context.db.connection, (session) => writer(session, event))
  await inTransaction(context.db.connection, (session) =>
    writer(session, { ...event, occurredAt: new Date(context.now.getTime() + 1000) }),
  )
  await expect(
    inTransaction(context.db.connection, (session) =>
      writer(session, { ...event, afterDigest: 'b'.repeat(64) }),
    ),
  ).rejects.toThrow()
  expect(
    await context.db.connection.collection('auditLogs').countDocuments({ action: event.action }),
  ).toBe(1)
})

it('receipt batch: later collection cannot downgrade an existing refund projection to paid', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  // Synthetic projection only: refund execution remains the owning returns/refunds workflow.
  await paymentModel(context.db.connection).updateOne(
    { orderId: f.result.id },
    { $set: { paymentStatus: 'partially_refunded' } },
  )
  f.change({ bank_tran_id: 'post-refund-bank', val_id: 'post-refund-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'post-refund-validation' })).toBe(
    'committed',
  )
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'partially_refunded',
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    unassignedCollectedPoisha: 0,
  })
})

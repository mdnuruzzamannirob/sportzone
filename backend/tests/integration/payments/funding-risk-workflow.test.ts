import request from 'supertest'
import { expect, it } from 'vitest'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { createCheckoutExpiryService } from '../../../src/modules/checkout/checkout.service.js'
import { inventoryReservationModel } from '../../../src/modules/inventory/inventory.model.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { composeAuditAccess, composeCheckoutExpiryDependencies } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { context, coupon, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { initiationApp } from '../../helpers/commerce/checkout.js'
import { lateRiskFixture, processingFixture } from '../../helpers/commerce/payments.js'

registerCommerceFixture()

it('late/risk batch: late funds recover released stock and coupon atomically under a new generation', async () => {
  const f = await processingFixture(true)
  context.now = new Date(context.now.getTime() + 900001)
  await inTransaction(context.db.connection, (session) =>
    createCheckoutExpiryService(
      composeAuditAccess(context.db.connection),
      composeCheckoutExpiryDependencies(context.db.connection),
      () => context.now,
    ).expire(session, f.result.id, 1),
  )
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await inventoryReservationModel(context.db.connection)
      .find({ orderId: f.result.id })
      .sort({ generation: 1 })
      .lean(),
  ).toMatchObject([
    { generation: 1, status: 'released' },
    { generation: 2, status: 'committed' },
  ])
  expect(
    await couponModels(context.db.connection)
      .redemptions.find({ orderId: f.result.id })
      .sort({ generation: 1 })
      .lean(),
  ).toMatchObject([
    { generation: 1, status: 'released' },
    { generation: 2, status: 'redeemed' },
  ])
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
})

it.each(['stock', 'coupon'])(
  'late/risk batch: unavailable %s preserves Paid and rolls back all partial reacquisition',
  async (missing) => {
    const f = await processingFixture(true)
    context.now = new Date(context.now.getTime() + 900001)
    await inTransaction(context.db.connection, (session) =>
      createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, f.result.id, 1),
    )
    if (missing === 'stock')
      await productModels(context.db.connection).variants.updateOne(
        { _id: f.selected.row._id },
        { $set: { 'stock.physical': 0 } },
      )
    else
      await couponModels(context.db.connection).coupons.updateOne(
        { codeNormalized: 'SYNTHETIC' },
        { $set: { status: 'inactive' } },
      )
    expect(await f.processor().process(f.claim)).toBe('committed')
    expect(
      await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
    ).toMatchObject({
      paymentStatus: 'paid',
      merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    })
    expect(
      await inventoryReservationModel(context.db.connection).countDocuments({
        orderId: f.result.id,
        generation: 2,
      }),
    ).toBe(0)
    expect(
      await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
    ).toMatchObject({ stock: { reserved: 0, committed: 0 } })
    expect(
      await orderModels(context.db.connection).orders.findById(f.result.id).lean(),
    ).toMatchObject({
      fulfillmentStatus: 'pending',
      fulfillmentHold: 'allocation_shortfall',
    })
  },
)

it('late/risk batch: cancelled late funds create one correction-only obligation without any reallocation or invented payout', async () => {
  const f = await processingFixture(true)
  context.now = new Date(context.now.getTime() + 900001)
  await inTransaction(context.db.connection, (session) =>
    createCheckoutExpiryService(
      composeAuditAccess(context.db.connection),
      composeCheckoutExpiryDependencies(context.db.connection),
      () => context.now,
    ).expire(session, f.result.id, 1),
  )
  await orderModels(context.db.connection).orders.updateOne(
    { _id: f.result.id, fulfillmentStatus: 'pending' },
    { $set: { fulfillmentStatus: 'cancelled', cancelledAt: context.now } },
  )
  expect(
    await Promise.all([f.processor().process(f.claim), f.processor().process(f.claim)]),
  ).toEqual(['committed', 'committed'])
  expect(
    await paymentModel(context.db.connection).findOne({ orderId: f.result.id }).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
    merchandiseFundedPoisha: 0,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    correctionRefundHeldPoisha: 0,
  })
  const refunds = await context.db.connection.collection('refunds').find({}).toArray()
  expect(refunds).toHaveLength(1)
  expect(refunds[0]).toMatchObject({
    status: 'under_review',
    capacityStatus: 'not_reserved',
    classification: 'payment_correction',
    amountPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(refunds[0]).not.toHaveProperty('method')
  expect(refunds[0]).not.toHaveProperty('policyVersion')
  expect(
    await orderModels(context.db.connection).orders.findById(f.result.id).lean(),
  ).toMatchObject({
    fulfillmentStatus: 'cancelled',
  })
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ generation: 2 }),
  ).toBe(0)
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
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.risk.decision' }),
  ).toBe(1)
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
  // Same already-reviewed provider flag is a replay, not a fresh risk review.
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
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
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
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
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
    riskStatus: 'rejected',
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
})

it('late/risk batch: approving expired risk payment without capacity keeps Paid on allocation hold', async () => {
  const f = await lateRiskFixture()
  context.now = new Date(context.now.getTime() + 900001)
  await productModels(context.db.connection).variants.updateOne(
    { _id: f.selected.row._id },
    { $set: { 'stock.physical': 2 } },
  )
  await couponModels(context.db.connection).coupons.updateOne(
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
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ generation: 2 }),
  ).toBe(0)
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
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await f.post().expect(403)
  await expect(
    f.risk.decide(
      f.admin.credentials.customerToken,
      f.paymentId,
      { decision: 'approve', reason: 'Direct service denial' },
      'direct-denial',
    ),
  ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
    riskStatus: 'review',
  })
})

it.each(['stock', 'coupon'])(
  'late/risk batch: concurrent paid orders competing for last %s retain both collections but commit only one allocation',
  async (capacity) => {
    if (capacity === 'coupon') await coupon({ overallLimit: 1 })
    const first = await processingFixture(capacity === 'coupon')
    context.now = new Date(context.now.getTime() + 900001)
    await inTransaction(context.db.connection, (session) =>
      createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, first.result.id, 1),
    )
    const second = await processingFixture(
      capacity === 'coupon',
      capacity === 'stock' ? first.selected : undefined,
    )
    second.change({ val_id: 'other-validation', bank_tran_id: 'other-bank' })
    context.now = new Date(context.now.getTime() + 900001)
    await inTransaction(context.db.connection, (session) =>
      createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, second.result.id, 1),
    )
    if (capacity === 'stock')
      await productModels(context.db.connection).variants.updateOne(
        { _id: first.selected.row._id },
        { $set: { 'stock.physical': 2 } },
      )
    expect(
      await Promise.all([
        first.processor().process(first.claim),
        second.processor().process({ ...second.claim, validationId: 'other-validation' }),
      ]),
    ).toEqual(['committed', 'committed'])
    expect(
      await paymentModel(context.db.connection).countDocuments({ paymentStatus: 'paid' }),
    ).toBe(2)
    expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(2)
    expect(
      await inventoryReservationModel(context.db.connection).countDocuments({
        status: 'committed',
      }),
    ).toBe(1)
    expect(
      await orderModels(context.db.connection).orders.countDocuments({
        fulfillmentHold: 'allocation_shortfall',
      }),
    ).toBe(1)
    if (capacity === 'coupon')
      expect(
        await couponModels(context.db.connection)
          .coupons.findOne({ codeNormalized: 'SYNTHETIC' })
          .lean(),
      ).toMatchObject({ heldCount: 0, redeemedCount: 1 })
    else
      expect(
        await productModels(context.db.connection).variants.findById(first.selected.row._id).lean(),
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
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.risk.decision' }),
  ).toBe(1)
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
})

it('late/risk batch: a new flag holds already confirmed fulfillment and approval needs retained committed capacity', async () => {
  const f = await lateRiskFixture('0')
  // Synthetic confirmed projection; the owning confirmation workflow is not activated by this test.
  await orderModels(context.db.connection).orders.updateOne(
    { _id: f.result.id, fulfillmentStatus: 'pending' },
    { $set: { fulfillmentStatus: 'confirmed', confirmedAt: context.now, fulfillmentHold: 'none' } },
  )
  f.change({ risk_level: '1' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await orderModels(context.db.connection).orders.findById(f.result.id).lean(),
  ).toMatchObject({
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
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('late/risk batch: independently verified contradictory risk description holds funds without fabricating the numeric risk level', async () => {
  const f = await processingFixture()
  f.change({ risk_level: '0', risk_title: 'Not Safe' })
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
    riskStatus: 'review',
  })
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ riskLevel: 0, riskTitle: 'Not Safe' })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
})

it('late/risk batch: missing audit protection cannot clear risk and the identical key works after safe repair', async () => {
  const f = await lateRiskFixture()
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await f.post().expect(503)
    expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
      riskStatus: 'review',
    })
  } finally {
    await initializeAuditPersistence(context.db.connection)
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
  expect(await paymentModel(context.db.connection).findById(f.paymentId).lean()).toMatchObject({
    riskStatus: 'review',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.receipt.risk_escalation' }),
  ).toBe(2)
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(1)
})

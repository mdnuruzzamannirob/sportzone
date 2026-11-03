import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import { createPaymentReconciliationService } from '../../../src/modules/payments/collections/payment-reconciliation.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { composeAuditAccess, composePaymentReconciliationDependencies } from '../../../src/setup.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { initiationApp } from '../../helpers/commerce/checkout.js'
import { monitorFixture } from '../../helpers/commerce/payments.js'

registerCommerceFixture()

it('monitor/claim batch: payment list/detail enforce current admin scope and strict bounded pagination', async () => {
  const f = await monitorFixture()
  await request(f.monitorApp).get('/api/v1/admin/payments').expect(401)
  await request(f.monitorApp).get(f.path).set('Cookie', f.who.cookie).expect(401)
  const result = await request(f.monitorApp)
    .get('/api/v1/admin/payments?pageSize=1&method=online')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(result.body.data.items).toHaveLength(1)
  expect(result.body.meta).toMatchObject({ page: 1, pageSize: 1, totalItems: 1 })
  await f.get('?pageSize=101').expect(400)
  await f.get('?providerPassword=secret').expect(400)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await f.get().expect(401)
})

it('monitor/claim batch: allowlisted detail preserves collections/corrections and excludes provider secrets and free text', async () => {
  const f = await monitorFixture()
  await f.processor().process(f.claim)
  f.change({ bank_tran_id: 'second-secret-bank', val_id: 'second-secret-validation' })
  await f.processor().process({ ...f.claim, validationId: 'second-secret-validation' })
  const result = await f.get('?pageSize=1').expect(200)
  expect(result.body.data.collections).toHaveLength(1)
  expect(result.body.data.pagination.collections.totalItems).toBe(2)
  expect(result.body.data.corrections).toHaveLength(1)
  expect(result.body.data.payment.paymentStatus).toBe('paid')
  const encoded = JSON.stringify(result.body)
  for (const secret of [
    'providerSessionId',
    'bankTranId',
    'validationId',
    'merchantAccountKey',
    'evidenceDigest',
    'second-secret-bank',
    'customerSnapshot',
    'reason',
  ])
    expect(encoded).not.toContain(secret)
})

it('monitor/claim batch: quarantined/unmatched investigation is admin-only and cannot assign or discard funds', async () => {
  const f = await monitorFixture()
  f.change({ amount: '1.00' })
  await f.processor().process(f.claim)
  const result = await request(f.monitorApp)
    .get('/api/v1/admin/payments?view=quarantined')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(result.body.data.intake).toHaveLength(1)
  expect(result.body.data.items).toEqual([])
  expect(result.body.data.intake[0]).toMatchObject({
    matchingStatus: 'quarantined',
    amountPoisha: 100,
  })
  await request(f.monitorApp)
    .get('/api/v1/admin/payments?view=quarantined&method=online')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
})

it('monitor/claim batch: reconciliation queues once with immutable evidence, CSRF and changed-key-body protection', async () => {
  const f = await monitorFixture(),
    original = await paymentRecordModels(context.db.connection)
      .attempts.findById(f.attempt._id)
      .lean()
  await request(f.monitorApp)
    .post(`${f.path}/reconcile`)
    .set('Cookie', f.admin.cookie)
    .send({ reason: 'review' })
    .expect(403)
  await f.reconcile({ reason: '' }).expect(400)
  await f.reconcile().expect(202)
  await f.reconcile().expect(202)
  await f.reconcile({ reason: 'changed' }).expect(409)
  const after = await paymentRecordModels(context.db.connection)
    .attempts.findById(f.attempt._id)
    .lean()
  expect(after).toEqual(original)
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.request' }),
  ).toBe(1)
  expect((await paymentModel(context.db.connection).findById(f.paymentId))?.paymentStatus).toBe(
    'pending',
  )
})

it('monitor/claim batch: concurrent reconciliation keys replay safely without replaying provider calls', async () => {
  const f = await monitorFixture()
  const results = await Promise.all([f.reconcile(), f.reconcile(), f.reconcile()])
  expect(results.every((r) => r.status === 202)).toBe(true)
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.request' }),
  ).toBe(1)
})

it('monitor/claim batch: manual request makes recent attempts due without falsifying lastCheckedAt', async () => {
  const f = await monitorFixture()
  const checked = new Date(Date.now() - 1000)
  await paymentRecordModels(context.db.connection).attempts.updateOne(
    { _id: f.attempt._id, state: f.attempt.state },
    { $set: { lastCheckedAt: checked } },
  )
  const worker = createPaymentReconciliationService(
    context.db.connection,
    f.processor(),
    f.claim.merchantAccountKey,
    {
      batchSize: 10,
      leaseMs: 10000,
      pollIntervalMs: 60000,
      terminalPollIntervalMs: 60000,
      escalateAfterMs: 60000,
    },
    composeAuditAccess(context.db.connection),
    composePaymentReconciliationDependencies(context.db.connection),
    () => new Date(),
  )
  expect(await worker.due()).not.toContain(f.attempt._id.toHexString())
  await f.reconcile().expect(202)
  expect(await worker.due()).toContain(f.attempt._id.toHexString())
  expect(
    (await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id))
      ?.lastCheckedAt,
  ).toEqual(checked)
  await worker.reconcile(f.attempt._id.toHexString(), async () => {})
  expect(await worker.due()).not.toContain(f.attempt._id.toHexString())
})

it('monitor/claim batch: missing audit protection rolls back manual request and permits recovery with same key', async () => {
  const f = await monitorFixture()
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await f.reconcile().expect(503)
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.request' }),
  ).toBe(0)
  await f.reconcile().expect(202)
})

it('monitor/claim batch: actual root exposes monitoring only with admin activation', async () => {
  const f = await monitorFixture(),
    disabled = await initiationApp(true),
    enabled = await initiationApp(true, undefined, true)
  await request(disabled.root).get(f.path).set('Cookie', f.admin.cookie).expect(404)
  await request(enabled.root).get(f.path).set('Cookie', f.admin.cookie).expect(200)
})

it('monitor/claim batch: attempt/collection identity filters intersect without disclosing unmatched records', async () => {
  const f = await monitorFixture()
  await f.processor().process(f.claim)
  const collection = await paymentRecordModels(context.db.connection).collections.findOne({
    paymentId: f.paymentId,
  })
  if (!collection) throw new Error('Missing collection')
  const list = (query: string) =>
    request(f.monitorApp).get(`/api/v1/admin/payments?${query}`).set('Cookie', f.admin.cookie)
  const found = await list(
    `attemptId=${f.attempt._id.toHexString()}&collectionId=${collection._id.toHexString()}`,
  ).expect(200)
  expect(found.body.data.items[0].id).toBe(f.paymentId)
  expect(
    (await list(`attemptId=${new Types.ObjectId().toHexString()}`).expect(200)).body.data.items,
  ).toEqual([])
  await f.reconcile({ reason: 'review', paymentStatus: 'paid' }).expect(400)
  await request(f.monitorApp)
    .get(`/api/v1/admin/payments/${new Types.ObjectId().toHexString()}`)
    .set('Cookie', f.admin.cookie)
    .expect(404)
})

import { spawnSync } from 'node:child_process'
import { Router } from 'express'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import { createAuditRoutes } from '../../../src/modules/audit/audit.routes.js'
import { createAuditQueryService } from '../../../src/modules/audit/audit.service.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { inventoryMovementModel } from '../../../src/modules/inventory/inventory.model.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  codCollectionOrderAccess,
  guestOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import { createCodCollectionService } from '../../../src/modules/payments/collections/cod-collection.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import type { RefundOutcomeProof } from '../../../src/modules/refunds/payouts/refund-outcome.schema.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { initializeReturnPersistence } from '../../../src/modules/returns/return.persistence.js'
import { complaintModel } from '../../../src/modules/support/support.model.js'
import {
  complaintValidator,
  initializeComplaintPersistence,
  orderComplaintValidator,
  upgradeComplaintPersistence,
} from '../../../src/modules/support/support.persistence.js'
import { createSupportReadRoutes } from '../../../src/modules/support/support.routes.js'
import { startServer } from '../../../src/server.js'
import {
  composeApplication,
  composeAuditAccess,
  composeCodCollectionDependencies,
  type composeOperationsRoutes,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { createLogger } from '../../../src/shared/logger.js'
import { sessionHttpFor } from '../../helpers/auth.js'
import { customerRefundPost, customerRefundRoot } from '../../helpers/commerce/application.js'
import {
  authSecret,
  context,
  customer,
  guest,
  origin,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { exceptionFixture } from '../../helpers/commerce/customers.js'
import { lifecycleFixture } from '../../helpers/commerce/orders.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import { packageCPost, packageDFixture } from '../../helpers/commerce/refunds.js'
import { packageBFixture } from '../../helpers/commerce/returns.js'
import { packageFRoot } from '../../helpers/commerce/support.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('support read local: admin complaint queue filters, paginates and never exposes contact', async () => {
  const f = await exceptionFixture(),
    other = await customer()
  const saved = await f.complaints.submit(f.creds, f.id, {
    issue: 'Synthetic support issue',
    contactEmail: 'sensitive@example.test',
  })
  const app = createApp({
    apiRouter: Router().use(
      createSupportReadRoutes(f.complaints, context.security, sessionHttpFor(context.sessions)),
      createAuditRoutes(
        createAuditQueryService(context.db.connection, f.adminAccess),
        context.security,
        sessionHttpFor(context.sessions),
      ),
    ),
  })
  await request(app).get('/api/v1/admin/complaints').expect(401)
  await request(app).get('/api/v1/admin/complaints').set('Cookie', other.cookie).expect(401)
  const result = await request(app)
    .get('/api/v1/admin/complaints?status=open&pageSize=1')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(result.body.data).toHaveLength(1)
  expect(result.body.data[0]).toMatchObject({
    id: saved.id,
    status: 'open',
    issue: 'Synthetic support issue',
  })
  expect(JSON.stringify(result.body.data)).not.toContain('sensitive@example.test')
  expect(result.body.data[0]).not.toHaveProperty('contact')
  await request(app)
    .get('/api/v1/admin/complaints?status=unknown')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(app).get('/api/v1/admin/complaints').set('Cookie', f.admin.cookie).expect(401)
})

it('support read local: audit history requires active admin, filters targets and hides sensitive metadata', async () => {
  const f = await exceptionFixture(),
    other = await customer()
  const saved = await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic complaint issue' })
  await f.complaints.resolve(
    f.token,
    saved.id,
    { status: 'in_review', resolution: 'private@example.test' },
    'audit-local',
  )
  const app = createApp({
    apiRouter: Router().use(
      createSupportReadRoutes(f.complaints, context.security, sessionHttpFor(context.sessions)),
      createAuditRoutes(
        createAuditQueryService(context.db.connection, f.adminAccess),
        context.security,
        sessionHttpFor(context.sessions),
      ),
    ),
  })
  const path = `/api/v1/admin/audit-logs?targetType=complaint&targetId=${saved.id}`
  await request(app).get(path).expect(401)
  await request(app).get(path).set('Cookie', other.cookie).expect(401)
  const result = await request(app).get(path).set('Cookie', f.admin.cookie).expect(200)
  expect(result.body.data).toHaveLength(2)
  const firstPage = await request(app)
    .get(`${path}&pageSize=1&page=1`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  const secondPage = await request(app)
    .get(`${path}&pageSize=1&page=2`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(firstPage.body.meta).toMatchObject({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 })
  expect([...firstPage.body.data, ...secondPage.body.data]).toEqual(result.body.data)
  expect(result.body.data.map((e: { action: string }) => e.action).sort()).toEqual([
    'complaint.resolve',
    'complaint.submit',
  ])
  expect(result.body.data[0]).toHaveProperty('actor.type')
  expect(result.body.data[0].subject).toEqual({ type: 'complaint', id: saved.id })
  for (const hidden of [
    'private@example.test',
    'operationKey',
    'afterDigest',
    'beforeDigest',
    'reason',
  ])
    expect(JSON.stringify(result.body.data)).not.toContain(hidden)
  await request(app)
    .get(`/api/v1/admin/audit-logs?targetId=${saved.id}`)
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await request(app)
    .get('/api/v1/admin/audit-logs?from=2026-01-02T00%3A00%3A00Z&to=2026-01-01T00%3A00%3A00Z')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(app).get(path).set('Cookie', f.admin.cookie).expect(401)
})

// Package F mutations are exercised through the real HTTP/auth/transaction composition.
it('Package F: anonymous complaint intake requires browser proof and contact, is keyed/replay safe and never links a foreign order', async () => {
  const root = await packageFRoot(),
    who = await guest(),
    buyer = await customer()
  const send = (body: object, key = 'f-anonymous') =>
    request(root)
      .post('/api/v1/complaints')
      .set('Origin', origin)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf)
      .set('Idempotency-Key', key)
      .send(body)
  const input = {
    issue: 'Synthetic support question',
    contactName: 'Synthetic reporter',
    contactEmail: 'reporter@example.test',
  }
  await request(root).post('/api/v1/complaints').send(input).expect(403)
  await send({ issue: 'Missing required anonymous contacts' }).expect(400)
  const first = await send(input).expect(201),
    replay = await send(input).expect(201)
  expect(replay.body.data).toEqual(first.body.data)
  expect(Object.keys(first.body.data).sort()).toEqual(['reference', 'status'])
  expect(await complaintModel(context.db.connection).countDocuments()).toBe(1)
  await send({ ...input, issue: 'Changed' }).expect(409)
  await send({ ...input, orderId: new Types.ObjectId().toHexString() }, 'foreign-order').expect(401)
  await request(root).get('/api/v1/me/complaints').set('Cookie', buyer.cookie).expect(200)
})

it('Package F: privacy review denies unsafe erasure, verifies request proof and revokes sessions while retaining orders and audit', async () => {
  const root = await packageFRoot(),
    buyer = await customer(),
    admin = await customer('admin')
  await context.identities.users.updateOne(
    { _id: buyer.user._id },
    {
      $set: {
        deletionRequest: {
          id: new Types.ObjectId(),
          requestedAt: context.now,
          verifiedAt: context.now,
          status: 'requested',
        },
      },
    },
  )
  const path = `/admin/customers/${buyer.user._id}/deletion-decisions`
  await packageCPost(
    root,
    admin,
    path,
    { decision: 'erase_all', reason: 'Unsafe' },
    'unsafe',
  ).expect(400)
  await packageCPost(
    root,
    admin,
    path,
    { decision: 'approve_deactivation', reason: 'Verified review with required record retention' },
    'review',
  ).expect(200)
  await request(root).get('/api/v1/me/complaints').set('Cookie', buyer.cookie).expect(401)
  const retained = await context.identities.users.findById(buyer.user._id).orFail()
  expect(retained.status).toBe('deactivated')
  expect(retained.deletionRequest?.status).toBe('approved')
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'customer.privacy.decision' }),
  ).toBe(1)
})

it('Package F: canonical financial dashboard reconciles collected cash, pending/completed merchandise refunds and uncollected COD without attempt inflation', async () => {
  const f = await packageDFixture(),
    unpaid = await lifecycleFixture(),
    root = await packageFRoot({}, f.dependencies, f.clock)
  if (!f.manual) throw new Error('Missing manual fixture')
  const order = await orderModels(context.db.connection).orders.findById(f.orderId).orFail(),
    refund = await refundModel(context.db.connection).findById(f.refundId).orFail()
  const get = (path: string) => request(root).get(`/api/v1${path}`).set('Cookie', f.admin.cookie)
  const before = await get('/admin/dashboard').expect(200)
  expect(before.body.data).toMatchObject({
    timezone: 'Asia/Dhaka',
    paidCollectionsPoisha: f.manual.payment.expectedPoisha,
    pendingRefundLiabilityPoisha: refund.amountPoisha,
    outstandingCodPoisha: unpaid.payment.expectedPoisha,
    completedMerchandiseRefundsPoisha: 0,
  })
  expect(before.body.data.counts.totalOrders).toBe(2)
  expect(before.body.data.counts.pendingOrders + before.body.data.counts.deliveredOrders).toBe(2)
  expect(before.body.data.grossMerchandiseValuePoisha).toBe(
    order.pricingSnapshot.regularSubtotalPoisha * 2,
  )
  expect(
    before.body.data.recentOrders.every((row: { paymentStatus?: string }) => !!row.paymentStatus),
  ).toBe(true)
  await f.payout().expect(200)
  await f.setProof('paid')
  await f
    .post('manual-confirmations', {
      transferReference: 'synthetic-transfer',
      evidenceRef: 'synthetic-proof',
      reason: 'Verified payout',
    })
    .expect(200)
  // Period end is exclusive even when a deterministic clock equals the exact completion instant.
  const atBoundary = await get('/admin/dashboard').expect(200)
  expect(atBoundary.body.data.completedMerchandiseRefundsPoisha).toBe(0)
  f.advance(1)
  const after = await get('/admin/dashboard').expect(200)
  expect(after.body.data.pendingRefundLiabilityPoisha).toBe(0)
  expect(after.body.data.completedMerchandiseRefundsPoisha).toBe(refund.amountPoisha)
  expect(after.body.data.netLinkedCashFlowPoisha).toBe(
    f.manual.payment.expectedPoisha - refund.amountPoisha,
  )
  expect(after.body.data.outstandingCodPoisha).toBe(unpaid.payment.expectedPoisha)
  const from = new Date(Date.now() - 86400000).toISOString(),
    to = f.clock().toISOString()
  for (const kind of ['sales', 'collections', 'refunds']) {
    const result = await get(`/admin/reports/${kind}?from=${from}&to=${to}`).expect(200)
    expect(result.body.data.totals.netLinkedCashFlowPoisha).toBe(
      after.body.data.netLinkedCashFlowPoisha,
    )
    expect(JSON.stringify(result.body)).not.toContain('synthetic-transfer')
  }
  await request(root).get('/api/v1/admin/dashboard').expect(401)
  const buyer = await customer()
  await request(root).get('/api/v1/admin/dashboard').set('Cookie', buyer.cookie).expect(401)
  for (const suffix of [
    '?asOf=2026-01-01T00:00:00Z',
    '?from=2020-01-01&to=2026-01-01',
    '?from=2026-02-02&to=2026-02-01',
  ])
    await get(`/admin/dashboard${suffix}`).expect(422)
  await get('/admin/dashboard?status=paid').expect(400)
  await get('/admin/reports/sales').expect(422)
})

it('Package F: complaint owner/admin response workflows preserve recorded contact facts and reject foreign scope, CSRF and changed replay', async () => {
  const f = await packageBFixture(),
    root = await packageFRoot(),
    other = await customer()
  const created = await request(root)
    .post('/api/v1/complaints')
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .set('Idempotency-Key', 'owned-complaint')
    .send({ orderId: f.orderId, issue: 'Synthetic delivery concern' })
    .expect(201)
  const id = created.body.data.reference
  const stored = await complaintModel(context.db.connection)
    .findById(id)
    .select('+contact')
    .orFail()
  expect(stored.contact.emailNormalized).toBe(
    (await orderModels(context.db.connection).orders.findById(f.orderId).orFail()).customerSnapshot
      .emailNormalized,
  )
  const own = await request(root)
    .get('/api/v1/me/complaints')
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  expect(own.body.data[0]).toMatchObject({ id, orderId: f.orderId, status: 'open' })
  expect(own.body.data[0]).not.toHaveProperty('contact')
  await request(root)
    .get(`/api/v1/admin/complaints/${id}`)
    .set('Cookie', f.buyer.cookie)
    .expect(401)
  const detail = await request(root)
    .get(`/api/v1/admin/complaints/${id}`)
    .set('Cookie', f.administrator.cookie)
    .expect(200)
  expect(detail.body.data.contact.email).toBe(stored.contact.emailNormalized)
  expect(detail.body.data.responsePolicy).toEqual({ status: 'under_review' })
  const found = await request(root)
    .get(`/api/v1/admin/complaints?orderId=${f.orderId}&q=Synthetic&pageSize=1`)
    .set('Cookie', f.administrator.cookie)
    .expect(200)
  expect(found.body.meta.totalItems).toBe(1)
  const literal = await request(root)
    .get('/api/v1/admin/complaints?q=.*')
    .set('Cookie', f.administrator.cookie)
    .expect(200)
  expect(literal.body.meta.totalItems).toBe(0)

  await request(root)
    .get(`/api/v1/orders/${f.orderId}/complaints`)
    .set('Cookie', other.cookie)
    .expect(404)
  const path = `/admin/complaints/${id}/resolve`,
    input = {
      status: 'resolved',
      resolution: 'Synthetic issue addressed',
      contactOutcome: 'Synthetic phone response recorded',
    }
  await request(root)
    .post(`/api/v1${path}`)
    .set('Cookie', f.administrator.cookie)
    .send(input)
    .expect(403)
  await packageCPost(root, f.administrator, path, input, 'response').expect(200)
  await packageCPost(root, f.administrator, path, input, 'response').expect(200)
  await packageCPost(
    root,
    f.administrator,
    path,
    { ...input, resolution: 'Changed' },
    'response',
  ).expect(409)
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'complaint.response.recorded' }),
  ).toBe(1)
  const resolved = await request(root)
    .get('/api/v1/me/complaints')
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  expect(resolved.body.data[0]).toHaveProperty('respondedAt')
  expect(resolved.body.data[0]).not.toHaveProperty('deadlineAt')
})

it('Package F: keyed delivery exception HTTP retains shipped retries and atomically reserves paid final-closure refunds with one recovered stock receipt', async () => {
  const f = await exceptionFixture(),
    payment = await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  const cash = createCodCollectionService(
    context.db.connection,
    f.adminAccess,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (input) => ({
      paymentId: input.paymentId,
      amountPoisha: input.amountPoisha,
      collectionReference: input.collectionReference,
      evidenceRef: input.evidenceRef,
      collectedAt: context.now,
      digest: 'a'.repeat(64),
    }),
    () => context.now,
  )
  await cash.collect(
    f.token,
    payment._id.toHexString(),
    {
      amountPoisha: payment.expectedPoisha,
      collectionReference: 'f-cash',
      evidenceRef: 'synthetic:cash',
      reason: 'Synthetic verified cash',
    },
    'f-cash',
  )
  let verification: RefundOutcomeProof | undefined
  let ticks = Date.now() + 10000
  const clock = () => new Date(ticks)
  const draftRoot = await packageFRoot({ verifyDisposition: async () => 'a'.repeat(64) })
  const created = await packageCPost(
    draftRoot,
    f.admin,
    `/admin/orders/${f.id}/delivery-exceptions`,
    { type: 'final_non_delivery', reason: 'Synthetic final failure' },
    'f-exception',
  ).expect(201)
  const exceptionId = created.body.data.id,
    input = { resolution: 'Verified custody closure', disposition: f.disposition }
  await packageCPost(
    draftRoot,
    f.admin,
    `/admin/delivery-exceptions/${exceptionId}/resolve`,
    input,
    'f-resolve',
  ).expect(503)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('shipped')
  const options: Parameters<typeof composeOperationsRoutes>[5] = {
    verifyEvidence: async () => verification,
    options: {
      policyVersion: 'synthetic-f-refunds',
      authorizations: [
        {
          orderId: f.id,
          basis: 'delivery_exception',
          basisRefId: exceptionId,
          approval: {
            policyVersion: 'synthetic-f-refunds',
            method: 'manual_bank',
            consentRequired: true,
            consentEvidenceRef: 'synthetic:f-consent',
            deliveryApproved: true,
          },
        },
      ],
    },
  }
  const root = await packageFRoot({ verifyDisposition: async () => 'a'.repeat(64) }, options, clock)
  const results = await Promise.all(
    ['a', 'b'].map((key) =>
      packageCPost(root, f.admin, `/admin/delivery-exceptions/${exceptionId}/resolve`, input, key),
    ),
  )
  expect(results.filter((row) => row.status === 200)).toHaveLength(1)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('cancelled')
  const refunds = await refundModel(context.db.connection).find({ orderId: f.id })
  expect(refunds).toHaveLength(1)
  expect(refunds[0]).toMatchObject({
    basis: 'delivery_exception',
    status: 'approved',
    capacityStatus: 'reserved',
    amountPoisha: payment.expectedPoisha,
  })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(0)
  expect(
    (await paymentModel(context.db.connection).findById(payment._id).orFail()).paymentStatus,
  ).toBe('paid')
  const obligation = refunds[0]
  if (!obligation) throw new Error('Missing closure obligation')
  const customerRoot = customerRefundRoot({ id: f.id, claimId: exceptionId })
  await customerRefundPost(customerRoot, f.who, f.id, {
    basis: 'delivery_exception',
    basisRefId: exceptionId,
    reason: 'Reference the qualified closure refund',
  }).expect(200)
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(
    refunds.length,
  )

  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${obligation._id}/payout-attempts`,
    { method: 'manual_bank', reason: 'Qualified final closure payout' },
    'closure-payout',
  ).expect(200)
  const attempt = await refundAttemptModel(context.db.connection)
    .findOne({ refundId: obligation._id })
    .orFail()
  ticks += 1000
  verification = {
    provider: 'manual',
    method: 'manual_bank',
    refundId: obligation._id.toHexString(),
    orderId: f.id,
    sourceCollectionId: obligation.sourceCollectionId.toHexString(),
    attemptId: attempt._id.toHexString(),
    amountPoisha: obligation.amountPoisha,
    outcome: 'paid',
    checkedAt: clock(),
    paidAt: clock(),
    evidenceDigest: 'b'.repeat(64),
    transferReference: 'synthetic-f-transfer',
    evidenceRef: 'synthetic:f-payout',
    destinationMasked: 'bank ****1234',
    consentEvidenceRef: 'synthetic:f-consent',
    consentDigest: 'c'.repeat(64),
    consentAt: new Date(ticks - 500),
  }
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${obligation._id}/manual-confirmations`,
    {
      transferReference: 'synthetic-f-transfer',
      evidenceRef: 'synthetic:f-payout',
      reason: 'Verified original closure transfer',
    },
    'closure-confirm',
  ).expect(200)
  expect((await refundModel(context.db.connection).findById(obligation._id).orFail()).status).toBe(
    'completed',
  )
  expect(
    (await paymentModel(context.db.connection).findById(payment._id).orFail()).paymentStatus,
  ).toBe('refunded')
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('cancelled')
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(1)
})

it('Package F: operational queues and customer histories are current-admin-only, bounded and private; notification retry only admits outbox work', async () => {
  const f = await packageBFixture(),
    root = await packageFRoot(),
    created = await f.submit().expect(201)
  for (const kind of ['orders', 'claims', 'refunds']) {
    const path = `/api/v1/admin/customers/${f.buyer.user._id}/${kind}?pageSize=1`
    await request(root).get(path).set('Cookie', f.buyer.cookie).expect(401)
    const result = await request(root).get(path).set('Cookie', f.administrator.cookie).expect(200)
    expect(result.body.meta.pageSize).toBe(1)
    if (kind === 'claims') expect(result.body.data[0].id).toBe(created.body.data.id)
    expect(JSON.stringify(result.body)).not.toContain('emailNormalized')
  }
  for (const kind of ['stock', 'payments', 'refunds', 'reconciliation']) {
    const path = `/api/v1/admin/operational-exceptions?kind=${kind}&pageSize=1`
    await request(root).get(path).expect(401)
    const result = await request(root).get(path).set('Cookie', f.administrator.cookie).expect(200)
    expect(result.body.meta.pageSize).toBe(1)
  }
  const notification = await context.db.connection
    .collection('notifications')
    .findOne({ eventType: 'order_received', orderId: new Types.ObjectId(f.orderId) })
  if (!notification) throw new Error('Missing outbox')
  await context.db.connection
    .collection('notifications')
    .updateOne(
      { _id: notification._id },
      { $set: { status: 'failed', lastErrorCode: 'PROVIDER_RATE_LIMIT' } },
    )
  const path = `/admin/notifications/${notification._id}/retry`
  await packageCPost(
    root,
    f.administrator,
    path,
    { reason: 'Reviewed email retry' },
    'retry',
  ).expect(200)
  await packageCPost(
    root,
    f.administrator,
    path,
    { reason: 'Reviewed email retry' },
    'retry',
  ).expect(200)
  expect(
    (await context.db.connection.collection('notifications').findOne({ _id: notification._id }))
      ?.status,
  ).toBe('queued')
  const result = await request(root)
    .get('/api/v1/admin/notifications?pageSize=1')
    .set('Cookie', f.administrator.cookie)
    .expect(200)
  for (const field of ['recipient', 'payload', 'providerMessageId', 'eventKey'])
    expect(result.body.data[0]).not.toHaveProperty(field)
  await context.db.connection
    .collection('notifications')
    .updateOne(
      { _id: notification._id },
      { $set: { status: 'delivery_uncertain', lastErrorCode: 'PROVIDER_UNCERTAIN' } },
    )
  await packageCPost(
    root,
    f.administrator,
    path,
    { reason: 'Unknown outcome must remain uncertain' },
    'unknown',
  ).expect(422)
  await context.db.connection
    .collection('notifications')
    .updateOne({ _id: notification._id }, { $set: { status: 'sent', sentAt: new Date() } })
  await packageCPost(
    root,
    f.administrator,
    path,
    { reason: 'Do not resend sent mail' },
    'sent',
  ).expect(422)
})

it('Package F: complaint quota and failed audit cannot bypass admission or leave partial intake', async () => {
  const root = await packageFRoot(),
    who = await guest(),
    input = {
      issue: 'Synthetic general support',
      contactName: 'Reporter',
      contactEmail: 'reporter@example.test',
    }
  const send = (key: string) =>
    request(root)
      .post('/api/v1/complaints')
      .set('Origin', origin)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf)
      .set('Idempotency-Key', key)
      .send(input)
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await send('rollback').expect(503)
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect(await complaintModel(context.db.connection).countDocuments()).toBe(0)
  for (let i = 0; i < 9; i++) await send(`quota-${i}`).expect(201)
  const limited = await send('blocked').expect(429)
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
  expect(await complaintModel(context.db.connection).countDocuments()).toBe(9)
})

it('Package F: complaint migration and compiled additive index rollout preserve records and refuse unknown drift/deployed execution', async () => {
  const f = await packageBFixture(),
    root = await packageFRoot(),
    buyer = f.buyer
  await request(root)
    .post('/api/v1/complaints')
    .set('Origin', origin)
    .set('Cookie', buyer.cookie)
    .set('X-CSRF-Token', buyer.csrf)
    .set('Idempotency-Key', 'retained')
    .send({ orderId: f.orderId, issue: 'Retain synthetic order complaint' })
    .expect(201)
  const saved = await context.db.connection.collection('complaints').findOne({})
  if (!saved) throw new Error('Missing retained complaint')
  await context.db.connection.db?.command({
    collMod: 'complaints',
    validator: orderComplaintValidator,
  })
  try {
    const env = {
      ...identityEnvironment(),
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
    }
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(
        process.execPath,
        ['scripts/bootstrap-operations.mjs', '--complaints'],
        { env, encoding: 'utf8', timeout: 15000 },
      )
      expect(result.status, result.stderr).toBe(0)
    }
    expect(
      await context.db.connection.collection('complaints').findOne({ _id: saved._id }),
    ).toEqual(saved)
    const deployed = spawnSync(
      process.execPath,
      ['scripts/bootstrap-operations.mjs', '--complaints'],
      {
        env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
        encoding: 'utf8',
        timeout: 10000,
      },
    )
    expect(deployed.status).not.toBe(0)
    await context.db.connection.db?.command({
      collMod: 'complaints',
      validator: { forbiddenFixture: { $exists: true } },
    })
    try {
      await expect(upgradeComplaintPersistence(context.db.connection)).rejects.toThrow(
        'Unknown complaint validator',
      )
    } finally {
      await context.db.connection.db?.command({
        collMod: 'complaints',
        validator: orderComplaintValidator,
      })
      await upgradeComplaintPersistence(context.db.connection)
    }
  } finally {
    await context.db.connection.db?.command({
      collMod: 'complaints',
      validator: complaintValidator,
    })
    await initializeComplaintPersistence(context.db.connection)
  }
})

it('Package F: actual server startup admits configured operations and defaults off without external provider calls', async () => {
  await packageFRoot()
  await initializeReturnPersistence(context.db.connection)
  const admin = await customer('admin'),
    buyer = await customer(),
    previous = process.env
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    const env = {
      ...identityEnvironment(),
      SESSION_SECRET: authSecret,
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
    }
    process.env = { ...env }
    let config = { ...loadEnvironment(env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server)
      .get('/api/v1/admin/dashboard')
      .set('Cookie', admin.cookie)
      .expect(404)
    await runtime.close()
    process.env = { ...env, BACKEND_OPERATIONS_ENABLED: 'true' }
    config = { ...loadEnvironment(process.env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server)
      .get('/api/v1/admin/dashboard')
      .set('Cookie', admin.cookie)
      .expect(200)
    await request(runtime.server)
      .get('/api/v1/me/complaints')
      .set('Cookie', buyer.cookie)
      .expect(200)
    await request(runtime.server)
      .get('/api/v1/admin/operational-exceptions?kind=refunds')
      .set('Cookie', admin.cookie)
      .expect(200)
  } finally {
    await runtime?.close()
    process.env = previous
  }
})

it('Package F: distinct duplicate collections and completed correction payouts stay separate from merchandise sales and receipts are never attempt counts', async () => {
  const f = await packageDFixture(true),
    root = await packageFRoot({}, f.dependencies, f.clock)
  const read = () => request(root).get('/api/v1/admin/dashboard').set('Cookie', f.admin.cookie)
  const before = await read().expect(200),
    row = await refundModel(context.db.connection).findById(f.refundId).orFail()
  const collections = await paymentRecordModels(context.db.connection).collections.find({
    orderId: f.orderId,
  })
  expect(collections).toHaveLength(2)
  expect(before.body.data.paidCollectionsPoisha).toBe(
    collections.reduce((sum, r) => sum + r.amountPoisha, 0),
  )
  expect(before.body.data.counts.totalOrders).toBe(1)
  await f.payout().expect(200)
  await f.setProof('paid')
  await f.post('reconcile', { reason: 'Qualified correction' }, 'f-correction').expect(200)
  f.advance(1)
  const after = await read().expect(200)
  expect(after.body.data.completedCorrectionRefundsPoisha).toBe(row.amountPoisha)
  expect(after.body.data.completedMerchandiseRefundsPoisha).toBe(0)
  expect(after.body.data.netAcceptedOrderSalesPoisha).toBe(
    before.body.data.netAcceptedOrderSalesPoisha,
  )
  const from = new Date(Date.now() - 86400000).toISOString(),
    to = f.clock().toISOString()
  const report = await request(root)
    .get(
      `/api/v1/admin/reports/collections?from=${from}&to=${to}&classification=payment_correction`,
    )
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(report.body.data.classifiedCollectedPoisha).toBe(row.amountPoisha)
  expect(report.body.data.receiptCount).toBe(2)
})

it('Package F: privacy rejection retains access, missing proof denies approval, and incomplete root admission fails closed', async () => {
  const root = await packageFRoot(),
    buyer = await customer(),
    admin = await customer('admin'),
    path = `/admin/customers/${buyer.user._id}/deletion-decisions`
  await packageCPost(
    root,
    admin,
    path,
    { decision: 'approve_deactivation', reason: 'No verified request' },
    'missing',
  ).expect(422)
  await context.identities.users.updateOne(
    { _id: buyer.user._id },
    {
      $set: {
        deletionRequest: {
          id: new Types.ObjectId(),
          requestedAt: context.now,
          verifiedAt: context.now,
          status: 'requested',
        },
      },
    },
  )
  await packageCPost(
    root,
    admin,
    path,
    { decision: 'under_review', reason: 'Review retention' },
    'review',
  ).expect(200)
  await request(root).get('/api/v1/me/complaints').set('Cookie', buyer.cookie).expect(200)
  await packageCPost(
    root,
    admin,
    path,
    { decision: 'reject', reason: 'Reviewed request declined' },
    'reject',
  ).expect(200)
  await request(root).get('/api/v1/me/complaints').set('Cookie', buyer.cookie).expect(200)
  const config = {
    ...loadEnvironment(identityEnvironment()),
    CUSTOMER_AUTH_ENABLED: false,
    ADMIN_AUTH_ENABLED: false,
  }
  await expect(
    composeApplication(
      context.db.connection,
      config,
      { isReady: async () => true },
      createLogger(config, () => {}),
      undefined,
      [],
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      {},
    ),
  ).rejects.toThrow()
})

it('Package F: completed refund reporting requires a matching confirmed attempt and bounded event-date indexes remain usable', async () => {
  const f = await packageDFixture(),
    root = await packageFRoot({}, f.dependencies, f.clock)
  await f.payout().expect(200)
  await f.setProof('paid')
  await f
    .post(
      'manual-confirmations',
      {
        transferReference: 'synthetic-transfer',
        evidenceRef: 'synthetic-proof',
        reason: 'Verified proof',
      },
      'report-proof',
    )
    .expect(200)
  f.advance(1)
  const read = () => request(root).get('/api/v1/admin/dashboard').set('Cookie', f.admin.cookie)
  await read().expect(200)
  const attempt = await context.db.connection
    .collection('refundAttempts')
    .findOne({ refundId: new Types.ObjectId(f.refundId) })
  if (!attempt) throw new Error('Missing completed proof fixture')
  await context.db.connection.collection('refundAttempts').deleteOne({ _id: attempt._id })
  try {
    await read().expect(503)
  } finally {
    await context.db.connection.collection('refundAttempts').insertOne(attempt)
  }
  const cases = [
    ['orders', 'placedAt', 'order_report_placement'],
    ['paymentCollections', 'collectedAt', 'collection_report_period'],
    ['refunds', 'completedAt', 'refund_report_completion'],
  ] as const
  for (const [collection, field, index] of cases) {
    const filter = { [field]: { $gte: new Date(Date.now() - 86400000), $lt: f.clock() } }
    const plan = await context.db.connection
      .collection(collection)
      .find(filter)
      .hint(index)
      .limit(5001)
      .maxTimeMS(5000)
      .explain('queryPlanner')
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain(index)
  }
})

it('Package F: guest complaint scope and CSRF remain exact and revoked or malformed customer proof never downgrades to anonymous', async () => {
  const f = await lifecycleFixture(),
    other = await lifecycleFixture()
  const guests = createGuestSessionService(
    context.db.connection,
    context.identities,
    {
      secret: authSecret,
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'http://localhost:4000',
    },
    600,
    guestOrderAccess(context.db.connection).verify,
    () => context.now,
  )
  const proof = await inTransaction(context.db.connection, (session) =>
      guests.issueAfterProof(session, f.id),
    ),
    root = await packageFRoot({}, undefined, undefined, guests),
    cookie = `sz_guest_order_sid=${proof.token}`
  const send = (id = f.id, csrf = proof.csrfToken, sessionCookie = cookie) =>
    request(root)
      .post('/api/v1/complaints')
      .set('Origin', origin)
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'guest-support')
      .send({ orderId: id, issue: 'Synthetic scoped guest concern' })
  await send(f.id, 'invalid').expect(403)
  await send().expect(201)
  const global = await request(root)
    .post('/api/v1/complaints')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', proof.csrfToken)
    .set('Idempotency-Key', 'guest-global')
    .send({ issue: 'Synthetic guest general concern without an order link' })
    .expect(201)
  const globalRow = await complaintModel(context.db.connection)
    .findById(global.body.data.reference)
    .select('+contact')
    .orFail()
  expect(globalRow.orderId).toBeUndefined()
  expect(globalRow.contact.emailNormalized).toBe(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).customerSnapshot
      .emailNormalized,
  )
  const own = await request(root)
    .get(`/api/v1/orders/${f.id}/complaints`)
    .set('Cookie', cookie)
    .expect(200)
  expect(own.body.data).toHaveLength(1)
  expect(own.body.data[0]).not.toHaveProperty('contact')
  await send(other.id).expect(401)
  await send(f.id, proof.csrfToken, `${cookie}; sz_customer_sid=invalid`).expect(403)
  await request(root).get('/api/v1/me/complaints').set('Cookie', cookie).expect(401)
  await guests.logout(proof.token)
  await send().expect(401)
})

it('Package F: operational queues return matching canonical IDs and safe state projections, then deny a suspended admin', async () => {
  const pending = await processingFixture(),
    refund = await packageDFixture(),
    root = await packageFRoot({}, refund.dependencies)
  // These isolated source fixtures exercise read filters, not independent provider qualification.
  await paymentModel(context.db.connection).updateOne(
    { orderId: pending.result.id },
    { $set: { riskStatus: 'review' } },
  )
  await context.db.connection
    .collection('orders')
    .updateOne(
      { _id: new Types.ObjectId(pending.result.id) },
      { $set: { fulfillmentHold: 'allocation_shortfall' } },
    )
  await context.db.connection
    .collection('paymentAttempts')
    .updateOne({ _id: pending.attempt._id }, { $set: { state: 'uncertain' } })
  await refund.payout().expect(200)
  const expected = {
    stock: pending.result.id,
    payments: pending.attempt.paymentId.toHexString(),
    reconciliation: pending.attempt._id.toHexString(),
    refunds: refund.refundId,
  }
  for (const kind of ['stock', 'payments', 'reconciliation', 'refunds'] as const) {
    const response = await request(root)
      .get(`/api/v1/admin/operational-exceptions?kind=${kind}`)
      .set('Cookie', refund.admin.cookie)
      .expect(200)
    expect(response.body.data.some((row: { id: string }) => row.id === expected[kind])).toBe(true)
    expect(response.body.meta.totalItems).toBeGreaterThan(0)
    for (const row of response.body.data)
      for (const field of [
        'bankTranId',
        'refundTransId',
        'providerCollectionRef',
        'recipient',
        'evidenceRef',
        'emailNormalized',
      ])
        expect(row).not.toHaveProperty(field)
  }
  await request(root)
    .get('/api/v1/admin/operational-exceptions?kind=invalid')
    .set('Cookie', refund.admin.cookie)
    .expect(400)
  await request(root)
    .get('/api/v1/admin/operational-exceptions?kind=stock&pageSize=101')
    .set('Cookie', refund.admin.cookie)
    .expect(400)
  await context.identities.users.updateOne(
    { _id: refund.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(root)
    .get('/api/v1/admin/operational-exceptions?kind=refunds')
    .set('Cookie', refund.admin.cookie)
    .expect(401)
})

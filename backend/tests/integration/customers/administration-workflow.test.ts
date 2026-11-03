import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import {
  auditOperationReader,
  createAuditWriter,
} from '../../../src/modules/audit/audit.service.js'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { createAccountManagementService } from '../../../src/modules/auth/account-management.service.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import {
  createSessionHttp,
  readSessionCookie,
} from '../../../src/modules/auth/sessions/session.http.js'
import { createCustomerAdminRoutes } from '../../../src/modules/customers/customer.routes.js'
import { initializeMediaPersistence } from '../../../src/modules/media/media.persistence.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  claimQuantityAccess,
  claimReviewQuantityAccess,
  guestOrderAccess,
  reviewPurchaseEligibilityAccess,
} from '../../../src/modules/orders/order.service.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { initializeReturnPersistence } from '../../../src/modules/returns/return.persistence.js'
import {
  createReturnLifecycleService,
  createReturnService,
} from '../../../src/modules/returns/return.service.js'
import { reviewModel } from '../../../src/modules/reviews/review.model.js'
import { initializeReviewPersistence } from '../../../src/modules/reviews/review.persistence.js'
import { composeApplication, composeAuditAccess } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { createLogger } from '../../../src/shared/logger.js'
import {
  authSecret,
  context,
  customer,
  origin,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { packageERoot } from '../../helpers/commerce/customers.js'
import { packageDFixture } from '../../helpers/commerce/refunds.js'
import { packageBFixture } from '../../helpers/commerce/returns.js'
import { deliveredReviewFixture } from '../../helpers/commerce/reviews.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('customer admin local: detail requires active admin and returns masked customer-only fields', async () => {
  const who = await customer(),
    admin = await customer('admin'),
    other = await customer()
  const service = createAccountManagementService(
    context.db.connection,
    context.identities,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    createAuditWriter(context.db.connection),
    auditOperationReader(context.db.connection),
  )
  const result = await service.detail(admin.credentials.customerToken, who.user._id.toHexString())
  expect(result).toMatchObject({
    id: who.user._id.toHexString(),
    status: 'active',
    emailVerified: false,
  })
  expect(result.emailMasked).not.toBe(who.user.emailNormalized)
  expect(JSON.stringify(result)).not.toContain(who.user.emailNormalized)
  for (const field of ['passwordHash', 'addresses', 'deletionRequest', 'emailNormalized'])
    expect(result).not.toHaveProperty(field)
  await expect(
    service.detail(other.credentials.customerToken, who.user._id.toHexString()),
  ).rejects.toThrow()
  await expect(
    service.detail(admin.credentials.customerToken, admin.user._id.toHexString()),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(
    service.detail(admin.credentials.customerToken, new Types.ObjectId().toHexString()),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await context.identities.users.updateOne(
    { _id: admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await expect(
    service.detail(admin.credentials.customerToken, who.user._id.toHexString()),
  ).rejects.toThrow()
})

it('blocked customer audit: HTTP search/detail enforce admin and status decisions require CSRF, key and strict input', async () => {
  const who = await customer(),
    administrator = await customer('admin')
  const administration = createAccountManagementService(
    context.db.connection,
    context.identities,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    createAuditWriter(context.db.connection),
    auditOperationReader(context.db.connection),
  )
  const root = createApp({
    apiRouter: createCustomerAdminRoutes(administration, {
      cors: context.security.cors('admin'),
      requireBrowser: context.security.require('admin', 'admin'),
      requireSession: createSessionHttp(context.sessions).require('admin'),
      readToken: (header) => readSessionCookie(header, 'admin'),
    }),
  })
  const path = `/api/v1/admin/customers/${who.user._id}`
  await request(root).get(path).set('Cookie', who.cookie).expect(401)
  const detail = await request(root).get(path).set('Cookie', administrator.cookie).expect(200)
  expect(JSON.stringify(detail.body.data)).not.toContain(who.user.emailNormalized)
  const searched = await request(root)
    .get('/api/v1/admin/customers')
    .query({ q: who.user.emailNormalized, pageSize: '1' })
    .set('Cookie', administrator.cookie)
    .expect(200)
  expect(searched.body.data.map((row: { id: string }) => row.id)).toEqual([
    who.user._id.toHexString(),
  ])
  expect(searched.body.meta).toMatchObject({ totalItems: 1, pageSize: 1 })
  expect(
    (
      await request(root)
        .get('/api/v1/admin/customers?q=.*')
        .set('Cookie', administrator.cookie)
        .expect(200)
    ).body.data,
  ).toEqual([])
  await request(root)
    .post(`${path}/status-decisions`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', administrator.cookie)
    .send({ to: 'suspended', reason: 'Synthetic review' })
    .expect(403)
  await request(root)
    .post(`${path}/status-decisions`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', administrator.cookie)
    .set('X-CSRF-Token', administrator.csrf)
    .send({ to: 'suspended', reason: 'Synthetic review' })
    .expect(400)
  await request(root)
    .post(`${path}/status-decisions`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', administrator.cookie)
    .set('X-CSRF-Token', administrator.csrf)
    .set('Idempotency-Key', 'bad-input')
    .send({ to: 'suspended', reason: 'Synthetic review', role: 'admin' })
    .expect(400)
  expect((await context.identities.users.findById(who.user._id))?.status).toBe('active')
})

it('blocked customer audit: suspension revokes every customer session and old retries cannot undo reactivation', async () => {
  const who = await customer(),
    administrator = await customer('admin')
  const second = await context.sessions.issue('customer', who.user._id)
  const administration = createAccountManagementService(
    context.db.connection,
    context.identities,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    createAuditWriter(context.db.connection),
    auditOperationReader(context.db.connection),
  )
  const root = createApp({
    apiRouter: createCustomerAdminRoutes(administration, {
      cors: context.security.cors('admin'),
      requireBrowser: context.security.require('admin', 'admin'),
      requireSession: createSessionHttp(context.sessions).require('admin'),
      readToken: (header) => readSessionCookie(header, 'admin'),
    }),
  })
  const path = `/api/v1/admin/customers/${who.user._id}/status-decisions`
  const post = (to: string, key: string) =>
    request(root)
      .post(path)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', administrator.cookie)
      .set('X-CSRF-Token', administrator.csrf)
      .set('Idempotency-Key', key)
      .send({ to, reason: 'Synthetic authorized status review' })
  await post('suspended', 'suspend').expect(200)
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ targetId: who.user._id, action: 'customer.status.active.suspended' }),
  ).toBe(1)
  await expect(
    context.sessions.authenticate('customer', who.credentials.customerToken),
  ).rejects.toThrow()
  await expect(context.sessions.authenticate('customer', second.token)).rejects.toThrow()
  await post('active', 'reactivate').expect(200)
  expect((await post('suspended', 'suspend').expect(200)).body.data.status).toBe('active')
  await expect(context.sessions.authenticate('customer', second.token)).rejects.toThrow()
  await post('active', 'suspend').expect(409)
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ targetId: who.user._id, action: 'customer.status.decision' }),
  ).toBe(2)
  await context.identities.users.updateOne(
    { _id: who.user._id },
    { $set: { status: 'deletion_pending' } },
  )
  await post('active', 'unsafe-reactivation').expect(409)
})

it('blocked customer audit: concurrent duplicate decisions have one effect and transaction failure rolls back sessions and audit', async () => {
  const who = await customer(),
    administrator = await customer('admin')
  const admins = createAdminAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
  const administration = createAccountManagementService(
    context.db.connection,
    context.identities,
    admins,
    createAuditWriter(context.db.connection),
    auditOperationReader(context.db.connection),
  )
  const id = who.user._id.toHexString(),
    command = { to: 'suspended', reason: 'Synthetic concurrent review' }
  await Promise.all([
    administration.decideStatus(administrator.credentials.customerToken, id, command, 'concurrent'),
    administration.decideStatus(administrator.credentials.customerToken, id, command, 'concurrent'),
  ])
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ targetId: who.user._id, action: 'customer.status.decision' }),
  ).toBe(1)
  const other = await customer()
  const failing: Parameters<typeof createAccountManagementService>[2] = {
    owned: (token, work, mutating) =>
      admins.owned(
        token,
        async (actor, transaction) => {
          await work(actor, transaction)
          throw new Error('Synthetic failure after actual status, session and audit writes')
        },
        mutating,
      ),
  }
  await expect(
    createAccountManagementService(
      context.db.connection,
      context.identities,
      failing,
      createAuditWriter(context.db.connection),
      auditOperationReader(context.db.connection),
    ).decideStatus(
      administrator.credentials.customerToken,
      other.user._id.toHexString(),
      command,
      'rollback',
    ),
  ).rejects.toThrow()
  expect((await context.identities.users.findById(other.user._id))?.status).toBe('active')
  await expect(
    context.sessions.authenticate('customer', other.credentials.customerToken),
  ).resolves.toBeDefined()
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ targetId: other.user._id, action: 'customer.status.decision' }),
  ).toBe(0)
})

it('Package E: cross-order customer claim history filters before pagination and rejects guest, stale or foreign identity', async () => {
  const f = await packageBFixture(),
    second = await deliveredReviewFixture(true, f.buyer),
    foreign = await packageBFixture()
  const firstClaim = await f.submit(f.body('shortage', 1), 'e-first').expect(201)
  const secondClaim = await request(f.root)
    .post(`/api/v1/orders/${second.orderId}/claims`)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .set('Idempotency-Key', 'e-second')
    .send({
      claimType: 'physical_return',
      items: [
        {
          orderItemId: second.selection.qualifyingOrderItemId,
          quantity: 1,
          reason: 'Synthetic second order',
        },
      ],
    })
    .expect(201)
  await foreign.submit().expect(201)
  const path = '/api/v1/me/claims'
  const list = await request(f.root)
    .get(`${path}?pageSize=1`)
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  expect(list.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 })
  expect(list.body.data).toHaveLength(1)
  const page2 = await request(f.root)
    .get(`${path}?pageSize=1&page=2`)
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  expect(new Set([list.body.data[0].id, page2.body.data[0].id])).toEqual(
    new Set([firstClaim.body.data.id, secondClaim.body.data.id]),
  )
  const filtered = await request(f.root)
    .get(`${path}?claimType=shortage&pageSize=1`)
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  expect(filtered.body.meta.totalItems).toBe(1)
  expect(filtered.body.data[0].id).toBe(firstClaim.body.data.id)
  expect(list.headers['cache-control']).toContain('no-store')
  for (const suffix of ['?userId=anything', '?status=bogus', '?page=0', '?pageSize=101'])
    await request(f.root)
      .get(path + suffix)
      .set('Cookie', f.buyer.cookie)
      .expect(400)
  await request(f.root).get(path).expect(401)
  await request(f.root).get(path).set('Cookie', 'sz_guest_order_sid=invalid').expect(401)
  await context.identities.users.updateOne(
    { _id: f.buyer.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(f.root).get(path).set('Cookie', f.buyer.cookie).expect(401)
})

it('Package E: scoped refund histories expose durable pending/completed timelines and class-specific totals without protected evidence', async () => {
  const f = await packageDFixture(false, 60000, 'manual_bank', true)
  if (!f.manual) throw new Error('Missing manual fixture')
  await initializeMediaPersistence(context.db.connection)
  const root = packageERoot(),
    cookie = f.manual.who.cookie,
    other = await customer()
  const path = `/api/v1/refunds/${f.refundId}`,
    listPath = `/api/v1/orders/${f.orderId}/refunds`
  const before = await request(root).get(path).set('Cookie', cookie).expect(200)
  expect(before.body.data).toMatchObject({
    status: 'approved',
    capacityStatus: 'reserved',
    timing: { status: 'under_review' },
  })
  expect(before.body.data.timing).not.toHaveProperty('targetAt')
  expect(before.body.data).not.toHaveProperty('completedAt')
  expect(Object.keys(before.body.data).sort()).toEqual(
    [
      'id',
      'orderId',
      'sourceCollectionId',
      'refundGroupKey',
      'classification',
      'basis',
      'amountPoisha',
      'method',
      'status',
      'capacityStatus',
      'investigationStatus',
      'requestedAt',
      'approvedAt',
      'items',
      'timing',
      'timeline',
    ].sort(),
  )
  for (const field of [
    'approvedBy',
    'consentEvidenceRef',
    'attempts',
    'decisionKey',
    'revision',
    'manualEvidence',
    'sourceCapacity',
  ])
    expect(before.body.data).not.toHaveProperty(field)
  // Projection must retain a shorter approved target already recorded by the owning policy.
  await refundModel(context.db.connection).collection.updateOne(
    { _id: new Types.ObjectId(f.refundId) },
    { $set: { 'timingSnapshot.targetBusinessDays': 3 } },
  )
  await f.payout().expect(200)
  const processing = await request(root).get(path).set('Cookie', cookie).expect(200)
  expect(processing.body.data.status).toBe('processing')
  expect(processing.body.data.timing.targetBusinessDays).toBe(3)
  expect(
    processing.body.data.timeline.some((event: { status: string }) => event.status === 'completed'),
  ).toBe(false)
  await f.domain().defer(f.refundId, async () => {})
  const investigating = await request(root).get(path).set('Cookie', cookie).expect(200)
  expect(investigating.body.data.investigationStatus).toBe('under_review')
  await f.setProof('paid')
  await f
    .post('manual-confirmations', {
      transferReference: 'synthetic-transfer',
      evidenceRef: 'synthetic-proof',
      reason: 'Verified test proof',
    })
    .expect(200)
  const complete = await request(root).get(path).set('Cookie', cookie).expect(200)
  expect(complete.body.data).toMatchObject({
    status: 'completed',
    capacityStatus: 'completed',
    investigationStatus: 'none',
  })
  expect(complete.body.data.timeline.map((event: { status: string }) => event.status)).toEqual(
    expect.arrayContaining(['approved', 'processing', 'completed']),
  )
  const text = JSON.stringify(complete.body)
  for (const secret of [
    'synthetic-transfer',
    'synthetic-proof',
    '****1234',
    'synthetic:verified-consent',
  ])
    expect(text).not.toContain(secret)
  const list = await request(root).get(listPath).set('Cookie', cookie).expect(200)
  expect(list.body.data.merchandiseSummary).toEqual({
    heldPoisha: 0,
    completedPoisha: complete.body.data.amountPoisha,
  })
  expect(list.body.data.correctionSummary).toEqual({ heldPoisha: 0, completedPoisha: 0 })
  const mine = await request(root)
    .get('/api/v1/me/refunds?status=completed&classification=merchandise&pageSize=1')
    .set('Cookie', cookie)
    .expect(200)
  expect(mine.body.meta.totalItems).toBe(1)
  expect(mine.body.data[0].id).toBe(f.refundId)
  expect(complete.headers['cache-control']).toContain('no-store')
  for (const target of [path, listPath]) {
    await request(root).get(target).expect(401)
    await request(root).get(target).set('Cookie', other.cookie).expect(404)
    await request(root).get(`${target}?unexpected=1`).set('Cookie', cookie).expect(400)
  }
  for (const target of [
    '/api/v1/me/refunds?status=bogus',
    '/api/v1/me/refunds?sourceCollectionId=bad',
    '/api/v1/refunds/invalid',
  ])
    await request(root).get(target).set('Cookie', cookie).expect(400)
  await request(root).get('/api/v1/me/refunds').expect(401)
  const ownerId = (await orderModels(context.db.connection).orders.findById(f.orderId).orFail())
    .userId
  await context.identities.users.updateOne({ _id: ownerId }, { $set: { status: 'suspended' } })
  await request(root).get(path).set('Cookie', cookie).expect(401)
})

it('Package E: exact guest proof permits only its own refund and cannot enter customer cross-order lists or downgrade invalid customer credentials', async () => {
  const f = await packageDFixture(),
    foreign = await packageDFixture()
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
    guests.issueAfterProof(session, f.orderId),
  )
  const root = packageERoot(guests),
    cookie = `sz_guest_order_sid=${proof.token}`
  await request(root).get(`/api/v1/orders/${f.orderId}/refunds`).set('Cookie', cookie).expect(200)
  await request(root).get(`/api/v1/refunds/${f.refundId}`).set('Cookie', cookie).expect(200)
  await request(root).get(`/api/v1/refunds/${foreign.refundId}`).set('Cookie', cookie).expect(404)
  await request(root)
    .get(`/api/v1/orders/${foreign.orderId}/refunds`)
    .set('Cookie', cookie)
    .expect(401)
  await request(root).get('/api/v1/me/refunds').set('Cookie', cookie).expect(401)
  await request(root)
    .get(`/api/v1/refunds/${f.refundId}`)
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .expect(401)
  await guests.logout(proof.token)
  await request(root).get(`/api/v1/refunds/${f.refundId}`).set('Cookie', cookie).expect(401)
})

it('Package E: actual settled full merchandise refunds deny new review verification while preserving historical review edits for moderation', async () => {
  const f = await packageDFixture(false, 60000, 'manual_bank', true)
  if (!f.manual) throw new Error('Missing manual fixture')
  await initializeReviewPersistence(context.db.connection)
  await f.manual.review.transition(
    f.manual.token,
    f.manual.claimId,
    { to: 'completed', reason: 'Approved shortage resolved' },
    'e-resolved',
  )
  const order = await orderModels(context.db.connection).orders.findById(f.orderId).orFail(),
    item = order.items[0]
  if (!item || !order.userId) throw new Error('Missing registered purchase')
  const root = packageERoot(),
    cookie = f.manual.who.cookie,
    csrf = f.manual.who.csrf
  const input = {
    rating: 4,
    comment: 'Historical legitimate review',
    qualifyingOrderItemId: item.id.toHexString(),
  }
  const created = await request(root)
    .post(`/api/v1/products/${item.productId}/reviews`)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send(input)
    .expect(201)
  const eligibility = reviewPurchaseEligibilityAccess(context.db.connection),
    selection = {
      userId: order.userId.toHexString(),
      productId: item.productId.toHexString(),
      qualifyingOrderItemId: item.id.toHexString(),
    }
  expect(
    await inTransaction(context.db.connection, (session) => eligibility(session, selection)),
  ).toMatchObject({ eligible: true })
  await f.payout().expect(200)
  await f.setProof('paid')
  await f
    .post('manual-confirmations', {
      transferReference: 'synthetic-transfer',
      evidenceRef: 'synthetic-proof',
      reason: 'Verified full refund',
    })
    .expect(200)
  expect(
    await inTransaction(context.db.connection, (session) => eligibility(session, selection)),
  ).toBeNull()
  await request(root)
    .post(`/api/v1/products/${item.productId}/reviews`)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send(input)
    .expect(422)
  await request(root)
    .patch(`/api/v1/reviews/${created.body.data.id}`)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send({ comment: 'Historical review edited' })
    .expect(200)
  expect(
    (await reviewModel(context.db.connection).findById(created.body.data.id).orFail()).status,
  ).toBe('pending')
  expect(await reviewModel(context.db.connection).countDocuments()).toBe(1)
})

it('Package E: application root explicitly composes history/reviews and refuses incomplete admission', async () => {
  const config = loadEnvironment({ ...identityEnvironment(), SESSION_SECRET: authSecret })
  await initializeReviewPersistence(context.db.connection)
  await initializeCorrectionPersistence(context.db.connection)
  await initializeRefundAttemptPersistence(context.db.connection)
  const buyer = await customer()
  const make = (
    enabled: boolean,
    actualConfig = config,
    options: Parameters<typeof composeApplication>[11] = {
      policyVersion: 'sportzone-returns-v1',
      exceptions: [],
    },
  ) =>
    composeApplication(
      context.db.connection,
      actualConfig,
      { isReady: async () => true },
      createLogger(actualConfig, () => {}),
      undefined,
      [],
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      options,
      undefined,
      enabled,
    )
  const active = await make(true),
    inactive = await make(false)
  for (const path of ['/me/reviews', '/me/refunds']) {
    await request(active).get(`/api/v1${path}`).expect(401)
    await request(active).get(`/api/v1${path}`).set('Cookie', buyer.cookie).expect(200)
    await request(inactive).get(`/api/v1${path}`).set('Cookie', buyer.cookie).expect(404)
  }
  await expect(make(true, { ...config, CUSTOMER_AUTH_ENABLED: false })).rejects.toThrow()
  await expect(make(true, { ...config, APP_ENV: 'production' })).rejects.toThrow()
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
      true,
    ),
  ).rejects.toThrow()
})

it('Package E: zero-price delivered units qualify until a canonical claim resolution and never require a fictitious payout', async () => {
  await initializeReturnPersistence(context.db.connection)
  const f = await deliveredReviewFixture(true, undefined, true)
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, f.selection)),
  ).toMatchObject({ eligible: true })
  const claimId = new Types.ObjectId().toHexString(),
    create = createReturnService(
      context.db.connection,
      claimQuantityAccess(context.db.connection),
      async () => ({
        requestedBy: { type: 'customer', id: f.buyer.user._id.toHexString() },
        eligibilitySnapshot: { policyVersion: 'synthetic' },
      }),
      composeAuditAccess(context.db.connection),
    )
  await inTransaction(context.db.connection, (session) =>
    create.create(session, {
      claimId,
      orderId: f.orderId,
      claimType: 'shortage',
      items: [
        {
          orderItemId: f.selection.qualifyingOrderItemId,
          quantity: 2,
          reason: 'Synthetic missing free goods',
        },
      ],
    }),
  )
  const admin = await customer('admin'),
    lifecycle = createReturnLifecycleService(
      context.db.connection,
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      claimReviewQuantityAccess(context.db.connection),
      composeAuditAccess(context.db.connection),
      () => new Date(Date.now() + 1000),
    )
  for (const to of ['under_review', 'approved', 'completed'])
    await lifecycle.transition(
      admin.credentials.customerToken,
      claimId,
      {
        to,
        reason: 'Resolve zero-value shortage',
        ...(to === 'approved'
          ? { approvedItems: [{ orderItemId: f.selection.qualifyingOrderItemId, quantity: 2 }] }
          : {}),
      },
      to,
    )
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, f.selection)),
  ).toBeNull()
  expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.orderId })
    .orFail()
  expect(
    balance.unitCoverage.every(
      (unit) => unit.netEntitlementPoisha === 0 && unit.refundCompletedPoisha === 0,
    ),
  ).toBe(true)
})

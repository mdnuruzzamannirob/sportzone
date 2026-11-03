import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { sessionCookies } from '../../../src/modules/auth/auth.composition.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { catalogCheckoutAccess } from '../../../src/modules/catalog/catalog.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { checkoutDeliveryAccess } from '../../../src/modules/delivery/delivery.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { guestOrderAccess } from '../../../src/modules/orders/order.service.js'
import { protectedPaymentMatchingEvidence } from '../../../src/modules/payments/collections/payment-matching.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundFundingAccess } from '../../../src/modules/payments/payment.service.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { createCouponPreviewRoutes } from '../../../src/modules/promotions/promotion.routes.js'
import { createCouponPreviewService } from '../../../src/modules/promotions/promotion.service.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { composeCatalogCheckoutAccessDependencies } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  customerRefundPost,
  customerRefundRoot,
  matchingFixture,
  matchingRoot,
  matchPost,
} from '../../helpers/commerce/application.js'
import {
  authSecret,
  context,
  coupon,
  customer,
  origin,
  registerCommerceFixture,
  variant,
} from '../../helpers/commerce/base.js'
import { customerHeldOrder, initiationApp } from '../../helpers/commerce/checkout.js'
import {
  cancellationReadFixture,
  fundedCancellationFixture,
} from '../../helpers/commerce/orders.js'
import { monitorFixture, processingFixture } from '../../helpers/commerce/payments.js'
import {
  codRefundPolicy,
  packageCPost,
  reservationFixture,
} from '../../helpers/commerce/refunds.js'
import { physicalReturnFixture } from '../../helpers/commerce/returns.js'
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

it('backend completion: provider receipt inventory is bounded, current-admin-only and excludes matching secrets', async () => {
  const f = await monitorFixture()
  await f.processor().process(f.claim)
  const path = '/api/v1/admin/provider-receipts'
  await request(f.monitorApp).get(path).expect(401)
  const buyer = await customer()
  await request(f.monitorApp).get(path).set('Cookie', buyer.cookie).expect(401)
  const result = await request(f.monitorApp)
    .get(`${path}?matchingStatus=linked&pageSize=1`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(result.body.data).toHaveLength(1)
  expect(result.body.data[0].matchingStatus).toBe('linked')
  expect(result.body.meta.totalItems).toBe(1)
  expect(JSON.stringify(result.body)).not.toMatch(
    /merchantAccountKey|providerCollectionRef|validationId|bankTranId|evidenceDigest|reportedTranId/,
  )
  await request(f.monitorApp).get(`${path}?pageSize=101`).set('Cookie', f.admin.cookie).expect(400)
  await request(f.monitorApp).get(`${path}?email=private`).set('Cookie', f.admin.cookie).expect(400)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(f.monitorApp).get(path).set('Cookie', f.admin.cookie).expect(401)
})

it('backend completion: protected receipt matching retains a partial verified source once and allocates without full funding or fulfillment', async () => {
  const f = await matchingFixture(),
    directory = await mkdtemp(join(tmpdir(), 'sz-matching-')),
    file = join(directory, 'authority.json')
  const linkFacts = {
    operation: 'link',
    targetId: f.receipt._id.toHexString(),
    orderId: f.result.id,
    attemptId: f.attempt._id.toHexString(),
    amountPoisha: f.receipt.amountPoisha,
    evidenceDigest: f.receipt.validationDigest,
    matchingEvidenceRef: f.link.matchingEvidenceRef,
    verifiedAt: context.now.toISOString(),
  }
  const write = (records: object[]) =>
    writeFile(file, JSON.stringify({ version: 1, records }), { mode: 0o600 })
  try {
    await write([linkFacts])
    const root = matchingRoot(protectedPaymentMatchingEvidence(file, () => context.now)),
      path = `/admin/provider-receipts/${f.receipt._id}/link`
    const results = await Promise.all([
      matchPost(root, f.admin, path, f.link, 'link'),
      matchPost(root, f.admin, path, f.link, 'link'),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(results[0]?.body.data).toEqual(results[1]?.body.data)
    expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
    const collectionId = results[0]?.body.data.linkedCollectionId as string
    const payment = await paymentModel(context.db.connection).findById(f.paymentId).orFail()
    expect(payment.verifiedCollectedPoisha).toBe(100)
    expect(payment.unassignedCollectedPoisha).toBe(100)
    expect(payment.merchandiseFundedPoisha).toBe(0)
    expect(payment.riskStatus).toBe('review')
    expect(
      (await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id))?.state,
    ).toBe('verified_paid')
    const allocation = {
      merchandisePoisha: 100,
      correctionPoisha: 0,
      unassignedPoisha: 0,
      reason: 'Allocate independently verified partial source',
      matchingEvidenceRef: 'synthetic:allocation-case',
    }
    await write([
      {
        operation: 'allocate',
        targetId: collectionId,
        orderId: f.result.id,
        amountPoisha: 100,
        evidenceDigest: f.receipt.validationDigest,
        matchingEvidenceRef: allocation.matchingEvidenceRef,
        merchandisePoisha: 100,
        correctionPoisha: 0,
        unassignedPoisha: 0,
        verifiedAt: context.now.toISOString(),
      },
    ])
    const allocationPath = `/admin/payment-collections/${collectionId}/allocate`
    await matchPost(root, f.admin, allocationPath, allocation, 'allocation').expect(428)
    const allocated = await matchPost(
      root,
      f.admin,
      allocationPath,
      allocation,
      'allocation',
      '"0"',
    ).expect(200)
    expect(allocated.headers.etag).toBe('"1"')
    expect(allocated.body.data.merchandiseAllocatedPoisha).toBe(100)
    await matchPost(root, f.admin, allocationPath, allocation, 'allocation', '"0"').expect(200)
    await matchPost(root, f.admin, allocationPath, allocation, 'another-key', '"0"').expect(412)
    await matchPost(
      root,
      f.admin,
      allocationPath,
      { ...allocation, reason: 'changed' },
      'allocation',
      '"0"',
    ).expect(409)
    const after = await paymentModel(context.db.connection).findById(f.paymentId).orFail()
    expect(after.merchandiseFundedPoisha).toBe(100)
    expect(after.unassignedCollectedPoisha).toBe(0)
    expect(after.paymentStatus).toBe('pending')
    expect(
      (await orderModels(context.db.connection).orders.findById(f.result.id))?.fulfillmentStatus,
    ).toBe('pending')
    expect(
      (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
        .committed,
    ).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('backend completion: matching authority is mandatory and cannot authorize another face amount, source or revoked admin', async () => {
  const f = await matchingFixture(),
    path = `/admin/provider-receipts/${f.receipt._id}/link`
  await matchPost(matchingRoot(), f.admin, path, f.link, 'missing-authority').expect(503)
  const root = matchingRoot(async () => {
    await context.identities.users.updateOne(
      { _id: f.admin.user._id },
      { $set: { status: 'suspended' } },
    )
  })
  await matchPost(root, f.admin, path, f.link, 'revoked-during-verification').expect(401)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
  expect(
    (await paymentRecordModels(context.db.connection).intake.findById(f.receipt._id))
      ?.matchingStatus,
  ).toBe('quarantined')
})

it('backend completion: allocation conserves face amounts, denies stale/changed replay and never reduces source refund floors', async () => {
  const f = await matchingFixture(),
    root = matchingRoot(async () => {}),
    linkPath = `/admin/provider-receipts/${f.receipt._id}/link`
  const linked = await matchPost(root, f.admin, linkPath, f.link, 'link').expect(200),
    collectionId = linked.body.data.linkedCollectionId as string,
    path = `/admin/payment-collections/${collectionId}/allocate`,
    body = {
      merchandisePoisha: 100,
      correctionPoisha: 0,
      unassignedPoisha: 0,
      reason: 'Synthetic allocation',
      matchingEvidenceRef: 'synthetic:capacity-only-test',
    }
  await matchPost(
    root,
    f.admin,
    path,
    { ...body, merchandisePoisha: 101 },
    'over-face',
    '"0"',
  ).expect(409)
  await matchPost(root, f.admin, path, body, 'valid', '"0"').expect(200)
  await inTransaction(context.db.connection, (session) =>
    refundFundingAccess(context.db.connection).reserve(session, {
      orderId: f.result.id,
      sourceCollectionId: collectionId,
      classification: 'merchandise',
      amountPoisha: 60,
      deliveryAmountPoisha: 0,
      deliveryChargePoisha: 0,
    }),
  )
  await matchPost(
    root,
    f.admin,
    path,
    { ...body, merchandisePoisha: 20, correctionPoisha: 80 },
    'below-held',
    '"2"',
  ).expect(409)
  const row = await paymentRecordModels(context.db.connection)
    .collections.findById(collectionId)
    .orFail()
  expect(row.get('merchandiseAllocatedPoisha')).toBe(100)
  expect(row.get('merchandiseRefundHeldPoisha')).toBe(60)
  expect(
    (await paymentModel(context.db.connection).findById(f.paymentId))?.merchandiseFundedPoisha,
  ).toBe(100)
})

it('backend completion: customer refund submission records qualified source/units once without approving, reserving or dispatching; protected admin review is separate', async () => {
  const f = await reservationFixture(true, true),
    root = customerRefundRoot(f),
    input = {
      basis: 'shortage',
      basisRefId: f.claimId,
      reason: 'Refund accepted missing merchandise',
    }
  const results = await Promise.all([
    customerRefundPost(root, f.who, f.id, input),
    customerRefundPost(root, f.who, f.id, input),
  ])
  expect(results.map((result) => result.status)).toEqual([200, 200])
  expect(results[0]?.body.data).toEqual(results[1]?.body.data)
  const initial = results[0]?.body.data
  await customerRefundPost(root, f.who, f.id, input, 'another-key').expect(200)
  await customerRefundPost(root, f.who, f.id, { ...input, reason: 'Changed body' }).expect(409)
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(1)
  const row = await refundModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  expect(row.refundGroupKey).toBe(initial.refundGroupKey)
  expect(row.status).toBe('requested')
  expect(row.capacityStatus).toBe('not_reserved')
  expect(
    (
      await paymentRecordModels(context.db.connection).collections.findById(row.sourceCollectionId)
    )?.get('merchandiseRefundHeldPoisha'),
  ).toBe(0)
  expect(row.approvedBy).toBeUndefined()
  expect(row.approvedAt).toBeUndefined()
  expect(row.timingSnapshot).toBeUndefined()
  expect(
    await refundAttemptModel(context.db.connection).countDocuments({ refundId: row._id }),
  ).toBe(0)
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'refund_update' }),
  ).toBe(0)
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/payout-attempts`,
    { method: 'manual_bank', reason: 'Must not dispatch pending request' },
    'early-dispatch',
  ).expect(409)
  const approved = await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/review`,
    { decision: 'approve', reason: 'Protected store review' },
    'actual-review',
  ).expect(200)
  expect(approved.body.data.status).toBe('approved')
  expect(
    (await refundModel(context.db.connection).findById(row._id))?.approvedBy?.toHexString(),
  ).toBe(f.admin.user._id.toHexString())
  expect(
    (
      await paymentRecordModels(context.db.connection).collections.findById(row.sourceCollectionId)
    )?.get('merchandiseRefundHeldPoisha'),
  ).toBe(row.amountPoisha)
})

it('backend completion: refund request denies foreign ownership, CSRF, caller money/source/method, unqualified basis and unfunded claims', async () => {
  const f = await reservationFixture(true, true),
    root = customerRefundRoot(f),
    other = await customer(),
    input = { basis: 'shortage', basisRefId: f.claimId, reason: 'Request qualified refund' }
  await customerRefundPost(root, other, f.id, input).expect(404)
  await customerRefundPost(root, { ...f.who, csrf: 'invalid' }, f.id, input).expect(403)
  for (const extra of [
    { amountPoisha: 1 },
    { sourceCollectionId: new Types.ObjectId().toHexString() },
    { method: 'manual_bank' },
  ])
    await customerRefundPost(root, f.who, f.id, { ...input, ...extra }).expect(400)
  await customerRefundPost(root, f.who, f.id, { ...input, basis: 'physical_return' }).expect(422)
  const unfunded = await reservationFixture(false, true),
    otherRoot = customerRefundRoot(unfunded)
  await customerRefundPost(otherRoot, unfunded.who, unfunded.id, {
    ...input,
    basisRefId: unfunded.claimId,
  }).expect(422)
  expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
})

it('backend completion: exact guest order proof can submit a funded refund request but cannot downgrade invalid customer credentials', async () => {
  const f = await reservationFixture(true, false)
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
  const issued = await inTransaction(context.db.connection, (session) =>
      guests.issueAfterProof(session, f.id),
    ),
    who = { cookie: `sz_guest_order_sid=${issued.token}`, csrf: issued.csrfToken },
    root = customerRefundRoot(f, guests),
    input = { basis: 'shortage', basisRefId: f.claimId, reason: 'Verified guest refund request' }
  await customerRefundPost(
    root,
    { ...who, cookie: `${who.cookie}; sz_customer_sid=invalid` },
    f.id,
    input,
  ).expect(403)
  await customerRefundPost(root, who, new Types.ObjectId().toHexString(), input).expect(401)
  await customerRefundPost(root, who, f.id, input).expect(200)
  expect((await refundModel(context.db.connection).findOne({ orderId: f.id }))?.status).toBe(
    'requested',
  )
})

it('backend completion: rejecting an unapproved refund request releases no committed money and never creates a payout', async () => {
  const f = await reservationFixture(true, true),
    root = customerRefundRoot(f),
    input = { basis: 'shortage', basisRefId: f.claimId, reason: 'Request refund review' }
  await customerRefundPost(root, f.who, f.id, input).expect(200)
  const row = await refundModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/review`,
    { decision: 'reject', reason: 'Protected admin rejection' },
    'reject-pending',
  ).expect(200)
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/review`,
    { decision: 'reject', reason: 'Protected admin rejection' },
    'reject-pending',
  ).expect(200)
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/review`,
    { decision: 'reject', reason: 'Changed rejection body' },
    'reject-pending',
  ).expect(409)
  expect(await refundModel(context.db.connection).findById(row._id)).toMatchObject({
    status: 'rejected',
    capacityStatus: 'released',
  })
  expect(
    (
      await paymentRecordModels(context.db.connection).collections.findById(row.sourceCollectionId)
    )?.get('merchandiseRefundHeldPoisha'),
  ).toBe(0)
  expect(
    await refundAttemptModel(context.db.connection).countDocuments({ refundId: row._id }),
  ).toBe(0)
})

it('backend completion: refund approval rechecks capacity and cannot treat a pending customer request as already reserved', async () => {
  const f = await reservationFixture(true, true),
    root = customerRefundRoot(f),
    input = { basis: 'shortage', basisRefId: f.claimId, reason: 'Request full accepted claim' }
  await customerRefundPost(root, f.who, f.id, input).expect(200)
  const row = await refundModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  await f.service.reserve(f.token, f.input, 'independent-admin-reservation')
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/review`,
    { decision: 'approve', reason: 'Capacity must be rechecked' },
    'approve-pending',
  ).expect(409)
  expect(await refundModel(context.db.connection).findById(row._id)).toMatchObject({
    status: 'requested',
    capacityStatus: 'not_reserved',
  })
  expect(
    (
      await paymentRecordModels(context.db.connection).collections.findById(row.sourceCollectionId)
    )?.get('merchandiseRefundHeldPoisha'),
  ).toBeLessThan(row.amountPoisha)
})

it('backend completion: inspected physical requests require their accepted units and remain unapproved without attempts', async () => {
  const f = await physicalReturnFixture('physical_return', true, true)
  await f.receive()
  await f.inspect()
  await f.cash()
  const base = codRefundPolicy(f),
    root = customerRefundRoot(f, undefined, {
      ...base,
      authorizations: base.authorizations.map((row) => ({
        ...row,
        basis: 'physical_return' as const,
      })),
    })
  await customerRefundPost(root, f.who, f.id, {
    basis: 'physical_return',
    basisRefId: f.claimId,
    reason: 'Request inspected accepted units',
  }).expect(200)
  const row = await refundModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  expect(row).toMatchObject({
    status: 'requested',
    capacityStatus: 'not_reserved',
    basis: 'physical_return',
  })
  expect(row.items[0]?.unitAmounts).toHaveLength(2)
  expect(
    await refundAttemptModel(context.db.connection).countDocuments({ refundId: row._id }),
  ).toBe(0)
})

it('backend completion: a qualified cancellation request references its existing source-funded obligation without a second hold', async () => {
  const f = await fundedCancellationFixture(),
    asked = await f.ask()
  await f.cancellation.decide(
    f.admin.credentials.customerToken,
    asked.id,
    { decision: 'approve', reason: 'Approve qualified cancellation' },
    'approve-funded',
  )
  const before = await paymentModel(context.db.connection).findById(f.payment._id).orFail(),
    count = await refundModel(context.db.connection).countDocuments({ orderId: f.id }),
    root = customerRefundRoot({ id: f.id, claimId: asked.id })
  await customerRefundPost(root, f.who, f.id, {
    basis: 'cancellation',
    basisRefId: asked.id,
    reason: 'Reference already qualified cancellation refund',
  }).expect(200)
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(count)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id))
      ?.merchandiseRefundHeldPoisha,
  ).toBe(before.merchandiseRefundHeldPoisha)
})

it('backend completion: correction requests reference actual distinct verified excess collections without creating a merchandise refund or another payout intent', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({
    bank_tran_id: 'second-independent-correction-bank',
    val_id: 'second-independent-correction-validation',
  })
  expect(
    await f.processor().process({
      ...f.claim,
      validationId: 'second-independent-correction-validation',
    }),
  ).toBe('committed')
  const count = await refundModel(context.db.connection).countDocuments({ orderId: f.result.id }),
    root = customerRefundRoot({ id: f.result.id, claimId: new Types.ObjectId().toHexString() })
  expect(count).toBe(1)
  await customerRefundPost(root, f.who, f.result.id, {
    basis: 'payment_correction',
    reason: 'Investigate and return actual excess cash',
  }).expect(200)
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.result.id })).toBe(
    count,
  )
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(0)
  expect(
    (await refundModel(context.db.connection).findOne({ orderId: f.result.id }))?.classification,
  ).toBe('payment_correction')
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

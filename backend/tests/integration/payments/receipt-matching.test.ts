import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { expect, it } from 'vitest'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { protectedPaymentMatchingEvidence } from '../../../src/modules/payments/collections/payment-matching.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundFundingAccess } from '../../../src/modules/payments/payment.service.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { context, customer, registerCommerceFixture } from '../../helpers/commerce/base.js'
import {
  matchingFixture,
  matchingRoot,
  matchPost,
  monitorFixture,
} from '../../helpers/commerce/payments.js'

registerCommerceFixture()

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

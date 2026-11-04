import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { createFulfillmentAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { fulfillmentPaymentAccess } from '../../../src/modules/payments/payment.service.js'
import { reviewModel } from '../../../src/modules/reviews/review.model.js'
import {
  composeAuditAccess,
  composeFulfillmentAllocationDependencies,
  composeLocalReviewRoutes,
  composeOrderLifecycleDependencies,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  body,
  context,
  customer,
  origin,
  registerCommerceFixture,
  submit,
} from '../../helpers/commerce/base.js'
import { placeCod } from '../../helpers/commerce/checkout.js'
import {
  deliveredReviewFixture,
  localReviewAuth,
  markSyntheticFullReturnAndRefund,
} from '../../helpers/commerce/reviews.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'

registerCommerceFixture()

it('blocked review audit: composed real purchase, visibility, admin fences and audit receipts survive moderation replay', async () => {
  const f = await deliveredReviewFixture(),
    administrator = await customer('admin')
  const root = createApp({
    apiRouter: composeLocalReviewRoutes(
      context.db.connection,
      'test',
      localReviewAuth(),
      () => context.now,
    ),
  })
  const input = {
    rating: 2,
    comment: 'Authentic synthetic purchase review',
    qualifyingOrderItemId: f.selection.qualifyingOrderItemId,
  }
  const productPath = `/api/v1/products/${f.selection.productId}/reviews`
  const created = await request(root)
    .post(productPath)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .send(input)
    .expect(201)
  const id = created.body.data.id,
    moderatePath = `/api/v1/admin/reviews/${id}/moderation`
  const approve = () =>
    request(root)
      .post(moderatePath)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', administrator.cookie)
      .set('X-CSRF-Token', administrator.csrf)
      .set('Idempotency-Key', 'real-review-approval')
      .send({ decision: 'approve', reason: 'Verified actual purchase facts' })
  await approve().expect(200)
  expect((await request(root).get(productPath).expect(200)).body.data).toHaveLength(1)
  await request(root)
    .patch(`/api/v1/reviews/${id}`)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .send({ comment: 'Edited authentic review' })
    .expect(200)
  await approve().expect(200)
  expect((await request(root).get(productPath).expect(200)).body.data).toEqual([])
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ targetId: new Types.ObjectId(id), action: 'review.approve' }),
  ).toBe(1)
  await context.identities.users.updateOne(
    { _id: administrator.user._id },
    { $set: { status: 'suspended' } },
  )
  await approve().expect(403)
  expect(() =>
    composeLocalReviewRoutes(context.db.connection, 'production', localReviewAuth()),
  ).toThrow()
})

it('blocked review audit: composed review API denies undelivered purchase, foreign proof and missing CSRF', async () => {
  const f = await deliveredReviewFixture(false),
    foreign = await customer()
  const root = createApp({
    apiRouter: composeLocalReviewRoutes(
      context.db.connection,
      'test',
      localReviewAuth(),
      () => context.now,
    ),
  })
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, f.selection)),
  ).toBeNull()
  const input = {
    rating: 5,
    comment: 'Synthetic invalid proof',
    qualifyingOrderItemId: f.selection.qualifyingOrderItemId,
  }
  const path = `/api/v1/products/${f.selection.productId}/reviews`
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .send(input)
    .expect(422)
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', foreign.cookie)
    .set('X-CSRF-Token', foreign.csrf)
    .send(input)
    .expect(422)
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .send(input)
    .expect(403)
  expect(await reviewModel(context.db.connection).countDocuments()).toBe(0)
})

it('review qualification local: only the owner of the exact delivered product item qualifies', async () => {
  const f = await deliveredReviewFixture()
  const proof = await inTransaction(context.db.connection, (session) =>
    f.eligibility(session, f.selection),
  )
  expect(proof).toEqual({ ...f.selection, orderId: f.orderId, delivered: true, eligible: true })
  for (const selection of [
    { ...f.selection, userId: new Types.ObjectId().toHexString() },
    { ...f.selection, productId: new Types.ObjectId().toHexString() },
    { ...f.selection, qualifyingOrderItemId: new Types.ObjectId().toHexString() },
  ])
    expect(
      await inTransaction(context.db.connection, (session) => f.eligibility(session, selection)),
    ).toBeNull()
  const session = await context.db.connection.startSession()
  try {
    await expect(f.eligibility(session, f.selection)).rejects.toThrow()
  } finally {
    await session.endSession()
  }
})

it('review qualification local: full return and synthetic completed refund block a new review while preserving existing review and moderation', async () => {
  const f = await deliveredReviewFixture()
  const created = await f.reviews.create(f.buyer.credentials.customerToken, f.selection.productId, {
    rating: 4,
    comment: 'Synthetic review',
    qualifyingOrderItemId: f.selection.qualifyingOrderItemId,
  })
  await markSyntheticFullReturnAndRefund(f.orderId)
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, f.selection)),
  ).toBeNull()
  expect(await f.reviews.readOwn(f.buyer.credentials.customerToken, created.id)).toMatchObject({
    id: created.id,
    comment: 'Synthetic review',
  })
  expect(
    await f.reviews.edit(f.buyer.credentials.customerToken, created.id, {
      comment: 'Edited review',
    }),
  ).toMatchObject({ status: 'pending' })
  expect(await reviewModel(context.db.connection).countDocuments({ _id: created.id })).toBe(1)
})

it('review qualification local: a second delivered purchase remains eligible after the first is fully returned/refunded', async () => {
  const f = await deliveredReviewFixture()
  await markSyntheticFullReturnAndRefund(f.orderId)
  const draft = body([f.selected.item]),
    quote = await context.service.create(f.buyer.credentials, draft)
  const placed = await placeCod(f.buyer, submit(draft, quote), 'second-review-checkout').expect(201)
  const secondId = placed.body.data.order.id,
    admin = await customer('admin')
  const lifecycle = createOrderLifecycleService(
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
  for (const status of ['confirmed', 'processing', 'shipped', 'delivered'])
    await lifecycle.transition(
      admin.credentials.customerToken,
      secondId,
      {
        to: status,
        reason: 'Synthetic',
        ...(status === 'shipped' ? { dispatchReference: 'second' } : {}),
      },
      `second-${status}`,
    )
  const order = await orderModels(context.db.connection).orders.findById(secondId).orFail(),
    item = order.items[0]
  if (!item) throw new Error('Missing second item')
  const selection = { ...f.selection, qualifyingOrderItemId: item.id.toHexString() }
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, selection)),
  ).toMatchObject({ eligible: true, orderId: secondId })
})

it('review qualification local: return alone and pending refund commitments do not disqualify', async () => {
  const f = await deliveredReviewFixture(),
    balances = orderModels(context.db.connection).balances
  const row = await balances.findOne({ orderId: f.orderId }).orFail(),
    set: Record<string, unknown> = { activeClaimQty: 0, resolvedClaimQty: row.purchasedQty }
  row.unitCoverage.forEach((unit, index) => {
    set[`unitCoverage.${index}.claimState`] = 'resolved'
    set[`unitCoverage.${index}.claimId`] = new Types.ObjectId()
    set[`unitCoverage.${index}.refundHeldPoisha`] = unit.netEntitlementPoisha
  })
  await balances.updateOne(
    { _id: row._id, revision: row.revision },
    { $set: set, $inc: { revision: 1 } },
  )
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, f.selection)),
  ).toMatchObject({ eligible: true })
})

it('review qualification local: concurrent full refund invalidates a stale transaction snapshot', async () => {
  const f = await deliveredReviewFixture()
  let release: () => void = () => {},
    observed: () => void = () => {}
  const proceed = new Promise<void>((resolve) => {
    release = resolve
  })
  const seen = new Promise<void>((resolve) => {
    observed = resolve
  })
  const ongoing = inTransaction(context.db.connection, async (session) => {
    await orderModels(context.db.connection)
      .balances.findOne({ orderId: f.orderId })
      .session(session)
      .orFail()
    observed()
    await proceed
    return f.eligibility(session, f.selection)
  })
  await seen
  try {
    await markSyntheticFullReturnAndRefund(f.orderId)
  } finally {
    release()
  }
  expect(await ongoing).toBeNull()
})

it('review qualification local: stale refund quantity projection cannot make fully paid returned units eligible', async () => {
  const f = await deliveredReviewFixture()
  await markSyntheticFullReturnAndRefund(f.orderId)
  const balances = orderModels(context.db.connection).balances,
    row = await balances.findOne({ orderId: f.orderId }).orFail()
  await balances.updateOne(
    { _id: row._id, revision: row.revision },
    { $set: { refundedMerchandiseQty: 0 }, $inc: { revision: 1 } },
  )
  expect(
    await inTransaction(context.db.connection, (session) => f.eligibility(session, f.selection)),
  ).toBeNull()
})

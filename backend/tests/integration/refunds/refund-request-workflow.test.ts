import { Types } from 'mongoose'
import { expect, it } from 'vitest'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { guestOrderAccess } from '../../../src/modules/orders/order.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  authSecret,
  context,
  customer,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { fundedCancellationFixture } from '../../helpers/commerce/orders.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import {
  codRefundPolicy,
  customerRefundPost,
  customerRefundRoot,
  packageCPost,
  reservationFixture,
} from '../../helpers/commerce/refunds.js'
import { physicalReturnFixture } from '../../helpers/commerce/returns.js'

registerCommerceFixture()

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

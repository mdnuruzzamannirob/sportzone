import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { expect, it, vi } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import {
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { orderPolicySnapshotAccess } from '../../../src/modules/checkout/checkout.service.js'
import {
  inventoryMovementModel,
  inventoryReservationModel,
} from '../../../src/modules/inventory/inventory.model.js'
import { initializeCancellationPersistence } from '../../../src/modules/orders/cancellation.persistence.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { codCollectionOrderAccess } from '../../../src/modules/orders/order.service.js'
import { createFulfillmentAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { createOrderReadService } from '../../../src/modules/orders/order-read.service.js'
import { createCodCollectionService } from '../../../src/modules/payments/collections/cod-collection.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import {
  customerPaymentSummaryAccess,
  fulfillmentPaymentAccess,
} from '../../../src/modules/payments/payment.service.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { createApiRouter } from '../../../src/routes.js'
import { startServer } from '../../../src/server.js'
import {
  composeApplication,
  composeAuditAccess,
  composeCodCollectionDependencies,
  composeFulfillmentAllocationDependencies,
  composeOrderLifecycleDependencies,
  composeOrderOperationsRoutes,
  composeOrderReadDependencies,
  configuredOrderOperations,
} from '../../../src/setup.js'
import { ApiError } from '../../../src/shared/errors/app-error.js'
import { createLogger } from '../../../src/shared/logger.js'
import {
  authSecret,
  context,
  customer,
  deadline,
  origin,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import {
  fundedCancellationFixture,
  lifecycleFixture,
  packageAPost,
  packageARoot,
} from '../../helpers/commerce/orders.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import { localReviewAuth } from '../../helpers/commerce/reviews.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('lifecycle/COD local: missing dispatch reference, stale generation and ordinary cancellation are denied', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  await expect(
    f.lifecycle.transition(f.token, f.id, { to: 'shipped', reason: 'No proof' }, 'no-reference'),
  ).rejects.toThrow()
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'dispatch' }),
  ).toBe(0)
  await expect(f.move('cancelled')).rejects.toThrow()
  await inventoryReservationModel(context.db.connection).updateOne(
    { orderId: f.id, status: 'committed' },
    {
      $set: {
        status: 'released',
        releasedAt: context.now,
        releaseReason: 'Synthetic stale generation',
      },
      $unset: { activeKey: '' },
    },
  )
  await expect(f.move('shipped')).rejects.toThrow()
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'processing',
  )
})

it('lifecycle/COD local: missing audit readiness prevents physical stock/order changes and permits retry', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  const stockBefore = (
    await productModels(context.db.connection).variants.findById(f.selected.row._id)
  )?.stock
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.move('shipped')).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toEqual(stockBefore)
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'processing',
  )
  await f.move('shipped')
})

it('lifecycle/COD local: current admin authorization, risk and monotonic timestamps gate mutations', async () => {
  const f = await lifecycleFixture()
  await expect(
    f.lifecycle.transition(
      undefined,
      f.id,
      { to: 'confirmed', reason: 'No session' },
      'no-session',
    ),
  ).rejects.toThrow()
  await paymentModel(context.db.connection).updateOne(
    { _id: f.payment._id },
    { $set: { riskStatus: 'review' } },
  )
  await expect(f.move('confirmed')).rejects.toThrow()
  await paymentModel(context.db.connection).updateOne(
    { _id: f.payment._id },
    { $set: { riskStatus: 'clear' } },
  )
  await f.move('confirmed')
  context.now = new Date(context.now.getTime() - 1)
  await expect(f.move('processing')).rejects.toThrow()
  context.now = new Date(context.now.getTime() + 1)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await expect(f.move('processing')).rejects.toThrow()
})

it('lifecycle/COD local: partial cash, final cash and distinct excess preserve source accounting without stock effects', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  const half = Math.floor(f.payment.expectedPoisha / 2)
  await f.cash(half, 'cash-first')
  expect((await paymentModel(context.db.connection).findById(f.payment._id))?.paymentStatus).toBe(
    'pending',
  )
  await f.cash(f.payment.expectedPoisha - half, 'cash-second')
  expect((await paymentModel(context.db.connection).findById(f.payment._id))?.paymentStatus).toBe(
    'paid',
  )
  await f.cash(100, 'cash-excess')
  expect(
    await context.db.connection
      .collection('refunds')
      .countDocuments({ capacityStatus: 'not_reserved', amountPoisha: 100 }),
  ).toBe(1)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(3)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id))?.merchandiseFundedPoisha,
  ).toBe(f.payment.expectedPoisha)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
})

it('lifecycle/COD local: duplicate cash reference and concurrent same-key retries collect once', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  const [one, two] = await Promise.all([f.cash(), f.cash()])
  expect(one.id).toBe(two.id)
  expect((await f.cash(f.payment.expectedPoisha, 'cash-receipt-1', 'different-key')).id).toBe(
    one.id,
  )
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id))?.verifiedCollectedPoisha,
  ).toBe(f.payment.expectedPoisha)
  await expect(f.cash(1, 'cash-receipt-1', 'changed-body')).rejects.toThrow()
})

it('lifecycle/COD local: unconfirmed COD and missing/mismatched evidence cannot create Paid', async () => {
  const f = await lifecycleFixture()
  await expect(f.cash()).rejects.toThrow()
  await f.move('confirmed')
  const unavailable = createCodCollectionService(
    context.db.connection,
    f.adminAccess,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    undefined,
    () => context.now,
  )
  const body = {
    amountPoisha: f.payment.expectedPoisha,
    collectionReference: 'no-evidence',
    evidenceRef: 'synthetic:unverified',
    reason: 'Review',
  }
  await expect(
    unavailable.collect(f.token, f.payment._id.toHexString(), body, 'no-evidence'),
  ).rejects.toThrow()
  const wrong = createCodCollectionService(
    context.db.connection,
    f.adminAccess,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (data) => ({ ...f.proof(data), amountPoisha: data.amountPoisha + 1 }),
    () => context.now,
  )
  await expect(
    wrong.collect(f.token, f.payment._id.toHexString(), body, 'wrong-evidence'),
  ).rejects.toThrow()
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
})

it('lifecycle/COD local: identity revoked during evidence read cannot commit a collection', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  const receipt = createCodCollectionService(
    context.db.connection,
    f.adminAccess,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (data) => {
      await context.identities.users.updateOne(
        { _id: f.admin.user._id },
        { $set: { status: 'suspended' } },
      )
      return f.proof(data)
    },
    () => context.now,
  )
  await expect(
    receipt.collect(
      f.token,
      f.payment._id.toHexString(),
      {
        amountPoisha: f.payment.expectedPoisha,
        collectionReference: 'revoked',
        evidenceRef: 'synthetic:private',
        reason: 'Review',
      },
      'revoked',
    ),
  ).rejects.toThrow()
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
})

it('lifecycle/COD local: cash audit failure rolls back receipt and balances; same key recovers', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.cash()).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id))?.verifiedCollectedPoisha,
  ).toBe(0)
  await f.cash()
})

it('lifecycle/COD local: late correction failure rolls back the newly verified receipt and all payment amounts', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await context.db.connection.collection('refunds').dropIndex('refund_decision_unique')
  try {
    await expect(f.cash(f.payment.expectedPoisha + 100, 'late-failure')).rejects.toThrow()
  } finally {
    await initializeCorrectionPersistence(context.db.connection)
  }
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id))?.verifiedCollectedPoisha,
  ).toBe(0)
  await f.cash(f.payment.expectedPoisha + 100, 'late-failure')
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id))?.correctionCollectedPoisha,
  ).toBe(100)
})

it('lifecycle/COD local: unfunded online confirmation is denied, while verified fully funded stock ships once', async () => {
  const f = await processingFixture(true),
    admin = await customer('admin'),
    access = createAdminAccountAccess(context.db.connection, context.identities, context.sessions)
  const lifecycle = createOrderLifecycleService(
    context.db.connection,
    access,
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
  const move = (to: string) =>
    lifecycle.transition(
      admin.credentials.customerToken,
      f.result.id,
      {
        to,
        reason: 'Synthetic verified online fulfillment',
        ...(to === 'shipped' ? { dispatchReference: 'online-dispatch' } : {}),
      },
      `online-${to}`,
    )
  await expect(move('confirmed')).rejects.toThrow()
  expect(await f.processor().process(f.claim)).toBe('committed')
  expect(
    (await orderModels(context.db.connection).orders.findById(f.result.id))?.fulfillmentHold,
  ).toBe('admin_review')
  await move('confirmed')
  await move('processing')
  await move('shipped')
  expect(
    (await orderModels(context.db.connection).orders.findById(f.result.id))?.fulfillmentStatus,
  ).toBe('shipped')
  expect(
    (await paymentModel(context.db.connection).findById(f.attempt.paymentId))?.paymentStatus,
  ).toBe('paid')
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'dispatch' }),
  ).toBe(1)
})

it('lifecycle/COD local: different admins can concurrently dispatch and record cash without losing either fact', async () => {
  const f = await lifecycleFixture(),
    other = await customer('admin')
  await f.move('confirmed')
  await f.move('processing')
  await Promise.all([
    f.lifecycle.transition(
      other.credentials.customerToken,
      f.id,
      { to: 'shipped', reason: 'Independent dispatch', dispatchReference: 'concurrent-dispatch' },
      'concurrent-dispatch',
    ),
    f.cash(),
  ])
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect((await paymentModel(context.db.connection).findById(f.payment._id))?.paymentStatus).toBe(
    'paid',
  )
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'dispatch' }),
  ).toBe(1)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
})

it('lifecycle/COD local: a globally repeated cash reference cannot credit another order', async () => {
  const first = await lifecycleFixture()
  await first.move('confirmed')
  await first.cash()
  const second = await lifecycleFixture()
  await second.move('confirmed')
  await expect(second.cash()).rejects.toThrow()
  expect(
    (await paymentModel(context.db.connection).findById(second.payment._id))
      ?.verifiedCollectedPoisha,
  ).toBe(0)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
})

it('lifecycle/COD local: cash evidence timestamps cannot predate the order or lie in the future', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  for (const delta of [-1, 1]) {
    const receipt = createCodCollectionService(
      context.db.connection,
      f.adminAccess,
      codCollectionOrderAccess(context.db.connection),
      composeAuditAccess(context.db.connection),
      composeCodCollectionDependencies(context.db.connection),
      async (data) => ({ ...f.proof(data), collectedAt: new Date(context.now.getTime() + delta) }),
      () => context.now,
    )
    await expect(
      receipt.collect(
        f.token,
        f.payment._id.toHexString(),
        {
          amountPoisha: f.payment.expectedPoisha,
          collectionReference: `bad-clock-${delta}`,
          evidenceRef: 'synthetic:private',
          reason: 'Review',
        },
        `bad-clock-${delta}`,
      ),
    ).rejects.toThrow()
  }
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
})

it('lifecycle/COD local: risk review retains verified cash while continuing to block fulfillment', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await paymentModel(context.db.connection).updateOne(
    { _id: f.payment._id },
    { $set: { riskStatus: 'review' } },
  )
  await f.cash()
  await expect(f.move('processing')).rejects.toThrow()
  expect((await paymentModel(context.db.connection).findById(f.payment._id))?.paymentStatus).toBe(
    'paid',
  )
  expect((await paymentModel(context.db.connection).findById(f.payment._id))?.riskStatus).toBe(
    'review',
  )
})

it('Package A HTTP: full transition journey returns canonical admin detail; delivered COD remains unpaid', async () => {
  const f = await lifecycleFixture(),
    { root } = packageARoot(f)
  const path = `/api/v1/admin/orders/${f.id}`
  const initial = await request(root).get(path).set('Cookie', f.admin.cookie).expect(200)
  expect(initial.body.data.allocationSummary.items[0].status).toBe('committed')
  expect(initial.body.data).not.toHaveProperty('checkoutIntentId')
  expect(initial.body.data).not.toHaveProperty('customerSnapshot')
  await packageAPost(root, f, 'shipped').expect(409)
  for (const to of ['confirmed', 'processing', 'shipped', 'delivered']) {
    const result = await packageAPost(root, f, to).expect(200)
    expect(result.body.data.fulfillmentStatus).toBe(to)
    expect(result.body.data.paymentSummary.status).toBe('pending')
    expect(result.body.data.items[0].sku).toBe(f.selected.row.skuNormalized)
    expect(result.body.data.auditRefs.length).toBeGreaterThan(0)
  }
  const replay = await packageAPost(root, f, 'shipped').expect(200)
  expect(replay.body.data.fulfillmentStatus).toBe('delivered')
  expect(replay.body.data.allocationSummary.items[0].status).toBe('shipped')
  await request(root)
    .post(`${path}/fulfillment-transitions`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .set('Idempotency-Key', 'shipped')
    .send({ to: 'shipped', reason: 'Synthetic HTTP authorization', dispatchReference: 'other' })
    .expect(409)
  await packageAPost(root, f, 'processing', 'shipped').expect(409)
  await packageAPost(root, f, 'processing', 'terminal-skip').expect(409)
  const row = await orderModels(context.db.connection).orders.findById(f.id).orFail()
  expect(row.statusHistory).toHaveLength(4)
  expect(row.deliveryCommitment.status).toBe('calculated')
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock,
  ).toMatchObject({ physical: 8, reserved: 0, committed: 0 })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'dispatch' }),
  ).toBe(1)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
})

it('Package A HTTP: admin reads deny customers, missing/stale sessions and invalid parameters', async () => {
  const f = await lifecycleFixture(),
    { root } = packageARoot(f),
    buyer = await customer()
  for (const path of ['/api/v1/admin/orders', `/api/v1/admin/orders/${f.id}`]) {
    await request(root).get(path).expect(401)
    await request(root).get(path).set('Cookie', buyer.cookie).expect(401)
  }
  await request(root)
    .get('/api/v1/admin/orders/not-an-id')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await request(root)
    .get('/api/v1/admin/orders?customerId=bad')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await request(root)
    .get(`/api/v1/admin/orders/${f.id}?unexpected=1`)
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(root).get(`/api/v1/admin/orders/${f.id}`).set('Cookie', f.admin.cookie).expect(401)
})

it('Package A HTTP: missing keys, wrong origin/CSRF and client money cannot change fulfillment', async () => {
  const f = await lifecycleFixture(),
    { root } = packageARoot(f)
  const path = `/api/v1/admin/orders/${f.id}/fulfillment-transitions`
  for (const headers of [{}, { Origin: origin }, { Origin: 'http://localhost:5173' }]) {
    await request(root)
      .post(path)
      .set('Cookie', f.admin.cookie)
      .set(headers)
      .send({ to: 'confirmed', reason: 'Denied' })
      .expect(403)
  }
  await request(root)
    .post(path)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .send({ to: 'confirmed', reason: 'Missing key' })
    .expect(400)
  await packageAPost(root, f, 'delivered').expect(409)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('pending')
})

it('Package A HTTP: unavailable policy prevents confirmation and shipping race dispatches only once', async () => {
  const f = await lifecycleFixture(),
    denied = packageARoot(f, false)
  const before = await orderModels(context.db.connection).orders.findById(f.id).lean()
  await packageAPost(denied.root, f, 'confirmed').expect(503)
  expect(await orderModels(context.db.connection).orders.findById(f.id).lean()).toEqual(before)
  expect(
    (await paymentModel(context.db.connection).findById(f.payment._id).orFail()).revision,
  ).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock,
  ).toMatchObject({ physical: 10, committed: 2 })
  const { root } = packageARoot(f)
  await packageAPost(root, f, 'confirmed').expect(200)
  await packageAPost(root, f, 'processing').expect(200)
  const results = await Promise.all([
    packageAPost(root, f, 'shipped'),
    packageAPost(root, f, 'shipped'),
  ])
  expect(results.map((r) => r.status)).toEqual([200, 200])
  const stock = await productModels(context.db.connection)
    .variants.findById(f.selected.row._id)
    .orFail()
  expect(stock.stock).toMatchObject({ physical: 8, reserved: 0, committed: 0 })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'dispatch' }),
  ).toBe(1)
})

it('Package A HTTP: protected cash verification, collection projection and replay preserve one source', async () => {
  const f = await lifecycleFixture(),
    { root, evidence } = packageARoot(f)
  const path = `/api/v1/admin/payments/${f.payment._id}/cod-collections`
  await packageAPost(root, f, 'confirmed').expect(200)
  const input = {
    amountPoisha: f.payment.expectedPoisha,
    collectionReference: 'package-a-cash',
    evidenceRef: 'synthetic:cash',
    reason: 'Synthetic original receipt',
  }
  await request(root)
    .post(path)
    .set('Origin', origin)
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .set('Idempotency-Key', 'cash')
    .send(input)
    .expect(403)
  expect(evidence).not.toHaveBeenCalled()
  const post = () =>
    request(root)
      .post(path)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', f.admin.cookie)
      .set('X-CSRF-Token', f.admin.csrf)
      .set('Idempotency-Key', 'cash')
      .send(input)
  const first = await post().expect(200),
    second = await post().expect(200)
  expect(first.body.data).toEqual(second.body.data)
  expect(first.body.data).toMatchObject({
    sourceKind: 'cod_manual',
    merchandiseAllocatedPoisha: input.amountPoisha,
    correctionAllocatedPoisha: 0,
    unassignedAllocatedPoisha: 0,
    merchandiseRefundHeldPoisha: 0,
    correctionRefundCompletedPoisha: 0,
  })
  expect(first.body.data).not.toHaveProperty('evidenceDigest')
  expect(evidence).toHaveBeenCalledTimes(1)
})

it('Package A HTTP: canonical payment filter precedes pagination and cancellation routes share composition', async () => {
  const f = await lifecycleFixture(),
    { root } = packageARoot(f)
  await initializeCancellationPersistence(context.db.connection)
  await packageAPost(root, f, 'confirmed').expect(200)
  await f.cash()
  const pending = await lifecycleFixture()
  const list = await request(root)
    .get('/api/v1/admin/orders?paymentStatus=paid&pageSize=1')
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(list.body.data.map((r: { id: string }) => r.id)).toContain(f.id)
  expect(list.body.meta.totalItems).toBe(1)
  await request(root)
    .get('/api/v1/admin/orders?paymentStatus=pending')
    .set('Cookie', f.admin.cookie)
    .expect(200)
    .expect((r) => expect(r.body.data.map((row: { id: string }) => row.id)).toEqual([pending.id]))
  await request(root)
    .get('/api/v1/admin/cancellation-requests')
    .set('Cookie', f.admin.cookie)
    .expect(200)
})

it('Package A HTTP: composed paid cancellation reserves real obligations and exposes customer history', async () => {
  const f = await fundedCancellationFixture()
  const routers = composeOrderOperationsRoutes(
    context.db.connection,
    { ...localReviewAuth(), guestAccounts: undefined },
    origin,
    {
      approvedDeadline: async () => {},
      cashEvidence: async () => {
        throw new ApiError('SERVICE_UNAVAILABLE')
      },
      cancellationRefund: f.refund,
    },
    () => context.now,
  )
  const root = createApp({ apiRouter: createApiRouter(undefined, routers) })
  const asked = await f.ask()
  const decision = () =>
    request(root)
      .post(`/api/v1/admin/cancellation-requests/${asked.id}/decision`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', f.admin.cookie)
      .set('X-CSRF-Token', f.admin.csrf)
      .set('Idempotency-Key', 'package-a-funded')
      .send({ decision: 'approve', reason: 'Synthetic funded review' })
  await decision().expect(200)
  await decision().expect(200)
  const detail = await request(root)
    .get(`/api/v1/admin/orders/${f.id}`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(detail.body.data.fulfillmentStatus).toBe('cancelled')
  expect(detail.body.data.paymentSummary.merchandiseRefundHeldPoisha).toBe(f.amount)
  expect(
    detail.body.data.allocationSummary.items.every(
      (i: { status: string }) => i.status === 'released',
    ),
  ).toBe(true)
  const orders = await request(root).get('/api/v1/orders').set('Cookie', f.who.cookie).expect(200)
  expect(orders.body.data.some((o: { id: string }) => o.id === f.id)).toBe(true)
  const other = await customer()
  await request(root).get(`/api/v1/orders/${f.id}`).set('Cookie', other.cookie).expect(404)
  expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(1)
})

it('Package A HTTP: unprovisioned cancellation persistence returns unavailable without activation or effects', async () => {
  const f = await lifecycleFixture(),
    { root } = packageARoot(f)
  if (await context.db.connection.db?.listCollections({ name: 'cancellationRequests' }).hasNext())
    await context.db.connection.dropCollection('cancellationRequests')
  await request(root)
    .get('/api/v1/admin/cancellation-requests')
    .set('Cookie', f.admin.cookie)
    .expect(503)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('pending')
  await initializeCancellationPersistence(context.db.connection)
})

it('Package A HTTP: actual application composition installs operations explicitly and refuses missing admission', async () => {
  const config = loadEnvironment({ ...identityEnvironment(), CUSTOMER_ORDER_READ_ENABLED: 'true' })
  const dependencies = {
    approvedDeadline: async () => {
      throw new ApiError('SERVICE_UNAVAILABLE')
    },
    cashEvidence: async () => {
      throw new ApiError('SERVICE_UNAVAILABLE')
    },
    cancellationRefund: async () => {
      throw new ApiError('SERVICE_UNAVAILABLE')
    },
  }
  const make = (enabled: boolean) =>
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
      enabled ? dependencies : undefined,
    )
  const active = await make(true),
    inactive = await make(false)
  await request(active).get('/api/v1/admin/orders').expect(401)
  await request(active).get('/api/v1/admin/cancellation-requests').expect(401)
  await request(inactive).get('/api/v1/admin/orders').expect(404)
  const invalid = { ...config, CUSTOMER_ORDER_READ_ENABLED: false }
  await expect(
    composeApplication(
      context.db.connection,
      invalid,
      { isReady: async () => true },
      createLogger(config, () => {}),
      undefined,
      [],
      undefined,
      [],
      undefined,
      undefined,
      dependencies,
    ),
  ).rejects.toThrow('Reviewed order operations require')
})

it('Package A HTTP: cash evidence binding failure, invalid body and customer credentials create no receipt', async () => {
  const f = await lifecycleFixture(),
    verifier = vi.fn(async (input: Parameters<typeof f.proof>[0]) => ({
      ...f.proof(input),
      amountPoisha: 1,
    })),
    { root } = packageARoot(f, true, verifier)
  await packageAPost(root, f, 'confirmed').expect(200)
  const path = `/api/v1/admin/payments/${f.payment._id}/cod-collections`
  const input = {
    amountPoisha: f.payment.expectedPoisha,
    collectionReference: 'bad-proof',
    evidenceRef: 'synthetic:bad-proof',
    reason: 'Synthetic mismatch',
  }
  const post = (data: object, cookie = f.admin.cookie) =>
    request(root)
      .post(path)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', f.admin.csrf)
      .set('Idempotency-Key', 'bad-proof')
      .send(data)
  await post({ ...input, paymentStatus: 'paid' }).expect(400)
  expect(verifier).not.toHaveBeenCalled()
  const buyer = await customer()
  await post(input, buyer.cookie).expect(403)
  expect(verifier).not.toHaveBeenCalled()
  await post(input)
    .expect(422)
    .expect((r) => expect(r.body.error.code).toBe('BUSINESS_RULE_VIOLATION'))
  expect(
    await paymentRecordModels(context.db.connection).collections.countDocuments({
      paymentId: f.payment._id,
    }),
  ).toBe(0)
})

it('Package A protected authorities: configured original receipt verifies through composed COD HTTP', async () => {
  const f = await lifecycleFixture(),
    root = await mkdtemp(join(tmpdir(), 'sportzone-http-proof-'))
  try {
    const artifactPath = join(root, 'original.txt'),
      cashReceiptFile = join(root, 'receipts.json')
    const bytes = 'SYNTHETIC LOCAL RECEIPT - NOT ACTUAL CASH'
    await writeFile(artifactPath, bytes, { mode: 0o600 })
    const row = {
      paymentId: f.payment._id.toHexString(),
      amountPoisha: f.payment.expectedPoisha,
      collectionReference: 'protected-original',
      evidenceRef: 'synthetic:protected-original',
      collectedAt: context.now.toISOString(),
      verifiedAt: context.now.toISOString(),
      verifiedBy: 'Synthetic operator',
      artifactPath,
      digest: createHash('sha256').update(bytes).digest('hex'),
    }
    await writeFile(cashReceiptFile, JSON.stringify({ version: 1, receipts: [row] }), {
      mode: 0o600,
    })
    const captured = deadline().snapshotForCheckout(),
      { capturedAt, ...manifest } = captured
    void capturedAt
    const dependencies = configuredOrderOperations(
      context.db.connection,
      { deadline: manifest, cashReceiptFile, cancellationAuthorizations: [] },
      () => context.now,
    )
    const routers = composeOrderOperationsRoutes(
      context.db.connection,
      { ...localReviewAuth(), guestAccounts: undefined },
      origin,
      dependencies,
      () => context.now,
    )
    const app = createApp({ apiRouter: createApiRouter(undefined, routers) })
    await packageAPost(app, f, 'confirmed').expect(200)
    const input = {
      amountPoisha: row.amountPoisha,
      collectionReference: row.collectionReference,
      evidenceRef: row.evidenceRef,
      reason: 'Synthetic operator original verification',
    }
    const post = () =>
      request(app)
        .post(`/api/v1/admin/payments/${f.payment._id}/cod-collections`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', f.admin.cookie)
        .set('X-CSRF-Token', f.admin.csrf)
        .set('Idempotency-Key', 'protected-source')
        .send(input)
    const first = await post().expect(200)
    expect(first.body.data.amountPoisha).toBe(row.amountPoisha)
    await rm(artifactPath)
    // Replay returns the immutable prior collection without reopening or resubmitting evidence.
    await post().expect(200)
    expect(
      await paymentRecordModels(context.db.connection).collections.countDocuments({
        paymentId: f.payment._id,
      }),
    ).toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('Package A protected authorities: real server startup loads operator configuration and protects runtime HTTP', async () => {
  const f = await lifecycleFixture(),
    root = await mkdtemp(join(tmpdir(), 'sportzone-startup-authority-'))
  const originalEnvironment = process.env
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    const cash = join(root, 'cash.json'),
      policy = join(root, 'policy.json'),
      delivery = join(root, 'delivery.json')
    const { capturedAt, ...manifest } = deadline().snapshotForCheckout()
    void capturedAt
    await writeFile(cash, JSON.stringify({ version: 1, receipts: [] }), { mode: 0o600 })
    await writeFile(policy, JSON.stringify({ version: 1, authorizations: [] }), { mode: 0o600 })
    await writeFile(delivery, JSON.stringify(manifest), { mode: 0o600 })
    const env = {
      ...identityEnvironment(),
      SESSION_SECRET: authSecret,
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
      CUSTOMER_ORDER_READ_ENABLED: 'true',
      ORDER_OPERATIONS_ENABLED: 'true',
      DELIVERY_DEADLINE_POLICY_FILE: delivery,
      COD_COLLECTION_EVIDENCE_FILE: cash,
      CANCELLATION_REFUND_AUTHORIZATIONS_FILE: policy,
    }
    // Only synthetic local configuration is visible to this startup; no host provider settings.
    process.env = { ...env }
    const config = { ...loadEnvironment(env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server).get('/api/v1/admin/orders').expect(401)
    await request(runtime.server)
      .get(`/api/v1/admin/orders/${f.id}`)
      .set('Cookie', f.admin.cookie)
      .expect(200)
    await request(runtime.server)
      .post(`/api/v1/admin/orders/${f.id}/fulfillment-transitions`)
      .set('Origin', 'https://admin.example.test')
      .set('Cookie', f.admin.cookie)
      .set('X-CSRF-Token', f.admin.csrf)
      .set('Idempotency-Key', 'startup-confirm')
      .send({ to: 'confirmed', reason: 'Synthetic configured registry proof' })
      .expect(200)
  } finally {
    await runtime?.close()
    process.env = originalEnvironment
    await rm(root, { recursive: true, force: true })
  }
})

it('Package A protected authorities: cancellation policy is request-bound and reserves funded liability once', async () => {
  const f = await fundedCancellationFixture(),
    asked = await f.ask()
  const directory = await mkdtemp(join(tmpdir(), 'sportzone-cancel-authority-'))
  try {
    const cashReceiptFile = join(directory, 'cash.json')
    await writeFile(cashReceiptFile, JSON.stringify({ version: 1, receipts: [] }), { mode: 0o600 })
    const { capturedAt, ...manifest } = deadline().snapshotForCheckout()
    void capturedAt
    const root = (requestId: string) =>
      createApp({
        apiRouter: createApiRouter(
          undefined,
          composeOrderOperationsRoutes(
            context.db.connection,
            { ...localReviewAuth(), guestAccounts: undefined },
            origin,
            configuredOrderOperations(
              context.db.connection,
              {
                deadline: manifest,
                cashReceiptFile,
                cancellationAuthorizations: [
                  {
                    orderId: f.id,
                    requestId,
                    evidenceRef: 'synthetic:request-policy',
                    approvedBy: 'Synthetic operator',
                    approvedAt: context.now.toISOString(),
                    approval: {
                      policyVersion: 'synthetic-cancellation',
                      method: 'manual_bank',
                      consentRequired: false,
                      deliveryApproved: true,
                    },
                  },
                ],
              },
              () => context.now,
            ),
            () => context.now,
          ),
        ),
      })
    const post = (app: ReturnType<typeof createApp>) =>
      request(app)
        .post(`/api/v1/admin/cancellation-requests/${asked.id}/decision`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', f.admin.cookie)
        .set('X-CSRF-Token', f.admin.csrf)
        .set('Idempotency-Key', 'configured-cancellation')
        .send({ decision: 'approve', reason: 'Synthetic approved original policy' })
    await post(root('0'.repeat(24))).expect(503)
    expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(0)
    const active = root(asked.id)
    await post(active).expect(200)
    await post(active).expect(200)
    expect(await refundModel(context.db.connection).countDocuments({ orderId: f.id })).toBe(1)
    expect(
      (await paymentModel(context.db.connection).findById(f.payment._id).orFail())
        .merchandiseRefundHeldPoisha,
    ).toBe(f.amount)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('Package A prepaid timing: actual verified collection anchors confirmation commitment and customer handover projection', async () => {
  const f = await processingFixture(false, undefined, true)
  context.now = new Date(context.now.getTime() + 1000)
  f.change({ tran_date: context.now.toISOString() })
  await f.processor().process(f.claim)
  const fullyPaidAt = context.now.toISOString()
  context.now = new Date(context.now.getTime() + 1000)
  const admin = await customer('admin')
  const lifecycle = createOrderLifecycleService(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    fulfillmentPaymentAccess(context.db.connection, () => context.now),
    createFulfillmentAllocationService(
      composeFulfillmentAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    composeAuditAccess(context.db.connection),
    composeOrderLifecycleDependencies(context.db.connection),
    async () => {},
    () => context.now,
  )
  const collections = paymentRecordModels(context.db.connection).collections
  const original = await collections.findOne({ orderId: f.result.id }).lean().orFail()
  const beforeRevision = (
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()
  ).revision
  await collections.collection.deleteOne({ _id: original._id })
  await expect(
    lifecycle.transition(
      admin.credentials.customerToken,
      f.result.id,
      { to: 'confirmed', reason: 'Synthetic verified prepaid rule' },
      'prepaid-confirm',
    ),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  expect(
    (await orderModels(context.db.connection).orders.findById(f.result.id).orFail())
      .fulfillmentStatus,
  ).toBe('pending')
  expect(
    (await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()).revision,
  ).toBe(beforeRevision)
  await collections.collection.insertOne(original)
  await lifecycle.transition(
    admin.credentials.customerToken,
    f.result.id,
    { to: 'confirmed', reason: 'Synthetic verified prepaid rule' },
    'prepaid-confirm',
  )
  const order = await orderModels(context.db.connection).orders.findById(f.result.id).orFail()
  expect(order.deliveryCommitment.fullyPaidAt?.toISOString()).toBe(fullyPaidAt)
  expect(order.deliveryCommitment.effectiveDeadlineAt?.toISOString()).toBe(
    new Date(order.placedAt.getTime() + 5 * 86400000).toISOString(),
  )
  const customers = createCustomerAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
  const reads = createOrderReadService(
    context.db.connection,
    customers,
    orderScopeAccess(customers, context.sessions),
    customerPaymentSummaryAccess(context.db.connection),
    orderPolicySnapshotAccess(context.db.connection),
    composeOrderReadDependencies(),
    () => context.now,
  )
  const detail = await reads.read(f.who.credentials, f.result.id)
  expect(detail.deliveryDeadline).toMatchObject({
    handoverStatus: 'pending',
    handoverDeadlineAt: new Date(Date.parse(fullyPaidAt) + 48 * 3600000).toISOString(),
  })
})

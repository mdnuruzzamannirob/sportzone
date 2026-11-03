import { Types } from 'mongoose'
import request from 'supertest'
import { createAuthQuotaStore } from '../../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../../src/modules/auth/sessions/auth-throttle.service.js'
import { createReturnReceiptService } from '../../../src/modules/inventory/inventory.service.js'
import { initializeMediaPersistence } from '../../../src/modules/media/media.persistence.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  claimQuantityAccess,
  claimRestockAccess,
  claimReviewQuantityAccess,
} from '../../../src/modules/orders/order.service.js'
import { initializeReturnPersistence } from '../../../src/modules/returns/return.persistence.js'
import {
  createReturnLifecycleService,
  createReturnPhysicalService,
  createReturnService,
} from '../../../src/modules/returns/return.service.js'
import { createApiRouter } from '../../../src/routes.js'
import { composeAuditAccess, composeReturnOperationsRoutes } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { fakeMediaProvider, mediaPolicy, png } from '../media.js'
import { authSecret, context, customer, origin } from './base.js'
import { lifecycleFixture } from './orders.js'
import { deliveredReviewFixture, localReviewAuth } from './reviews.js'

async function physicalReturnFixture(
  type: 'physical_return' | 'shortage' = 'physical_return',
  prepare = true,
  registered = false,
) {
  await initializeReturnPersistence(context.db.connection)
  const f = await lifecycleFixture(true, registered)
  for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) await f.move(status)
  const order = await orderModels(context.db.connection).orders.findById(f.id).orFail(),
    item = order.items[0]
  if (!item) throw new Error('Missing fixture item')
  const claimId = new Types.ObjectId().toHexString(),
    itemId = item.id.toHexString()
  const create = createReturnService(
    context.db.connection,
    claimQuantityAccess(context.db.connection),
    async () => ({
      requestedBy: { type: 'guest', id: new Types.ObjectId().toHexString() },
      eligibilitySnapshot: { policyVersion: 'synthetic' },
    }),
    composeAuditAccess(context.db.connection),
  )
  await inTransaction(context.db.connection, (session) =>
    create.create(session, {
      claimId,
      orderId: f.id,
      claimType: type,
      items: [{ orderItemId: itemId, quantity: 2, reason: 'Synthetic' }],
    }),
  )
  let ticks = Date.now() + 10000
  const clock = () => new Date(ticks++)
  const review = createReturnLifecycleService(
    context.db.connection,
    f.adminAccess,
    claimReviewQuantityAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    clock,
  )
  if (prepare) {
    await review.transition(f.token, claimId, { to: 'under_review', reason: 'Review' }, 'review')
    await review.transition(
      f.token,
      claimId,
      { to: 'approved', reason: 'Approved', approvedItems: [{ orderItemId: itemId, quantity: 2 }] },
      'approve',
    )
  }
  if (prepare && type === 'physical_return')
    await review.transition(
      f.token,
      claimId,
      { to: 'awaiting_return', reason: 'Awaiting' },
      'await',
    )
  const physical = createReturnPhysicalService(
    context.db.connection,
    f.adminAccess,
    claimRestockAccess(context.db.connection),
    createReturnReceiptService(context.db.connection, clock),
    composeAuditAccess(context.db.connection),
    clock,
  )
  const receive = (key = 'receipt') =>
    physical.receive(
      f.token,
      claimId,
      {
        receiptReference: 'synthetic-reference',
        reason: 'Received',
        items: [{ orderItemId: itemId, quantity: 2 }],
      },
      key,
    )
  const inspect = (key = 'inspection', resellableQty = 1) =>
    physical.inspect(
      f.token,
      claimId,
      {
        reason: 'Inspected',
        items: [{ orderItemId: itemId, acceptedQty: 2, resellableQty, reason: 'One resellable' }],
      },
      key,
    )
  return { ...f, claimId, itemId, review, physical, receive, inspect }
}

async function packageBFixture(deliver = true) {
  await initializeReturnPersistence(context.db.connection)
  await initializeMediaPersistence(context.db.connection)
  const f = await deliveredReviewFixture(deliver),
    administrator = await customer('admin')
  context.now = new Date(Date.now() + 1000)
  const provider = fakeMediaProvider()
  const make = (
    exceptions: {
      orderId: string
      claimType: 'physical_return' | 'shortage'
      exceptionBasis: string
    }[] = [],
  ) => {
    const auth = {
      ...localReviewAuth(),
      guestAccounts: undefined,
      throttle: createAuthThrottle(createAuthQuotaStore(context.db.connection), authSecret),
    }
    const routers = composeReturnOperationsRoutes(
      context.db.connection,
      auth,
      origin,
      { policyVersion: 'sportzone-returns-v1', exceptions },
      {
        provider: provider.adapter,
        scanner: async () => 'clean',
        policy: mediaPolicy,
        canDelete: async () => true,
      },
      () => context.now,
    )
    return createApp({ apiRouter: createApiRouter(undefined, routers), mediaUploadsEnabled: true })
  }
  const root = make(),
    orderItemId = f.selection.qualifyingOrderItemId
  const body = (claimType: 'physical_return' | 'shortage' = 'physical_return', quantity = 2) => ({
    claimType,
    description: 'Synthetic claim description',
    items: [{ orderItemId, quantity, reason: 'Synthetic wrong/damaged item' }],
  })
  const submit = (input: object = body(), key = 'package-b-request') =>
    request(root)
      .post(`/api/v1/orders/${f.orderId}/claims`)
      .set('Origin', origin)
      .set('Cookie', f.buyer.cookie)
      .set('X-CSRF-Token', f.buyer.csrf)
      .set('Idempotency-Key', key)
      .send(input)
  const admin = (id: string, operation: string, input: object, key = operation) =>
    request(root)
      .post(`/api/v1/admin/claims/${id}/${operation}`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', administrator.cookie)
      .set('X-CSRF-Token', administrator.csrf)
      .set('Idempotency-Key', key)
      .send(input)
  const approve = (id: string) =>
    admin(id, 'review', {
      decision: 'approve',
      approvedItems: [{ orderItemId, quantity: 2 }],
      reason: 'Synthetic approve',
    })
  const upload = (cookie = f.buyer.cookie, csrf = f.buyer.csrf, item = orderItemId) =>
    request(root)
      .post(`/api/v1/orders/${f.orderId}/claims/evidence-uploads`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .field('claimType', 'physical_return')
      .field('orderItemIds[]', item)
      .attach('file', png, { filename: 'synthetic.png', contentType: 'image/png' })
  return {
    ...f,
    root,
    make,
    provider,
    administrator,
    orderItemId,
    body,
    submit,
    admin,
    approve,
    upload,
  }
}

export { packageBFixture, physicalReturnFixture }

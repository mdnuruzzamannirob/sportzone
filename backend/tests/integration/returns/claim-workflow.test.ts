import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it } from 'vitest'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import {
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { createAuthQuotaStore } from '../../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../../src/modules/auth/sessions/auth-throttle.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { createReturnReceiptService } from '../../../src/modules/inventory/inventory.service.js'
import { claimEvidenceMetadataAccess } from '../../../src/modules/media/attachment.service.js'
import { initializeMediaPersistence } from '../../../src/modules/media/media.persistence.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  claimQuantityAccess,
  claimRestockAccess,
  complaintOrderAccess,
  guestOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import { returnModel } from '../../../src/modules/returns/return.model.js'
import { initializeReturnPersistence } from '../../../src/modules/returns/return.persistence.js'
import { createReturnHistoryRoutes } from '../../../src/modules/returns/return.routes.js'
import {
  createReturnHistoryService,
  createReturnPhysicalService,
  createReturnService,
} from '../../../src/modules/returns/return.service.js'
import { createApiRouter } from '../../../src/routes.js'
import { composeAuditAccess, composeReturnOperationsRoutes } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { sessionHttpFor } from '../../helpers/auth.js'
import {
  authSecret,
  context,
  customer,
  origin,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { lifecycleFixture } from '../../helpers/commerce/orders.js'
import { packageBFixture, physicalReturnFixture } from '../../helpers/commerce/returns.js'
import { deliveredReviewFixture, localReviewAuth } from '../../helpers/commerce/reviews.js'
import { createContractCheckedApp as createApp } from '../../helpers/contracts.js'
import { fakeMediaProvider, mediaPolicy, png } from '../../helpers/media.js'

registerCommerceFixture()

it('claim history local: scoped guest sees only its own claim and invalid customer credentials never downgrade', async () => {
  const f = await physicalReturnFixture('shortage'),
    other = await physicalReturnFixture('shortage')
  const customers = createCustomerAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
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
    guests.issueAfterProof(session, f.id),
  )
  const service = createReturnHistoryService(
    context.db.connection,
    orderScopeAccess(customers, context.sessions, guests),
    complaintOrderAccess(context.db.connection),
    claimEvidenceMetadataAccess(context.db.connection),
  )
  const app = createApp({
    apiRouter: createReturnHistoryRoutes(
      service,
      context.security,
      sessionHttpFor(context.sessions),
    ),
  })
  const cookie = `sz_guest_order_sid=${proof.token}`
  const list = await request(app)
    .get(`/api/v1/orders/${f.id}/claims`)
    .set('Cookie', cookie)
    .expect(200)
  expect(list.body.data).toHaveLength(1)
  expect(list.body.data[0]).toMatchObject({ id: f.claimId, orderId: f.id, evidence: [] })
  for (const field of ['requestedBy', 'eligibilitySnapshot', 'protectedUnitOrdinals'])
    expect(list.body.data[0]).not.toHaveProperty(field)
  await request(app).get(`/api/v1/claims/${f.claimId}`).set('Cookie', cookie).expect(200)
  await request(app).get(`/api/v1/orders/${f.id}/claims`).expect(401)
  await request(app).get(`/api/v1/orders/${other.id}/claims`).set('Cookie', cookie).expect(401)
  await request(app).get(`/api/v1/claims/${other.claimId}`).set('Cookie', cookie).expect(404)
  await request(app)
    .get(`/api/v1/claims/${f.claimId}`)
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .expect(401)
})

it('claim history local: admin queue and detail require an active admin and redact internal evidence', async () => {
  const f = await physicalReturnFixture('shortage')
  const customers = createCustomerAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
  const history = createReturnHistoryService(
    context.db.connection,
    orderScopeAccess(customers, context.sessions),
    complaintOrderAccess(context.db.connection),
    claimEvidenceMetadataAccess(context.db.connection),
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
  )
  const app = createApp({
    apiRouter: createReturnHistoryRoutes(
      history,
      context.security,
      sessionHttpFor(context.sessions),
    ),
  })
  const adminCookie = `sz_admin_sid=${f.token}`
  const list = await request(app)
    .get('/api/v1/admin/claims?claimType=shortage&status=approved&pageSize=1')
    .set('Cookie', adminCookie)
    .expect(200)
  expect(list.body.data).toHaveLength(1)
  expect(list.body.data[0]).toMatchObject({ id: f.claimId, status: 'approved' })
  const detail = await request(app)
    .get(`/api/v1/admin/claims/${f.claimId}`)
    .set('Cookie', adminCookie)
    .expect(200)
  expect(detail.body.data.eligibility).toEqual({ policyVersion: 'synthetic' })
  expect(detail.body.data).not.toHaveProperty('requestedBy')
  expect(detail.body.data).not.toHaveProperty('eligibilitySnapshot')
  const other = await customer()
  await request(app).get('/api/v1/admin/claims').set('Cookie', other.cookie).expect(401)
  await request(app).get(`/api/v1/admin/claims/${f.claimId}`).expect(401)
  await request(app)
    .get('/api/v1/admin/claims?status=unknown')
    .set('Cookie', adminCookie)
    .expect(400)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(app).get('/api/v1/admin/claims').set('Cookie', adminCookie).expect(401)
})

it('physical return local: audit failure rolls back stock, unit fence, movement and inspection', async () => {
  const f = await physicalReturnFixture(),
    variants = productModels(context.db.connection).variants
  await f.receive()
  const before = (await variants.findById(f.selected.row._id).orFail()).stock.physical
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(f.inspect()).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect((await variants.findById(f.selected.row._id).orFail()).stock.physical).toBe(before)
  expect((await returnModel(context.db.connection).findById(f.claimId).orFail()).status).toBe(
    'received',
  )
  expect(
    await context.db.connection
      .collection('inventoryMovements')
      .countDocuments({ type: 'return_receipt', orderId: new Types.ObjectId(f.id) }),
  ).toBe(0)
  expect(
    (
      await orderModels(context.db.connection).balances.findOne({ orderId: f.id }).orFail()
    ).unitCoverage.every((u) => !u.restockOperationKey),
  ).toBe(true)
  await f.inspect()
})

it('physical return local: invalid quantities and unauthorized admin do not change stock', async () => {
  const f = await physicalReturnFixture(),
    variants = productModels(context.db.connection).variants
  const before = (await variants.findById(f.selected.row._id).orFail()).stock.physical
  await expect(
    f.physical.receive(
      undefined,
      f.claimId,
      { receiptReference: 'x', reason: 'x', items: [{ orderItemId: f.itemId, quantity: 2 }] },
      'no-auth',
    ),
  ).rejects.toThrow()
  await expect(
    f.physical.receive(
      f.token,
      f.claimId,
      { receiptReference: 'x', reason: 'x', items: [{ orderItemId: f.itemId, quantity: 3 }] },
      'too-many',
    ),
  ).rejects.toThrow()
  await f.receive()
  await expect(f.inspect('bad', 3)).rejects.toThrow()
  expect((await variants.findById(f.selected.row._id).orFail()).stock.physical).toBe(before)
})

it('physical return local: partial receipt and zero resellable quantity preserve unreturned units', async () => {
  const f = await physicalReturnFixture(),
    variants = productModels(context.db.connection).variants
  const before = (await variants.findById(f.selected.row._id).orFail()).stock.physical
  const input = {
    receiptReference: 'partial',
    reason: 'Received one',
    items: [{ orderItemId: f.itemId, quantity: 1 }],
  }
  await f.physical.receive(f.token, f.claimId, input, 'partial-receipt')
  await expect(
    f.physical.receive(
      f.token,
      f.claimId,
      { ...input, receiptReference: 'different' },
      'partial-receipt',
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  await f.physical.inspect(
    f.token,
    f.claimId,
    {
      reason: 'Not resellable',
      items: [{ orderItemId: f.itemId, acceptedQty: 1, resellableQty: 0, reason: 'Damaged' }],
    },
    'partial-inspection',
  )
  const claim = await returnModel(context.db.connection).findById(f.claimId).orFail()
  expect(claim.items[0]?.approvedUnitOrdinals).toHaveLength(2)
  expect(claim.items[0]?.receivedUnitOrdinals).toHaveLength(1)
  expect(claim.items[0]?.acceptedUnitOrdinals).toHaveLength(1)
  expect(claim.items[0]?.resellableUnitOrdinals).toEqual([])
  expect((await variants.findById(f.selected.row._id).orFail()).stock.physical).toBe(before)
  expect(
    (await orderModels(context.db.connection).balances.findOne({ orderId: f.id }).orFail())
      .activeClaimQty,
  ).toBe(2)
})

it('physical return local: downstream failure after movement rolls back stock and ordinal fence', async () => {
  const f = await physicalReturnFixture(),
    variants = productModels(context.db.connection).variants
  await f.receive()
  const before = (await variants.findById(f.selected.row._id).orFail()).stock.physical
  const receipt = createReturnReceiptService(context.db.connection)
  const failing = createReturnPhysicalService(
    context.db.connection,
    f.adminAccess,
    claimRestockAccess(context.db.connection),
    async (session, input) => {
      await receipt(session, input)
      throw new Error('Synthetic downstream failure')
    },
    composeAuditAccess(context.db.connection),
    () => new Date(Date.now() + 20000),
  )
  await expect(
    failing.inspect(
      f.token,
      f.claimId,
      {
        reason: 'Inspect',
        items: [{ orderItemId: f.itemId, acceptedQty: 2, resellableQty: 1, reason: 'Resellable' }],
      },
      'failure',
    ),
  ).rejects.toThrow('Synthetic downstream failure')
  expect((await variants.findById(f.selected.row._id).orFail()).stock.physical).toBe(before)
  expect(
    await context.db.connection
      .collection('inventoryMovements')
      .countDocuments({ type: 'return_receipt', orderId: new Types.ObjectId(f.id) }),
  ).toBe(0)
  expect(
    (
      await orderModels(context.db.connection).balances.findOne({ orderId: f.id }).orFail()
    ).unitCoverage.every((u) => !u.restockOperationKey),
  ).toBe(true)
  expect((await returnModel(context.db.connection).findById(f.claimId).orFail()).status).toBe(
    'received',
  )
  await f.inspect()
})

it('claim history local: customer ownership is enforced on list and nested detail', async () => {
  await initializeReturnPersistence(context.db.connection)
  const f = await deliveredReviewFixture(),
    other = await customer()
  const claimId = new Types.ObjectId().toHexString()
  const create = createReturnService(
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
      items: [{ orderItemId: f.selection.qualifyingOrderItemId, quantity: 1, reason: 'Synthetic' }],
    }),
  )
  const accounts = createCustomerAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
  const history = createReturnHistoryService(
    context.db.connection,
    orderScopeAccess(accounts, context.sessions),
    complaintOrderAccess(context.db.connection),
    claimEvidenceMetadataAccess(context.db.connection),
  )
  const app = createApp({
    apiRouter: createReturnHistoryRoutes(
      history,
      context.security,
      sessionHttpFor(context.sessions),
    ),
  })
  await request(app)
    .get(`/api/v1/orders/${f.orderId}/claims`)
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  await request(app).get(`/api/v1/claims/${claimId}`).set('Cookie', f.buyer.cookie).expect(200)
  await request(app)
    .get(`/api/v1/orders/${f.orderId}/claims`)
    .set('Cookie', other.cookie)
    .expect(404)
  await request(app).get(`/api/v1/claims/${claimId}`).set('Cookie', other.cookie).expect(404)
})

it('Package B HTTP: eligibility, canonical submission and historical replay preserve one claim', async () => {
  const f = await packageBFixture()
  const eligibility = await request(f.root)
    .get(`/api/v1/orders/${f.orderId}/claim-eligibility`)
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  expect(eligibility.body.data.eligibleTypes).toEqual(['physical_return', 'shortage'])
  expect(eligibility.body.data.policyVersion).toBe('sportzone-returns-v1')
  const first = await f.submit().expect(201),
    repeated = await f.submit().expect(201)
  expect(repeated.body.data.id).toBe(first.body.data.id)
  expect(first.body.data.description).toBe('Synthetic claim description')
  await f.submit(f.body('shortage')).expect(409)
  await f.submit(f.body(), 'different-key').expect(422)
  expect(await returnModel(context.db.connection).countDocuments({ orderId: f.orderId })).toBe(1)
})

it('Package B HTTP: current owner, Origin/CSRF, strict body and request keys gate claims', async () => {
  const f = await packageBFixture(),
    other = await customer()
  await request(f.root)
    .get(`/api/v1/orders/${f.orderId}/claim-eligibility`)
    .set('Cookie', other.cookie)
    .expect(404)
  await request(f.root)
    .post(`/api/v1/orders/${f.orderId}/claims`)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('Idempotency-Key', 'csrf-check')
    .send(f.body())
    .expect(403)
  await request(f.root)
    .post(`/api/v1/orders/${f.orderId}/claims`)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .send(f.body())
    .expect(400)
  await f.submit({ ...f.body(), amountPoisha: 1 }).expect(400)
  expect(await returnModel(context.db.connection).countDocuments()).toBe(0)
})

it('Package B HTTP: undelivered, expired standard return and protected exception have distinct results', async () => {
  const undelivered = await packageBFixture(false)
  await undelivered.submit().expect(422)
  const f = await packageBFixture()
  context.now = new Date(context.now.getTime() + 8 * 86400000)
  await f.submit().expect(422)
  const root = f.make([
    {
      orderId: f.orderId,
      claimType: 'physical_return',
      exceptionBasis: 'Synthetic protected rights review',
    },
  ])
  await request(root)
    .post(`/api/v1/orders/${f.orderId}/claims`)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .set('Idempotency-Key', 'exception')
    .send(f.body())
    .expect(201)
})

it('Package B HTTP: multiple partial receipts/inspections restore each resellable ordinal once', async () => {
  const f = await packageBFixture(),
    created = await f.submit().expect(201),
    id = created.body.data.id
  await f.approve(id).expect(200)
  const base = (
    await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail()
  ).stock.physical
  const receive = (reference: string, key: string) =>
    f.admin(
      id,
      'receipt',
      { receivedItems: [{ orderItemId: f.orderItemId, quantity: 1 }], receiptReference: reference },
      key,
    )
  const inspect = (key: string) =>
    f.admin(
      id,
      'inspection',
      {
        items: [
          {
            orderItemId: f.orderItemId,
            acceptedQty: 1,
            resellableQty: 1,
            reason: 'Synthetic resellable',
          },
        ],
      },
      key,
    )
  await inspect('before-receipt').expect(409)
  await receive('parcel-1', 'receipt-1').expect(200)
  await receive('parcel-1', 'different-receipt-key').expect(200)
  await receive('changed-parcel', 'different-receipt-key').expect(409)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock.physical,
  ).toBe(base)
  await inspect('inspect-1').expect(200)
  await f.admin(id, 'complete', {}).expect(422)
  await receive('parcel-2', 'receipt-2').expect(200)
  await inspect('inspect-2').expect(200)
  await inspect('inspect-2').expect(200)
  const done = await f.admin(id, 'complete', {}).expect(200)
  await f.admin(id, 'complete', {}).expect(200)
  expect(done.body.data.status).toBe('completed')
  expect(done.body.data.items[0]).toMatchObject({
    receivedQty: 2,
    inspectedQty: 2,
    acceptedQty: 2,
    resellableQty: 2,
  })
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock.physical,
  ).toBe(base + 2)
  expect(
    (await orderModels(context.db.connection).balances.findOne({ orderId: f.orderId }).orFail())
      .resolvedClaimQty,
  ).toBe(2)
  expect(
    (await orderModels(context.db.connection).balances.findOne({ orderId: f.orderId }).orFail())
      .activeClaimQty,
  ).toBe(0)
  expect(
    await context.db.connection.collection('inventoryMovements').countDocuments({
      type: 'return_receipt',
      orderId: new Types.ObjectId(f.orderId),
    }),
  ).toBe(2)
})

it('Package B HTTP: rejected inspected units release safely and shortage never receives physical stock', async () => {
  const f = await packageBFixture(),
    created = await f.submit().expect(201),
    id = created.body.data.id
  await f.approve(id).expect(200)
  await f
    .admin(id, 'receipt', {
      receivedItems: [{ orderItemId: f.orderItemId, quantity: 2 }],
      receiptReference: 'parcel',
    })
    .expect(200)
  await f
    .admin(id, 'inspection', {
      items: [
        {
          orderItemId: f.orderItemId,
          acceptedQty: 1,
          resellableQty: 0,
          reason: 'One not accepted',
        },
      ],
    })
    .expect(200)
  await f.admin(id, 'complete', {}).expect(200)
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.orderId })
    .orFail()
  expect(balance.activeClaimQty).toBe(0)
  expect(balance.resolvedClaimQty).toBe(1)
  const shortage = await f.submit(f.body('shortage', 1), 'shortage').expect(201),
    sid = shortage.body.data.id
  await f
    .admin(sid, 'review', {
      decision: 'approve',
      approvedItems: [{ orderItemId: f.orderItemId, quantity: 1 }],
      reason: 'Synthetic shortage review',
    })
    .expect(200)
  await f
    .admin(sid, 'receipt', {
      receivedItems: [{ orderItemId: f.orderItemId, quantity: 1 }],
      receiptReference: 'invalid',
    })
    .expect(409)
  await f
    .admin(sid, 'inspection', {
      items: [
        {
          orderItemId: f.orderItemId,
          acceptedQty: 1,
          resellableQty: 1,
          reason: 'Invalid shortage inspection',
        },
      ],
    })
    .expect(409)
  await f.admin(sid, 'complete', {}).expect(200)
  expect(
    await context.db.connection.collection('inventoryMovements').countDocuments({
      type: 'return_receipt',
      orderId: new Types.ObjectId(f.orderId),
    }),
  ).toBe(0)
})

it('Package B HTTP: customer evidence is private, scope-bound and attached transactionally', async () => {
  const f = await packageBFixture(),
    other = await customer()
  await f.upload(other.cookie, other.csrf).expect(404)
  expect(f.provider.state.uploads).toBe(0)
  const uploaded = await f.upload().expect(200),
    assetId = uploaded.body.data.assetId
  expect(uploaded.body.data).not.toHaveProperty('url')
  const input = f.body()
  const evidenceInput = { ...input, items: [{ ...input.items[0], evidenceAssetIds: [assetId] }] }
  const claim = await f.submit(evidenceInput).expect(201),
    id = claim.body.data.id
  expect(claim.body.data.evidence[0].assetId).toBe(assetId)
  await request(f.root)
    .get(`/api/v1/orders/${f.orderId}/claims/evidence/${assetId}`)
    .set('Cookie', f.buyer.cookie)
    .expect(200)
  await request(f.root)
    .get(`/api/v1/orders/${f.orderId}/claims/evidence/${assetId}`)
    .set('Cookie', other.cookie)
    .expect(404)
  await request(f.root)
    .get(`/api/v1/admin/claims/${id}/evidence/${assetId}`)
    .set('Cookie', f.administrator.cookie)
    .expect(200)
  await request(f.root)
    .get(`/api/v1/admin/claims/${id}/evidence/${new Types.ObjectId()}`)
    .set('Cookie', f.administrator.cookie)
    .expect(404)
})

it('Package B HTTP: concurrent claims, receipts and inspections never overlap units or double-add stock', async () => {
  const f = await packageBFixture()
  const created = await Promise.all([f.submit(), f.submit()])
  expect(created.map((r) => r.status)).toEqual([201, 201])
  expect(created[0]?.body.data.id).toBe(created[1]?.body.data.id)
  const id = created[0]?.body.data.id
  await f.approve(id).expect(200)
  const received = await Promise.all(
    ['a', 'b'].map((key) =>
      f.admin(
        id,
        'receipt',
        {
          receiptReference: 'same-original',
          receivedItems: [{ orderItemId: f.orderItemId, quantity: 2 }],
        },
        key,
      ),
    ),
  )
  expect(received.map((r) => r.status)).toEqual([200, 200])
  const base = (
    await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail()
  ).stock.physical
  const inspected = await Promise.all(
    ['inspect-a', 'inspect-b'].map((key) =>
      f.admin(
        id,
        'inspection',
        {
          items: [
            {
              orderItemId: f.orderItemId,
              acceptedQty: 2,
              resellableQty: 2,
              reason: 'Synthetic batch',
            },
          ],
        },
        key,
      ),
    ),
  )
  expect(inspected.filter((r) => r.status === 200)).toHaveLength(1)
  expect(inspected.filter((r) => r.status === 409)).toHaveLength(1)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id).orFail())
      .stock.physical,
  ).toBe(base + 2)
})

it('Package B HTTP: unauthorized upload, unsupported file, scope substitution and temporary expiry deny exposure', async () => {
  const f = await packageBFixture()
  await f.upload(f.buyer.cookie, 'invalid').expect(403)
  await f.upload(f.buyer.cookie, f.buyer.csrf, new Types.ObjectId().toHexString()).expect(422)
  await request(f.root)
    .post(`/api/v1/orders/${f.orderId}/claims/evidence-uploads`)
    .set('Origin', origin)
    .set('Cookie', f.buyer.cookie)
    .set('X-CSRF-Token', f.buyer.csrf)
    .field('claimType', 'physical_return')
    .field('orderItemIds[]', f.orderItemId)
    .attach('file', Buffer.from('not a PNG'), { filename: 'bad.png', contentType: 'image/png' })
    .expect(400)
  const uploaded = await f.upload().expect(200),
    assetId = uploaded.body.data.assetId
  const otherOrder = await deliveredReviewFixture()
  await request(f.root)
    .get(`/api/v1/orders/${otherOrder.orderId}/claims/evidence/${assetId}`)
    .set('Cookie', otherOrder.buyer.cookie)
    .expect(403)
  context.now = new Date(context.now.getTime() + 61000)
  await request(f.root)
    .get(`/api/v1/orders/${f.orderId}/claims/evidence/${assetId}`)
    .set('Cookie', f.buyer.cookie)
    .expect(403)
})

it('Package B HTTP: exact guest proof supports claims and private evidence without customer fallback', async () => {
  await initializeReturnPersistence(context.db.connection)
  await initializeMediaPersistence(context.db.connection)
  const f = await lifecycleFixture()
  for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) await f.move(status)
  context.now = new Date(Date.now() + 1000)
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
  )
  const provider = fakeMediaProvider(),
    auth = {
      ...localReviewAuth(),
      guestAccounts: guests,
      throttle: createAuthThrottle(createAuthQuotaStore(context.db.connection), authSecret),
    }
  const root = createApp({
    apiRouter: createApiRouter(
      undefined,
      composeReturnOperationsRoutes(
        context.db.connection,
        auth,
        origin,
        { policyVersion: 'sportzone-returns-v1', exceptions: [] },
        {
          provider: provider.adapter,
          scanner: async () => 'clean',
          policy: mediaPolicy,
          canDelete: async () => true,
        },
        () => context.now,
      ),
    ),
    mediaUploadsEnabled: true,
  })
  const cookie = `sz_guest_order_sid=${proof.token}`
  const order = await orderModels(context.db.connection).orders.findById(f.id).orFail(),
    orderItemId = order.items[0]?.id.toHexString()
  await request(root)
    .get(`/api/v1/orders/${f.id}/claim-eligibility`)
    .set('Cookie', cookie)
    .expect(200)
  await request(root)
    .get(`/api/v1/orders/${new Types.ObjectId()}/claim-eligibility`)
    .set('Cookie', cookie)
    .expect(401)
  await request(root)
    .get(`/api/v1/orders/${f.id}/claim-eligibility`)
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .expect(401)
  const uploaded = await request(root)
    .post(`/api/v1/orders/${f.id}/claims/evidence-uploads`)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', proof.csrfToken)
    .field('claimType', 'physical_return')
    .field('orderItemIds[]', orderItemId ?? '')
    .attach('file', png, { filename: 'guest.png', contentType: 'image/png' })
    .expect(200)
  await request(root)
    .post(`/api/v1/orders/${f.id}/claims`)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', proof.csrfToken)
    .set('Idempotency-Key', 'guest-claim')
    .send({
      claimType: 'physical_return',
      items: [
        {
          orderItemId,
          quantity: 1,
          reason: 'Guest claim',
          evidenceAssetIds: [uploaded.body.data.assetId],
        },
      ],
    })
    .expect(201)
  await guests.logout(proof.token)
  await request(root)
    .get(`/api/v1/orders/${f.id}/claims/evidence/${uploaded.body.data.assetId}`)
    .set('Cookie', cookie)
    .expect(401)
})

it('Package B HTTP: suspended customers/admins cannot mutate or retrieve private claim evidence', async () => {
  const f = await packageBFixture(),
    created = await f.submit().expect(201),
    id = created.body.data.id
  await context.identities.users.updateOne(
    { _id: f.administrator.user._id },
    { $set: { status: 'suspended' } },
  )
  await f.approve(id).expect(403)
  await context.identities.users.updateOne(
    { _id: f.buyer.user._id },
    { $set: { status: 'suspended' } },
  )
  await request(f.root)
    .get(`/api/v1/orders/${f.orderId}/claims`)
    .set('Cookie', f.buyer.cookie)
    .expect(401)
  expect((await returnModel(context.db.connection).findById(id).orFail()).status).toBe('requested')
})

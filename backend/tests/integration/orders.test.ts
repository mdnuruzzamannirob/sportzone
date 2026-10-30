import { returnService } from '../../src/modules/returns/return.service.js'
import {
  initializeReturnPersistence,
  verifyReturnPersistence,
} from '../../src/modules/returns/return.persistence.js'
import { returnModel } from '../../src/modules/returns/return.model.js'
import { claimQuantityAccess } from '../../src/modules/orders/order.service.js'
import { spawnSync } from 'node:child_process'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { testEnvironment } from '../helpers/environment.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import { orderModels } from '../../src/modules/orders/order.model.js'
import {
  initializeOrderPersistence,
  verifyOrderPersistence,
  orderValidators,
} from '../../src/modules/orders/order.persistence.js'
import { orderService, type OrderCreationAccess } from '../../src/modules/orders/order.service.js'
import { checkoutQuoteModel } from '../../src/modules/checkout/checkout-quote.model.js'
import { initializeCheckoutQuotePersistence } from '../../src/modules/checkout/checkout-quote.persistence.js'
import { checkoutCommercialSnapshot } from '../../src/modules/checkout/checkout.schema.js'
import {
  checkoutDraftFingerprint,
  checkoutCommercialDigest,
} from '../../src/modules/checkout/checkout-consent.service.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
type Proof = ReturnType<typeof syntheticOrderProof>
type IntentFixture = {
  _id: Types.ObjectId
  quoteId: Types.ObjectId
  scopeType: 'customer' | 'guest_context'
  scopeKeyHash: string
  status: 'preparing' | 'order_created'
  orderId?: Types.ObjectId
}
async function stage(proof = syntheticOrderProof()) {
  await checkoutQuoteModel(db.connection).create({
    _id: proof.quoteId,
    scopeType: proof.userId ? 'customer' : 'guest_context',
    scopeKeyHash: 'a'.repeat(64),
    requestFingerprint: checkoutDraftFingerprint(proof.snapshot.draft),
    commercialSnapshot: proof.snapshot,
    commercialDigest: proof.commercialDigest,
    quotedAt: new Date(proof.snapshot.deadlineBasis.capturedAt),
    expiresAt: new Date('2026-10-27T00:00:00Z'),
  })
  await db.connection.db?.collection<IntentFixture>('checkoutIntents').insertOne({
    _id: new Types.ObjectId(proof.checkoutIntentId),
    quoteId: new Types.ObjectId(proof.quoteId),
    scopeType: proof.userId ? 'customer' : 'guest_context',
    scopeKeyHash: 'a'.repeat(64),
    status: 'preparing',
  })
  return proof
}
function coordinator(proof: Proof): OrderCreationAccess {
  // Synthetic coordinator only: exercises the actual quote/intent/order/balance/audit transaction.
  // Production identity/revalidation/intent/stock/payment composition remains P06-006–P06-009.
  return {
    async authorize(session, command) {
      if (command.orderId !== proof.orderId || command.checkoutIntentId !== proof.checkoutIntentId)
        throw new ApiError('FORBIDDEN')
      const intent = await db.connection.db
        ?.collection<IntentFixture>('checkoutIntents')
        .findOne(
          { _id: new Types.ObjectId(command.checkoutIntentId), status: 'preparing' },
          { session },
        )
      if (!intent) throw new ApiError('STATE_CONFLICT')
      const quote = await checkoutQuoteModel(db.connection)
        .findOne({
          _id: proof.quoteId,
          scopeType: intent.scopeType,
          scopeKeyHash: intent.scopeKeyHash,
          status: 'open',
        })
        .session(session)
      if (!intent || !quote || quote.expiresAt <= orderTestTime)
        throw new ApiError('STATE_CONFLICT')
      const consumed = await checkoutQuoteModel(db.connection).updateOne(
        { _id: quote._id, status: 'open', revision: quote.revision },
        {
          $set: {
            status: 'consumed',
            checkoutIntentId: intent._id,
            orderId: proof.orderId,
            consumedAt: new Date(proof.acceptedAt),
          },
          $inc: { revision: 1 },
        },
        { session },
      )
      if (consumed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      await db.connection.db
        ?.collection<IntentFixture>('checkoutIntents')
        .updateOne(
          { _id: intent._id },
          { $set: { status: 'order_created', orderId: new Types.ObjectId(proof.orderId) } },
          { session },
        )
      return {
        ...proof,
        snapshot: checkoutCommercialSnapshot.parse(
          quote.toObject({ flattenMaps: true }).commercialSnapshot,
        ),
        commercialDigest: quote.commercialDigest,
      }
    },
  }
}
const command = (proof: Proof) => ({
  orderId: proof.orderId,
  checkoutIntentId: proof.checkoutIntentId,
  operationKey: `synthetic:${proof.checkoutIntentId}`,
})
function place(
  proof: Proof,
  access = coordinator(proof),
  audit = createAuditWriter(db.connection),
) {
  return inTransaction(db.connection, (session) =>
    orderService(db.connection, access, audit, () => orderTestTime).create(session, command(proof)),
  )
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeReturnPersistence(db.connection)
  await initializeOrderPersistence(db.connection)
  await initializeCheckoutQuotePersistence(db.connection)
  await initializeAuditPersistence(db.connection)
})
beforeEach(async () => {
  for (const name of [
    'returnRequests',
    'orders',
    'orderItemBalances',
    'checkoutQuotes',
    'checkoutIntents',
    'auditLogs',
    'products',
    'storeSettings',
  ])
    await db.connection.db?.collection(name).deleteMany({})
})
afterAll(async () => {
  await db?.close()
})
it('creates guest pending order and canonical unit balances from the exact consumed quote in one transaction', async () => {
  const proof = await stage(),
    result = await place(proof),
    { orders, balances } = orderModels(db.connection)
  expect(result).toMatchObject({
    id: proof.orderId,
    fulfillmentStatus: 'pending',
    paymentMethod: 'cod',
    revision: 0,
  })
  expect(result.orderNumber).toMatch(/^SZ-[A-F0-9]{24}$/)
  const order = await orders.findById(proof.orderId).orFail()
  expect(order.userId).toBeNull()
  expect(order.pricingSnapshot.finalTotalPoisha).toBe(2000)
  expect(order.items[0]?.id.toHexString()).toBe(proof.snapshot.items[0]?.id)
  expect(order.deliveryCommitment.status).toBe('awaiting_start')
  expect(order.deliveryCommitment.legalDeadlineAt?.toISOString()).toBe('2026-11-02T00:00:01.000Z')
  expect(order.confirmedAt).toBeUndefined()
  expect(order.deliveryCommitment.targetDeadlineAt).toBeUndefined()
  const balance = await balances.findOne({ orderId: order._id }).orFail()
  expect(balance.unitCoverage.map((row) => [row.ordinal, row.netEntitlementPoisha])).toEqual([
    [1, 634],
    [2, 633],
    [3, 633],
  ])
  expect(
    balance.unitCoverage.every(
      (row) =>
        row.claimState === 'available' &&
        row.refundHeldPoisha === 0 &&
        row.refundCompletedPoisha === 0,
    ),
  ).toBe(true)
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({ action: 'order.create' }),
  ).toBe(1)
  expect((await checkoutQuoteModel(db.connection).findById(proof.quoteId))?.status).toBe('consumed')
})
it('keeps online and customer identity separate from financial status and fulfillment', async () => {
  const userId = new Types.ObjectId().toHexString(),
    proof = await stage(syntheticOrderProof({ userId, online: true }))
  await place(proof)
  const row = await orderModels(db.connection).orders.findById(proof.orderId).orFail()
  expect(row.userId?.toHexString()).toBe(userId)
  expect(row.paymentMethod).toBe('online')
  expect(row.fulfillmentStatus).toBe('pending')
  expect(row.fulfillmentHold).toBe('payment_pending')
  expect(row.toObject()).not.toHaveProperty('paymentStatus')
  expect(await db.connection.db?.collection('payments').countDocuments()).toBe(0)
})
it('requires an enclosing transaction and the mandatory checkout authorization capability', async () => {
  const proof = await stage(),
    session = await db.connection.startSession()
  try {
    await expect(
      orderService(db.connection, coordinator(proof), createAuditWriter(db.connection)).create(
        session,
        command(proof),
      ),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  } finally {
    await session.endSession()
  }
  await expect(
    place(proof, {
      authorize: async () => {
        throw new ApiError('FORBIDDEN')
      },
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(0)
})
it('rolls back quote/intent/order/unit balances when append-only audit fails', async () => {
  const proof = await stage()
  await expect(
    place(proof, coordinator(proof), async () => {
      throw new Error('Synthetic audit failure')
    }),
  ).rejects.toThrow('Synthetic audit failure')
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(0)
  expect(await orderModels(db.connection).balances.countDocuments()).toBe(0)
  expect((await checkoutQuoteModel(db.connection).findById(proof.quoteId))?.status).toBe('open')
  expect(
    (
      await db.connection.db
        ?.collection<IntentFixture>('checkoutIntents')
        .findOne({ _id: new Types.ObjectId(proof.checkoutIntentId) })
    )?.status,
  ).toBe('preparing')
})
it('permits only one concurrent creation for the same intent and preserves one balance set', async () => {
  const proof = await stage(),
    results = await Promise.allSettled([place(proof), place(proof)])
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
  expect(
    await orderModels(db.connection).orders.countDocuments({
      checkoutIntentId: proof.checkoutIntentId,
    }),
  ).toBe(1)
  expect(await orderModels(db.connection).balances.countDocuments()).toBe(1)
})
it('preserves historical product, price, address, delivery and consent after live data changes', async () => {
  const proof = await stage()
  await place(proof)
  const before = (
    await orderModels(db.connection).orders.findById(proof.orderId).orFail()
  ).toObject({ flattenMaps: true })
  await db.connection.db?.collection('products').insertOne({
    _id: new Types.ObjectId(proof.snapshot.items[0]?.productId),
    name: 'Changed live product',
    price: 1,
  })
  await db.connection.db
    ?.collection('storeSettings')
    .insertOne({ key: 'primary', storeName: 'Changed live store' })
  const first = proof.snapshot.items[0]
  if (!first) throw new Error('Synthetic line missing')
  proof.snapshot.items[0] = {
    ...first,
    productName: 'Changed detached draft',
    effectiveUnitPoisha: 1,
  }
  const after = (await orderModels(db.connection).orders.findById(proof.orderId).orFail()).toObject(
    { flattenMaps: true },
  )
  for (const key of [
    'items',
    'customerSnapshot',
    'deliverySnapshot',
    'pricingSnapshot',
    'termsSnapshot',
  ] as const)
    expect(after[key]).toEqual(before[key])
})
it('rejects nested historical mutation and replacement through canonical model writes', async () => {
  const proof = await stage()
  await place(proof)
  const { orders } = orderModels(db.connection),
    row = await orders.findById(proof.orderId).orFail()
  row.pricingSnapshot.finalTotalPoisha = 1
  await expect(row.save()).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    orders.updateOne({ _id: proof.orderId }, { $set: { 'items.0.productName': 'Changed' } }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(orders.replaceOne({ _id: proof.orderId }, row.toObject())).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect((await orders.findById(proof.orderId))?.pricingSnapshot.finalTotalPoisha).toBe(2000)
})
it('rejects invalid lifecycle jumps and cannot use payment state as fulfillment authority', async () => {
  const proof = await stage()
  await place(proof)
  const orders = orderModels(db.connection).orders
  await expect(
    orders.updateOne(
      { _id: proof.orderId, fulfillmentStatus: 'pending' },
      { $set: { fulfillmentStatus: 'delivered' } },
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    orders.updateOne({ _id: proof.orderId }, { $set: { fulfillmentStatus: 'confirmed' } }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const row = await orders.findById(proof.orderId).orFail()
  row.fulfillmentStatus = 'shipped'
  await expect(row.save()).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect((await orders.findById(proof.orderId))?.fulfillmentStatus).toBe('pending')
})
it('enforces unique order/intent/item-balance keys and strict raw BSON shapes', async () => {
  const proof = await stage()
  await place(proof)
  const collection = db.connection.db?.collection('orders'),
    original = await collection?.findOne({ _id: new Types.ObjectId(proof.orderId) })
  if (!collection || !original) throw new Error('Synthetic order missing')
  await expect(
    collection.insertOne({
      ...original,
      _id: new Types.ObjectId(),
      checkoutIntentId: new Types.ObjectId(),
    }),
  ).rejects.toMatchObject({ code: 11000 })
  await expect(
    collection.insertOne({ ...original, _id: new Types.ObjectId(), orderNumber: 'SZ-OTHER' }),
  ).rejects.toMatchObject({ code: 11000 })
  const { userId, ...missingOwner } = original
  void userId
  await expect(
    collection.insertOne({
      ...missingOwner,
      _id: new Types.ObjectId(),
      orderNumber: 'SZ-MISSING',
      checkoutIntentId: new Types.ObjectId(),
    }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.insertOne({
      ...original,
      _id: new Types.ObjectId(),
      orderNumber: 'SZ-FAKE-PAID',
      checkoutIntentId: new Types.ObjectId(),
      paymentStatus: 'paid',
    }),
  ).rejects.toMatchObject({ code: 121 })
  const balance = await db.connection.db
    ?.collection('orderItemBalances')
    .findOne({ orderId: original._id })
  if (!balance) throw new Error('Synthetic balance missing')
  await expect(
    db.connection.db
      ?.collection('orderItemBalances')
      .insertOne({ ...balance, _id: new Types.ObjectId() }),
  ).rejects.toMatchObject({ code: 11000 })
})
it('enforces per-ordinal refund caps and unique ordinal coverage at the database boundary', async () => {
  const proof = await stage()
  await place(proof)
  const collection = db.connection.db?.collection('orderItemBalances'),
    row = await collection?.findOne({ orderId: new Types.ObjectId(proof.orderId) })
  if (!collection || !row) throw new Error('Synthetic balance missing')
  await expect(
    collection.updateOne({ _id: row._id }, { $set: { 'unitCoverage.0.refundHeldPoisha': 635 } }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.updateOne({ _id: row._id }, { $set: { 'unitCoverage.1.ordinal': 1 } }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.updateOne({ _id: row._id }, { $set: { purchasedQty: 1.5 } }),
  ).rejects.toMatchObject({ code: 121 })
})
it('runs compiled additive bootstrap without rewriting history and refuses production setup', async () => {
  const proof = await stage()
  await place(proof)
  const env = {
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-orders.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  await verifyOrderPersistence(db.connection)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-orders.mjs'], {
    env: { ...env, NODE_ENV: 'production', APP_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).not.toContain(env.MONGODB_URI)
})
it('protects immutable purchased unit identities separately from mutable claim/refund counters', async () => {
  const proof = await stage()
  await place(proof)
  const balances = orderModels(db.connection).balances,
    row = await balances.findOne({ orderId: proof.orderId }).orFail()
  const unit = row.unitCoverage[0]
  if (!unit) throw new Error('Synthetic unit missing')
  unit.netEntitlementPoisha++
  await expect(row.save()).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    balances.updateOne({ _id: row._id }, { $set: { 'unitCoverage.0.netEntitlementPoisha': 999 } }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect((await balances.findById(row._id))?.unitCoverage[0]?.netEntitlementPoisha).toBe(634)
})
it('fails closed before consent consumption if a required uniqueness index is missing', async () => {
  const proof = await stage(),
    { orders } = orderModels(db.connection)
  await orders.collection.dropIndex('order_intent_unique')
  try {
    await expect(place(proof)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(await orders.countDocuments()).toBe(0)
    expect((await checkoutQuoteModel(db.connection).findById(proof.quoteId))?.status).toBe('open')
  } finally {
    await initializeOrderPersistence(db.connection)
  }
})
it('refuses schema drift without silently replacing the installed validator', async () => {
  const proof = await stage()
  await db.connection.db?.command({
    collMod: 'orders',
    validator: {},
    validationLevel: 'strict',
    validationAction: 'error',
  })
  try {
    await expect(initializeOrderPersistence(db.connection)).rejects.toThrow('reviewed')
    await expect(place(proof)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    const collection = await db.connection.db
      ?.listCollections({ name: 'orders' }, { nameOnly: false })
      .next()
    expect(collection?.options?.validator ?? {}).toEqual({})
  } finally {
    await db.connection.db?.command({
      collMod: 'orders',
      validator: orderValidators.orders,
      validationLevel: 'strict',
      validationAction: 'error',
    })
    await verifyOrderPersistence(db.connection)
  }
})
it('preserves valid Unicode name/address bounds accepted by the quote contract', async () => {
  const proof = syntheticOrderProof(),
    name = '😀'.repeat(120),
    line = proof.snapshot.items[0]
  if (!line) throw new Error('Synthetic item missing')
  proof.snapshot.draft.customer.name = name
  proof.snapshot.draft.recipient.recipient = name
  proof.snapshot.draft.recipient.addressLine2 = '😀'.repeat(300)
  line.productName = name
  proof.commercialDigest = checkoutCommercialDigest(proof.snapshot)
  await stage(proof)
  await place(proof)
  const row = await orderModels(db.connection).orders.findById(proof.orderId).orFail()
  expect(row.customerSnapshot.name).toBe(name)
  expect(row.items[0]?.productName).toBe(name)
  expect(row.deliverySnapshot.addressLine2).toBe('😀'.repeat(300))
})

async function claimFixture() {
  const proof = await stage()
  await place(proof)
  const balance = await orderModels(db.connection).balances.findOne({ orderId: proof.orderId })
  if (!balance) throw new Error('Missing balance')
  const authority = {
    requestedBy: { type: 'guest', id: new Types.ObjectId().toHexString() },
    eligibilitySnapshot: { policyVersion: 'synthetic-not-approved' },
  }
  const service = returnService(
    db.connection,
    claimQuantityAccess(db.connection),
    async () => authority,
    () => orderTestTime,
  )
  const command = (
    claimType: 'physical_return' | 'shortage' = 'physical_return',
    quantity = 1,
  ) => ({
    claimId: new Types.ObjectId().toHexString(),
    orderId: proof.orderId,
    claimType,
    items: [
      { orderItemId: balance.orderItemId.toHexString(), quantity, reason: 'Synthetic fixture' },
    ],
  })
  return { proof, balance, service, command }
}
it('claim foundation: parallel physical and shortage requests share one exact ordinal capacity', async () => {
  const f = await claimFixture()
  const outcomes = await Promise.allSettled(
    Array.from({ length: f.balance.purchasedQty + 2 }, (_, i) =>
      inTransaction(db.connection, (session) =>
        f.service.create(session, f.command(i % 2 ? 'shortage' : 'physical_return')),
      ),
    ),
  )
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(f.balance.purchasedQty)
  const current = await orderModels(db.connection).balances.findById(f.balance._id)
  expect(current?.activeClaimQty).toBe(f.balance.purchasedQty)
  expect(new Set(current?.unitCoverage.map((u) => u.claimId?.toHexString())).size).toBe(
    f.balance.purchasedQty,
  )
  expect(await returnModel(db.connection).countDocuments()).toBe(f.balance.purchasedQty)
})
it('claim foundation: resolved and partially refunded units cannot be reclaimed', async () => {
  const f = await claimFixture(),
    balances = orderModels(db.connection).balances
  await balances.updateOne(
    { _id: f.balance._id, revision: 0 },
    {
      $set: {
        'unitCoverage.0.claimState': 'resolved',
        'unitCoverage.0.claimId': new Types.ObjectId(),
        resolvedClaimQty: 1,
      },
      $inc: { revision: 1 },
    },
  )
  const current = await balances.findById(f.balance._id)
  if (!current) throw new Error('Missing balance')
  // Ask for the original quantity: resolved ordinal must never become available again.
  await expect(
    inTransaction(db.connection, (session) =>
      f.service.create(session, f.command('shortage', current.purchasedQty)),
    ),
  ).rejects.toThrow()
  expect(await returnModel(db.connection).countDocuments()).toBe(0)
  expect((await balances.findById(current._id))?.revision).toBe(1)
})
it('claim foundation: duplicate lines, caller ordinals and unauthorized scope leave balances unchanged', async () => {
  const f = await claimFixture(),
    body = f.command()
  await expect(
    inTransaction(db.connection, (session) =>
      f.service.create(session, { ...body, items: [...body.items, ...body.items] }),
    ),
  ).rejects.toThrow()
  await expect(
    inTransaction(db.connection, (session) =>
      f.service.create(session, { ...body, ordinals: [1] }),
    ),
  ).rejects.toThrow()
  const denied = returnService(db.connection, claimQuantityAccess(db.connection), async () => {
    throw new ApiError('FORBIDDEN')
  })
  await expect(
    inTransaction(db.connection, (session) => denied.create(session, body)),
  ).rejects.toThrow()
  expect((await orderModels(db.connection).balances.findById(f.balance._id))?.revision).toBe(0)
})
it('claim foundation: failed claim audit rolls back protected ordinals and request; recovery creates once', async () => {
  const f = await claimFixture(),
    body = f.command()
  await db.connection.db?.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(
      inTransaction(db.connection, (session) => f.service.create(session, body)),
    ).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(db.connection)
  }
  expect((await orderModels(db.connection).balances.findById(f.balance._id))?.activeClaimQty).toBe(
    0,
  )
  await inTransaction(db.connection, (session) => f.service.create(session, body))
  await expect(
    inTransaction(db.connection, (session) => f.service.create(session, body)),
  ).rejects.toThrow()
  expect(await returnModel(db.connection).countDocuments()).toBe(1)
})
it('claim foundation: outside transaction, unsupported lifecycle and validator drift fail closed', async () => {
  const f = await claimFixture(),
    session = await db.connection.startSession()
  try {
    await expect(f.service.create(session, f.command())).rejects.toThrow()
  } finally {
    await session.endSession()
  }
  await inTransaction(db.connection, (session) => f.service.create(session, f.command()))
  await expect(
    returnModel(db.connection).updateOne({}, { $set: { status: 'completed' } }),
  ).rejects.toThrow()
  await db.connection.db?.command({ collMod: 'returnRequests', validator: {} })
  try {
    await expect(verifyReturnPersistence(db.connection)).rejects.toThrow()
  } finally {
    const { returnValidator } = await import('../../src/modules/returns/return.persistence.js')
    await db.connection.db?.command({ collMod: 'returnRequests', validator: returnValidator })
  }
})

it('claim foundation: partial refund holds stay protected and later-line failure rolls back earlier selection', async () => {
  const f = await claimFixture(),
    balances = orderModels(db.connection).balances
  await balances.updateOne(
    { _id: f.balance._id, revision: 0 },
    {
      $set: {
        'unitCoverage.0.claimState': 'protected',
        'unitCoverage.0.claimId': new Types.ObjectId(),
        'unitCoverage.0.refundHeldPoisha': 1,
        activeClaimQty: 1,
      },
      $inc: { revision: 1 },
    },
  )
  await expect(
    inTransaction(db.connection, (session) =>
      f.service.create(session, f.command('shortage', f.balance.purchasedQty)),
    ),
  ).rejects.toThrow()
  expect(await returnModel(db.connection).countDocuments()).toBe(0)
  const fresh = await claimFixture(),
    body = fresh.command()
  await expect(
    inTransaction(db.connection, (session) =>
      fresh.service.create(session, {
        ...body,
        items: [
          ...body.items,
          { orderItemId: new Types.ObjectId().toHexString(), quantity: 1, reason: 'Missing line' },
        ],
      }),
    ),
  ).rejects.toThrow()
  expect((await balances.findById(fresh.balance._id))?.activeClaimQty).toBe(0)
})
it('claim foundation: BSON validation rejects duplicate lines and mismatched protected quantities', async () => {
  const f = await claimFixture()
  await inTransaction(db.connection, (session) => f.service.create(session, f.command()))
  const row = await db.connection.collection('returnRequests').findOne({})
  if (!row) throw new Error('Missing claim')
  const items = row.items
  await expect(
    db.connection
      .collection('returnRequests')
      .insertOne({ ...row, _id: new Types.ObjectId(), items: [...items, ...items] }),
  ).rejects.toThrow()
  await expect(
    db.connection.collection('returnRequests').insertOne({
      ...row,
      _id: new Types.ObjectId(),
      items: items.map((i: { requestedQty: number }) => ({
        ...i,
        requestedQty: i.requestedQty + 1,
      })),
    }),
  ).rejects.toThrow()
})
it('claim foundation: compiled bootstrap preserves requests and refuses deployed environment', async () => {
  const f = await claimFixture()
  await inTransaction(db.connection, (session) => f.service.create(session, f.command()))
  const command = () =>
    spawnSync(process.execPath, ['scripts/bootstrap-returns.mjs'], {
      cwd: process.cwd(),
      env: {
        ...testEnvironment(),
        MONGODB_URI: db.replica.getUri(),
        MONGODB_DB_NAME: db.connection.name,
      },
      encoding: 'utf8',
      timeout: 10000,
    })
  expect(command().status).toBe(0)
  expect(command().status).toBe(0)
  expect(await returnModel(db.connection).countDocuments()).toBe(1)
  const deployed = spawnSync(process.execPath, ['scripts/bootstrap-returns.mjs'], {
    cwd: process.cwd(),
    env: {
      ...testEnvironment(),
      MONGODB_URI: db.replica.getUri(),
      MONGODB_DB_NAME: db.connection.name,
      APP_ENV: 'production',
    },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(deployed.status).not.toBe(0)
})

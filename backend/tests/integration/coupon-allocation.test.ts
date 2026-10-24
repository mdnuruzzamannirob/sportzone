import { spawnSync } from 'node:child_process'
import { testEnvironment } from '../helpers/environment.js'
import { Types, type ClientSession } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
import { couponModels } from '../../src/modules/promotions/coupon.model.js'
import { initializeCouponPersistence } from '../../src/modules/promotions/coupon.persistence.js'
import { couponAllocationService } from '../../src/modules/promotions/coupon-allocation.service.js'
import { allocationService } from '../../src/modules/inventory/allocation.service.js'
import { initializeAllocationPersistence } from '../../src/modules/inventory/inventory.persistence.js'
import { variantStockAccess } from '../../src/modules/catalog/variants/variant.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { attributeSignature } from '../../src/modules/catalog/variants/variant.schema.js'
import { evaluateCouponEligibility } from '../../src/modules/promotions/coupon.service.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let service: ReturnType<typeof couponAllocationService>
let couponId: string
let time = Date.parse('2026-10-24T06:00:00Z')
const clock = () => new Date(time)
const run = <T>(work: Parameters<typeof inTransaction<T>>[1]) => inTransaction(db.connection, work)
const userId = new Types.ObjectId().toHexString()
const pricing = {
  items: [
    {
      id: new Types.ObjectId().toHexString(),
      variantId: new Types.ObjectId().toHexString(),
      quantity: 1,
      couponEligible: true,
      regularUnitPoisha: 1000,
      effectiveUnitPoisha: 1000,
    },
  ],
  deliveryChargePoisha: 100,
}
// This durable orders fixture is a test-only owning capability, not a production order model.
async function guard(session: ClientSession, orderId: string, action: string): Promise<unknown> {
  const row = await db.connection.db
    ?.collection('orders')
    .findOneAndUpdate(
      { _id: new Types.ObjectId(orderId) },
      { $inc: { fixtureFence: 1 } },
      { session, returnDocument: 'after' },
    )
  if (
    !row ||
    row.denied ||
    (action === 'release_redeemed' && row.dispatched) ||
    (action === 'commit' && !row.paymentVerified)
  )
    throw new ApiError('STATE_CONFLICT')
  return {
    orderId,
    couponId: row.couponSnapshot.couponId.toHexString(),
    ...(row.userId ? { userId: row.userId.toHexString() } : {}),
    acceptedPricing: row.acceptedPricing,
    currentPricing: row.currentPricing,
    termsSnapshot: row.couponSnapshot.terms,
  }
}
async function order(customer: string | null = userId) {
  const c = await couponModels(db.connection).coupons.findById(couponId).lean()
  if (!c) throw new Error('Missing fixture coupon')
  const evaluated = evaluateCouponEligibility(
    {
      code: c.codeNormalized,
      coupon: {
        id: couponId,
        codeNormalized: c.codeNormalized,
        type: c.type,
        value: c.value,
        status: c.status,
        startsAt: c.startsAt,
        expiresAt: c.expiresAt,
        minEligibleSubtotalPoisha: c.minEligibleSubtotalPoisha,
        heldCount: 0,
        redeemedCount: 0,
        overallLimit: c.overallLimit,
        termsVersion: c.termsVersion,
      },
      principal: { kind: 'guest' },
      pricing,
    },
    clock(),
  )
  const id = new Types.ObjectId()
  await db.connection.db?.collection('orders').insertOne({
    _id: id,
    couponSnapshot: { couponId: new Types.ObjectId(couponId), terms: evaluated.termsSnapshot },
    ...(customer ? { userId: new Types.ObjectId(customer) } : {}),
    acceptedPricing: pricing,
    currentPricing: pricing,
    paymentVerified: true,
    dispatched: false,
    fixtureFence: 0,
  })
  return id.toHexString()
}
const command = (orderId: string, generation = 1, key = 'synthetic-key') => ({
  couponId,
  orderId,
  generation,
  operationKey: key,
})
async function counts() {
  const c = await couponModels(db.connection).coupons.findById(couponId).lean()
  return { held: c?.heldCount, redeemed: c?.redeemedCount }
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeCouponPersistence(db.connection)
  await initializeAllocationPersistence(db.connection)
  await initializeProductPersistence(db.connection)
  await createDeclaredIndexes(categoryModel(db.connection))
  service = couponAllocationService(db.connection, { authorize: guard }, clock)
})
beforeEach(async () => {
  time = Date.parse('2026-10-24T06:00:00Z')
  const models = couponModels(db.connection)
  await models.coupons.deleteMany({})
  await models.redemptions.deleteMany({})
  await models.customers.deleteMany({})
  await db.connection.db?.collection('orders').deleteMany({})
  const c = await couponModels(db.connection).coupons.create({
    codeNormalized: 'SAVE',
    type: 'fixed',
    value: 100,
    minEligibleSubtotalPoisha: 0,
    startsAt: new Date(time - 1000),
    expiresAt: new Date(time + 3600000),
    status: 'active',
    overallLimit: 10,
    heldCount: 0,
    redeemedCount: 0,
    termsVersion: 1,
    revision: 0,
  })
  couponId = c._id.toHexString()
})
afterAll(async () => {
  await db?.close()
})
it('reserves once and replay never extends the trusted synchronized expiry', async () => {
  const id = await order(),
    heldAt = clock()
  const a = await run((s) => service.reserve(s, command(id), heldAt))
  time += 1000
  const b = await run((s) => service.reserve(s, command(id), clock()))
  expect(b.id).toBe(a.id)
  expect(b.expiresAt).toEqual(a.expiresAt)
  expect(a.expiresAt?.getTime()).toBe(heldAt.getTime() + 900000)
  expect(await counts()).toEqual({ held: 1, redeemed: 0 })
})
it('redeems COD atomically and replays without consuming another slot', async () => {
  const id = await order()
  await run((s) => service.redeemCod(s, command(id)))
  await run((s) => service.redeemCod(s, command(id)))
  expect(await counts()).toEqual({ held: 0, redeemed: 1 })
})
it('commits a live hold once even after master deactivation', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  await couponModels(db.connection).coupons.updateOne(
    { _id: couponId },
    { $set: { status: 'inactive' } },
  )
  await run((s) => service.commit(s, command(id, 1, 'commit')))
  await run((s) => service.commit(s, command(id, 1, 'commit')))
  expect(await counts()).toEqual({ held: 0, redeemed: 1 })
})
it.each(['held', 'redeemed'] as const)('releases %s capacity exactly once', async (state) => {
  const id = await order()
  if (state === 'held') await run((s) => service.reserve(s, command(id), clock()))
  else await run((s) => service.redeemCod(s, command(id)))
  await run((s) => service.release(s, command(id, 1, 'release'), state))
  await run((s) => service.release(s, command(id, 1, 'release'), state))
  expect(await counts()).toEqual({ held: 0, redeemed: 0 })
})
it('cannot release redeemed usage after dispatch', async () => {
  const id = await order()
  await run((s) => service.redeemCod(s, command(id)))
  await db.connection.db
    ?.collection('orders')
    .updateOne({ _id: new Types.ObjectId(id) }, { $set: { dispatched: true } })
  await expect(run((s) => service.release(s, command(id), 'redeemed'))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await counts()).toEqual({ held: 0, redeemed: 1 })
})
it('does not let two orders consume the final global slot', async () => {
  await couponModels(db.connection).coupons.updateOne(
    { _id: couponId },
    { $set: { overallLimit: 1 } },
  )
  const a = await order(),
    b = await order(new Types.ObjectId().toHexString())
  const outcomes = await Promise.allSettled([
    run((s) => service.reserve(s, command(a), clock())),
    run((s) => service.reserve(s, command(b), clock())),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(await counts()).toEqual({ held: 1, redeemed: 0 })
  expect(await couponModels(db.connection).redemptions.countDocuments()).toBe(1)
})
it('protects the final per-customer slot and permits another customer', async () => {
  await couponModels(db.connection).coupons.updateOne(
    { _id: couponId },
    { $set: { perCustomerLimit: 1 } },
  )
  const a = await order(),
    b = await order(),
    c = await order(new Types.ObjectId().toHexString())
  const outcomes = await Promise.allSettled([
    run((s) => service.redeemCod(s, command(a))),
    run((s) => service.redeemCod(s, command(b))),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  await run((s) => service.redeemCod(s, command(c)))
  expect(await counts()).toEqual({ held: 0, redeemed: 2 })
  expect(await couponModels(db.connection).customers.countDocuments()).toBe(2)
})
it('rejects guests for customer-limited coupons but permits unrestricted guest usage', async () => {
  const id = await order(null)
  await run((s) => service.reserve(s, command(id), clock()))
  await run((s) => service.release(s, command(id), 'held'))
  await couponModels(db.connection).coupons.updateOne(
    { _id: couponId },
    { $set: { perCustomerLimit: 1 } },
  )
  await expect(run((s) => service.reserve(s, command(id, 2), clock()))).rejects.toMatchObject({
    code: 'COUPON_UNAVAILABLE',
  })
})
it('rejects expired commits, releases once and reacquires the next generation without prolonging the old one', async () => {
  const id = await order(),
    first = await run((s) => service.reserve(s, command(id), clock()))
  time += 900000
  await expect(run((s) => service.commit(s, command(id)))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await run((s) => service.release(s, command(id), 'held'))
  const second = await run((s) => service.reserve(s, command(id, 2), clock()))
  expect(second.generation).toBe(2)
  expect(second.expiresAt?.getTime()).toBe(time + 900000)
  expect(first.expiresAt?.getTime()).toBe(time)
  await run((s) => service.release(s, command(id, 1), 'held'))
  expect(await counts()).toEqual({ held: 1, redeemed: 0 })
})
it('enforces immutable coupon identity even after all old holds are released', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  await run((s) => service.release(s, command(id), 'held'))
  const original = await couponModels(db.connection).coupons.findById(couponId).lean()
  if (!original) throw new Error('Missing fixture')
  const { _id: _, ...fields } = original
  const other = await couponModels(db.connection).coupons.create({
    ...fields,
    codeNormalized: 'OTHER',
    heldCount: 0,
    redeemedCount: 0,
  })
  await expect(
    run((s) =>
      service.reserve(s, { ...command(id, 2), couponId: other._id.toHexString() }, clock()),
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
})
it('rolls back coupon, customer and redemption effects when the outer transaction fails', async () => {
  const id = await order()
  await expect(
    run(async (s) => {
      await service.reserve(s, command(id), clock())
      throw new Error('Synthetic failure')
    }),
  ).rejects.toThrow('Synthetic failure')
  expect(await counts()).toEqual({ held: 0, redeemed: 0 })
  expect(await couponModels(db.connection).customers.countDocuments()).toBe(0)
  expect(await couponModels(db.connection).redemptions.countDocuments()).toBe(0)
})
it('allows only one competing commit/release transition', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  const outcomes = await Promise.allSettled([
    run((s) => service.commit(s, command(id, 1, 'commit'))),
    run((s) => service.release(s, command(id, 1, 'release'), 'held')),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const state = await counts()
  expect(state.held).toBe(0)
  expect([0, 1]).toContain(state.redeemed)
})
it('rejects missing transaction, denied order gates and invalid generation/clock', async () => {
  const id = await order(),
    session = await db.connection.startSession()
  try {
    await expect(service.reserve(session, command(id), clock())).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    })
  } finally {
    await session.endSession()
  }
  await expect(run((s) => service.reserve(s, command(id, 2), clock()))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await expect(
    run((s) => service.reserve(s, command(id), new Date(time + 1))),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await db.connection.db
    ?.collection('orders')
    .updateOne({ _id: new Types.ObjectId(id) }, { $set: { denied: true } })
  await expect(run((s) => service.reserve(s, command(id), clock()))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
})
it('fails closed with a missing index and refuses incompatible validator bootstrap', async () => {
  const id = await order(),
    m = couponModels(db.connection)
  await m.redemptions.collection.dropIndex('coupon_order_generation_unique')
  try {
    await expect(run((s) => service.reserve(s, command(id), clock()))).rejects.toBeDefined()
  } finally {
    await m.redemptions.createIndexes()
  }
  await db.connection.db?.command({ collMod: 'couponRedemptions', validator: {} })
  try {
    await expect(initializeCouponPersistence(db.connection)).rejects.toThrow(/reviewed/)
  } finally {
    const { couponValidators } = await import('../../src/modules/promotions/coupon.persistence.js')
    await db.connection.db?.command({
      collMod: 'couponRedemptions',
      validator: couponValidators.couponRedemptions,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
})

it('does not change a held generation into COD by replaying a different start action', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  await expect(run((s) => service.redeemCod(s, command(id)))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await counts()).toEqual({ held: 1, redeemed: 0 })
})
it('does not confirm a released generation or accept stale/changed accepted pricing', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  await run((s) => service.release(s, command(id), 'held'))
  await expect(run((s) => service.commit(s, command(id)))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await db.connection.db
    ?.collection('orders')
    .updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { 'currentPricing.deliveryChargePoisha': 101 } },
    )
  await expect(run((s) => service.reserve(s, command(id, 2), clock()))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await counts()).toEqual({ held: 0, redeemed: 0 })
})
it('rejects malformed command identity and missing authoritative order binding', async () => {
  const id = await order()
  await expect(
    run((s) => service.reserve(s, { ...command(id), userId }, clock())),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await expect(
    run((s) => service.reserve(s, command(new Types.ObjectId().toHexString()), clock())),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    run((s) => service.reserve(s, { ...command(id), operationKey: 'bad\nkey' }, clock())),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
})
it('enforces raw validators and unique generation/active/customer indexes', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  const models = couponModels(db.connection),
    dbHandle = db.connection.db
  if (!dbHandle) throw new Error('Missing fixture DB')
  const row = await models.redemptions.findOne({ orderId: id }).lean()
  if (!row) throw new Error('Missing redemption')
  const { _id: _, ...copy } = row
  await expect(dbHandle.collection('couponRedemptions').insertOne(copy)).rejects.toMatchObject({
    code: 11000,
  })
  await expect(
    dbHandle.collection('couponRedemptions').insertOne({ ...copy, generation: 2 }),
  ).rejects.toMatchObject({ code: 11000 })
  await expect(
    dbHandle
      .collection('couponRedemptions')
      .insertOne({ ...copy, orderId: new Types.ObjectId(), expiresAt: new Date(time + 1) }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    dbHandle
      .collection('coupons')
      .updateOne({ _id: new Types.ObjectId(couponId) }, { $set: { heldCount: -1 } }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    dbHandle
      .collection('coupons')
      .updateOne({ _id: new Types.ObjectId(couponId) }, { $set: { heldCount: 11 } }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    models.customers.create({ couponId, userId, heldCount: 0, redeemedCount: 0, revision: 0 }),
  ).rejects.toMatchObject({ code: 11000 })
  await expect(
    dbHandle
      .collection('coupons')
      .updateOne(
        { _id: new Types.ObjectId(couponId) },
        { $set: { eligibleProductIds: Array.from({ length: 201 }, () => new Types.ObjectId()) } },
      ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    dbHandle
      .collection('coupons')
      .updateOne(
        { _id: new Types.ObjectId(couponId) },
        { $set: { type: 'percentage', value: 10001 } },
      ),
  ).rejects.toMatchObject({ code: 121 })
})
async function inventoryFixture(orderId: string) {
  const cat = await categoryModel(db.connection).create({
    name: 'Synthetic',
    slug: `cat-${new Types.ObjectId().toHexString()}`,
    status: 'active',
  })
  const m = productModels(db.connection)
  const product = await m.products.create({
    name: 'Synthetic',
    slug: `product-${new Types.ObjectId().toHexString()}`,
    description: 'Synthetic',
    categoryIds: [cat._id],
    status: 'active',
  })
  const variant = await m.variants.create({
    productId: product._id,
    skuNormalized: new Types.ObjectId().toHexString().toUpperCase(),
    attributes: {},
    attributeSignature: attributeSignature({}),
    regularPricePoisha: 1000,
    stock: { physical: 2, reserved: 0, committed: 0 },
    status: 'active',
  })
  await db.connection.db?.collection('orders').updateOne(
    { _id: new Types.ObjectId(orderId) },
    {
      $set: {
        'acceptedPricing.items.0.variantId': variant._id.toHexString(),
        'currentPricing.items.0.variantId': variant._id.toHexString(),
      },
    },
  )
  return {
    variant,
    service: allocationService(db.connection, variantStockAccess(db.connection), clock),
    input: {
      variantId: variant._id.toHexString(),
      orderId,
      quantity: 1,
      generation: 1,
      operationKey: 'coordinated',
      reason: 'Synthetic checkout coordination',
    },
  }
}
it('coordinates real inventory and coupon rollback when coupon capacity is exhausted', async () => {
  const id = await order(),
    stock = await inventoryFixture(id)
  await couponModels(db.connection).coupons.updateOne(
    { _id: couponId },
    { $set: { overallLimit: 1, heldCount: 1 } },
  )
  await expect(
    run(async (session) => {
      const heldAt = clock()
      await stock.service.reserve(session, stock.input, heldAt)
      await service.reserve(session, command(id), heldAt)
    }),
  ).rejects.toMatchObject({ code: 'COUPON_UNAVAILABLE' })
  const value = await productModels(db.connection).variants.findById(stock.variant._id)
  expect(value?.stock).toMatchObject({ physical: 2, reserved: 0, committed: 0 })
  expect(
    await db.connection.db
      ?.collection('inventoryReservations')
      .countDocuments({ orderId: new Types.ObjectId(id) }),
  ).toBe(0)
  expect(await couponModels(db.connection).redemptions.countDocuments({ orderId: id })).toBe(0)
})
it('uses exactly the same inventory/coupon hold clock and commits/releases both in one transaction', async () => {
  const id = await order(),
    stock = await inventoryFixture(id),
    heldAt = clock()
  const result = await run(async (session) => {
    const inventory = await stock.service.reserve(session, stock.input, heldAt)
    const coupon = await service.reserve(session, command(id), heldAt)
    return { inventory, coupon }
  })
  expect(result.inventory.expiresAt).toEqual(result.coupon.expiresAt)
  await run(async (session) => {
    await stock.service.commit(session, { ...stock.input, operationKey: 'commit' })
    await service.commit(session, command(id, 1, 'commit'))
  })
  expect(await counts()).toEqual({ held: 0, redeemed: 1 })
  await run(async (session) => {
    await stock.service.release(session, { ...stock.input, operationKey: 'release' }, 'committed')
    await service.release(session, command(id, 1, 'release'), 'redeemed')
  })
  expect(await counts()).toEqual({ held: 0, redeemed: 0 })
  expect(
    (await productModels(db.connection).variants.findById(stock.variant._id))?.stock,
  ).toMatchObject({ physical: 2, reserved: 0, committed: 0 })
})

it('serializes same-generation reserve and duplicate release races', async () => {
  const id = await order(),
    start = clock()
  const results = await Promise.all([
    run((s) => service.reserve(s, command(id, 1, 'first'), start)),
    run((s) => service.reserve(s, command(id, 1, 'second'), start)),
  ])
  expect(results[0]?.id).toBe(results[1]?.id)
  expect(await counts()).toEqual({ held: 1, redeemed: 0 })
  await Promise.all([
    run((s) => service.release(s, command(id, 1, 'release-one'), 'held')),
    run((s) => service.release(s, command(id, 1, 'release-two'), 'held')),
  ])
  expect(await counts()).toEqual({ held: 0, redeemed: 0 })
})
it('cannot commit without verified order/payment authority', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  await db.connection.db
    ?.collection('orders')
    .updateOne({ _id: new Types.ObjectId(id) }, { $set: { paymentVerified: false } })
  await expect(run((s) => service.commit(s, command(id)))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await counts()).toEqual({ held: 1, redeemed: 0 })
})
it('fails closed on corrupted global counters without decrementing customer capacity', async () => {
  const id = await order()
  await run((s) => service.reserve(s, command(id), clock()))
  await couponModels(db.connection).coupons.updateOne({ _id: couponId }, { $set: { heldCount: 0 } })
  await expect(run((s) => service.release(s, command(id), 'held'))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  const customer = await couponModels(db.connection).customers.findOne({ couponId, userId }).lean()
  expect(customer?.heldCount).toBe(1)
  expect((await couponModels(db.connection).redemptions.findOne({ orderId: id }))?.status).toBe(
    'held',
  )
})
it('preserves existing hold quota when master per-customer limits are enabled later', async () => {
  const id = await order(null)
  await run((s) => service.reserve(s, command(id), clock()))
  await couponModels(db.connection).coupons.updateOne(
    { _id: couponId },
    { $set: { perCustomerLimit: 1 } },
  )
  await run((s) => service.commit(s, command(id)))
  expect(await counts()).toEqual({ held: 0, redeemed: 1 })
})

it('runs explicit local/test bootstrap additively without deleting existing financial records', async () => {
  const env = {
    ...process.env,
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let pass = 0; pass < 2; pass++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-promotions.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Coupon persistence ready.')
    expect(result.stderr).toBe('')
  }
  expect(await couponModels(db.connection).coupons.countDocuments()).toBe(1)
  const denied = spawnSync(process.execPath, ['scripts/bootstrap-promotions.mjs'], {
    env: {
      ...env,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      API_PUBLIC_ORIGIN: 'https://api.example.test',
      STOREFRONT_ORIGIN: 'https://shop.example.test',
      ADMIN_ORIGIN: 'https://admin.example.test',
      CORS_ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test',
    },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(denied.status).toBe(1)
  expect(denied.stderr).toContain('Coupon bootstrap failed;')
  expect(await couponModels(db.connection).coupons.countDocuments()).toBe(1)
})

it('reconciles mixed transitions to the durable ledger and registered-customer counter', async () => {
  const a = await order(),
    b = await order(),
    c = await order()
  await run((s) => service.reserve(s, command(a), clock()))
  await run((s) => service.reserve(s, command(b), clock()))
  await run((s) => service.redeemCod(s, command(c)))
  await run((s) => service.commit(s, command(a)))
  await run((s) => service.release(s, command(b), 'held'))
  const rows = await couponModels(db.connection).redemptions.find({ couponId }).lean()
  const expected = {
    held: rows.filter((row) => row.status === 'held').length,
    redeemed: rows.filter((row) => row.status === 'redeemed').length,
  }
  expect(expected).toEqual({ held: 0, redeemed: 2 })
  expect(await counts()).toEqual(expected)
  const customer = await couponModels(db.connection).customers.findOne({ couponId, userId }).lean()
  expect(customer).toMatchObject({ heldCount: expected.held, redeemedCount: expected.redeemed })
})
it('rolls back a successful global increment when the customer CAS cannot advance', async () => {
  const id = await order()
  await couponModels(db.connection).customers.create({
    couponId,
    userId,
    heldCount: 0,
    redeemedCount: 0,
    revision: Number.MAX_SAFE_INTEGER,
  })
  await expect(run((s) => service.reserve(s, command(id), clock()))).rejects.toMatchObject({
    code: 'COUPON_UNAVAILABLE',
  })
  expect(await counts()).toEqual({ held: 0, redeemed: 0 })
  expect(await couponModels(db.connection).redemptions.countDocuments()).toBe(0)
  const row = await db.connection.db?.collection('orders').findOne({ _id: new Types.ObjectId(id) })
  expect(row?.fixtureFence).toBe(0)
})

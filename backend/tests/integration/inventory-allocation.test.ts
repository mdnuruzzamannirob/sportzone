import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { categoryService } from '../../src/modules/catalog/categories/category.service.js'
import { productService } from '../../src/modules/catalog/products/product.service.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { variantStockAccess } from '../../src/modules/catalog/variants/variant.service.js'
import { inventoryService } from '../../src/modules/inventory/inventory.service.js'
import { allocationService } from '../../src/modules/inventory/allocation.service.js'
import {
  initializeAllocationPersistence,
  verifyAllocationPersistence,
  inventoryReservationValidator,
} from '../../src/modules/inventory/inventory.persistence.js'
import {
  inventoryMovementModel,
  inventoryReservationModel,
} from '../../src/modules/inventory/inventory.model.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let variantId: string
let service: ReturnType<typeof allocationService>
let inventory: ReturnType<typeof inventoryService>
let time = Date.parse('2026-10-23T01:00:00Z')
const actorId = '535a00000000000000000002'
const orderId = '535a00000000000000000003'
const command = (operationKey: string, extra: Record<string, unknown> = {}) => ({
  variantId,
  orderId,
  quantity: 2,
  generation: 1,
  operationKey,
  reason: 'Synthetic allocation',
  ...extra,
})
const run = <T>(work: Parameters<typeof inTransaction<T>>[1]) => inTransaction(db.connection, work)
beforeAll(async () => {
  db = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeProductPersistence(db.connection)
  await initializeAllocationPersistence(db.connection)
  const stock = variantStockAccess(db.connection)
  inventory = inventoryService(db.connection, stock)
  service = allocationService(db.connection, stock, () => new Date(time))
})
beforeEach(async () => {
  time = Date.parse('2026-10-23T01:00:00Z')
  await productModels(db.connection).variants.deleteMany({})
  await productModels(db.connection).products.deleteMany({})
  await categoryModel(db.connection).deleteMany({})
  await inventoryReservationModel(db.connection).deleteMany({})
  await inventoryMovementModel(db.connection).collection.deleteMany({})
  const categories = categoryService(db.connection)
  const category = await categories.create({ name: 'Sports', slug: 'sports' })
  const product = await productService(db.connection, categories).create(
    {
      name: 'Ball',
      slug: 'ball',
      description: 'Ball',
      categoryIds: [category.id],
      status: 'active',
    },
    [{ sku: 'BALL', attributes: {}, regularPricePoisha: 100 }],
  )
  const variant = product.variants[0]
  if (!variant) throw new Error('Missing variant')
  variantId = variant.id
  await inventory.adjustPhysical({
    variantId,
    actorId,
    operationKey: 'opening',
    deltaPhysical: 5,
    reason: 'Counted stock',
  })
})
afterAll(async () => {
  await db?.close()
})
it('holds for exactly fifteen minutes, replays without extending and commits then ships once', async () => {
  const held = await run((session) => service.reserve(session, command('hold'), new Date(time)))
  expect(held.status).toBe('held')
  expect(held.expiresAt?.getTime()).toBe(time + 900000)
  time += 60000
  expect(await run((session) => service.reserve(session, command('hold'), new Date(time)))).toEqual(
    held,
  )
  expect(await inventory.read(variantId)).toMatchObject({
    physical: 5,
    reserved: 2,
    committed: 0,
    available: 3,
  })
  await run((session) => service.commit(session, command('paid')))
  expect(await inventory.read(variantId)).toMatchObject({ reserved: 0, committed: 2, available: 3 })
  await run((session) => service.ship(session, command('ship')))
  await run((session) => service.ship(session, command('ship')))
  expect(await inventory.read(variantId)).toEqual({
    physical: 3,
    reserved: 0,
    committed: 0,
    available: 3,
  })
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(4)
})
it('does not reserve more than available under competing transactions', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      run((session) =>
        service.reserve(
          session,
          command(`hold-${i}`, { orderId: new Types.ObjectId().toHexString() }),
          new Date(time),
        ),
      ),
    ),
  )
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(2)
  expect(await inventory.read(variantId)).toMatchObject({ reserved: 4, available: 1 })
})
it('deduplicates concurrent identical allocation and rejects changed payload/operation keys', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      run((session) => service.reserve(session, command('hold'), new Date(time))),
    ),
  )
  expect(new Set(results.map((x) => x.id)).size).toBe(1)
  await expect(
    run((session) => service.reserve(session, command('hold', { quantity: 1 }), new Date(time))),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    run((session) => service.reserve(session, command('other'), new Date(time))),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect((await inventory.read(variantId)).reserved).toBe(2)
})
it('expires only by explicit release, preserves history and reacquires a new generation', async () => {
  const first = await run((session) => service.reserve(session, command('hold'), new Date(time)))
  time += 900000
  expect((await inventory.read(variantId)).reserved).toBe(2)
  await expect(
    run((session) => service.commit(session, command('too-late'))),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await run((session) => service.release(session, command('expire'), 'held'))
  time += 300000
  const second = await run((session) =>
    service.reserve(session, command('retry', { generation: 2 }), new Date(time)),
  )
  expect(second.id).not.toBe(first.id)
  expect(second.expiresAt?.getTime()).toBe(time + 900000)
  await run((session) => service.release(session, command('expire'), 'held'))
  expect((await inventory.read(variantId)).reserved).toBe(2)
  expect(await inventoryReservationModel(db.connection).countDocuments()).toBe(2)
})
it('direct COD commitment has no hold clock and cancellation releases committed stock once', async () => {
  const row = await run((session) => service.commitCod(session, command('cod')))
  expect(row).toMatchObject({ status: 'committed' })
  expect(row.heldAt).toBeUndefined()
  expect(row.expiresAt).toBeUndefined()
  await run((session) => service.release(session, command('cancel'), 'committed'))
  await run((session) => service.release(session, command('cancel'), 'committed'))
  expect(await inventory.read(variantId)).toMatchObject({
    physical: 5,
    reserved: 0,
    committed: 0,
    available: 5,
  })
})
it('release versus commit and release versus shipment each permit one terminal winner', async () => {
  await run((session) => service.reserve(session, command('hold'), new Date(time)))
  const first = await Promise.allSettled([
    run((session) => service.commit(session, command('paid'))),
    run((session) => service.release(session, command('expire'), 'held')),
  ])
  expect(first.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  const row = await inventoryReservationModel(db.connection).findOne({ orderId }).lean().orFail()
  if (row.status === 'released') expect((await inventory.read(variantId)).committed).toBe(0)
  else expect((await inventory.read(variantId)).committed).toBe(2)
  await run((session) =>
    service.commitCod(
      session,
      command('cod-other', { orderId: new Types.ObjectId().toHexString(), quantity: 1 }),
    ),
  )
})
it('requires active caller transaction and rolls back allocation, counter and movement with caller failure', async () => {
  const session = await db.connection.startSession()
  try {
    await expect(service.commitCod(session, command('cod'))).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    })
  } finally {
    await session.endSession()
  }
  await expect(
    run(async (session) => {
      await service.commitCod(session, command('cod'))
      throw new Error('Caller failed')
    }),
  ).rejects.toThrow('Caller failed')
  expect((await inventory.read(variantId)).committed).toBe(0)
  expect(await inventoryReservationModel(db.connection).countDocuments()).toBe(0)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
})
it('forbids skipped generations, old state transitions and shipping held/released stock', async () => {
  await expect(
    run((session) => service.commitCod(session, command('skip', { generation: 2 }))),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await run((session) => service.reserve(session, command('hold'), new Date(time)))
  await expect(run((session) => service.ship(session, command('ship')))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await run((session) => service.release(session, command('release'), 'held'))
  await expect(run((session) => service.commit(session, command('commit')))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await expect(
    run((session) => service.reserve(session, command('stale'), new Date(time))),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
})

it('serializes cancellation versus shipment without a second stock effect or reopening shipment', async () => {
  await run((session) => service.commitCod(session, command('cod')))
  const outcomes = await Promise.allSettled([
    run((session) => service.ship(session, command('ship'))),
    run((session) => service.release(session, command('cancel'), 'committed')),
  ])
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  const row = await inventoryReservationModel(db.connection).findOne({ orderId }).lean().orFail()
  expect(row.activeKey).toBeUndefined()
  expect((await inventory.read(variantId)).committed).toBe(0)
  if (row.status === 'shipped') {
    expect((await inventory.read(variantId)).physical).toBe(3)
    await expect(
      run((session) => service.commitCod(session, command('reopen', { generation: 2 }))),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  } else expect((await inventory.read(variantId)).physical).toBe(5)
})
it('aborts all lines when a later allocation cannot be satisfied', async () => {
  await expect(
    run(async (session) => {
      await service.commitCod(session, command('first', { quantity: 4 }))
      await service.commitCod(
        session,
        command('second', { orderId: new Types.ObjectId().toHexString() }),
      )
    }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect((await inventory.read(variantId)).committed).toBe(0)
  expect(await inventoryReservationModel(db.connection).countDocuments()).toBe(0)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(1)
})
it('rolls back reservation and counters if movement append fails', async () => {
  const failure = vi
    .spyOn(inventoryMovementModel(db.connection), 'insertMany')
    .mockRejectedValueOnce(new Error('Synthetic ledger failure'))
  try {
    await expect(run((session) => service.commitCod(session, command('cod')))).rejects.toThrow(
      'Synthetic ledger failure',
    )
  } finally {
    failure.mockRestore()
  }
  expect((await inventory.read(variantId)).committed).toBe(0)
  expect(await inventoryReservationModel(db.connection).countDocuments()).toBe(0)
})
it('rejects invalid hold clocks and unsupported command fields before mutation', async () => {
  for (const heldAt of [new Date(Number.NaN), new Date(time + 1), new Date(time - 900000)])
    await expect(
      run((session) => service.reserve(session, command('hold'), heldAt)),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await expect(
    run((session) => service.commitCod(session, command('cod', { quantity: 0 }))),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await expect(
    run((session) => service.commitCod(session, command('cod', { stock: {} }))),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  expect(await inventoryReservationModel(db.connection).countDocuments()).toBe(0)
})
it('fails closed on missing allocation indexes and refuses incompatible bootstrap without changing stock', async () => {
  const model = inventoryReservationModel(db.connection)
  await model.collection.dropIndex('reservation_active_unique')
  try {
    await expect(run((session) => service.commitCod(session, command('cod')))).rejects.toThrow()
    expect((await inventory.read(variantId)).committed).toBe(0)
  } finally {
    await initializeAllocationPersistence(db.connection)
  }
  if (!db.connection.db) throw new Error('Missing fixture database')
  await db.connection.db.command({
    collMod: 'inventoryReservations',
    validator: { $jsonSchema: { bsonType: 'object' } },
  })
  try {
    await expect(initializeAllocationPersistence(db.connection)).rejects.toThrow(
      'reviewed migration',
    )
    await expect(run((session) => service.commitCod(session, command('cod')))).rejects.toThrow(
      'validator unavailable',
    )
  } finally {
    await db.connection.db.command({
      collMod: 'inventoryReservations',
      validator: inventoryReservationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
  await verifyAllocationPersistence(db.connection)
})
it('enforces native state validators, active uniqueness and no TTL history deletion', async () => {
  const held = await run((session) => service.reserve(session, command('hold'), new Date(time)))
  const model = inventoryReservationModel(db.connection)
  const row = await model.findById(held.id).lean().orFail()
  await expect(
    model.collection.updateOne({ _id: row._id }, { $set: { expiresAt: new Date(time + 900001) } }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    model.collection.insertOne({ ...row, _id: new Types.ObjectId(), generation: 2 }),
  ).rejects.toMatchObject({ code: 11000 })
  await expect(
    model.collection.insertOne({ ...row, _id: new Types.ObjectId(), quantity: 0 }),
  ).rejects.toMatchObject({ code: 121 })
  expect(
    (await model.collection.indexes()).every((index) => index.expireAfterSeconds === undefined),
  ).toBe(true)
  expect(row).not.toHaveProperty('__v')
  expect(row).not.toHaveProperty('updatedAt')
})

it('replays direct commitments and later transitions without another effect or cross-order key reuse', async () => {
  const allocated = await run((session) => service.commitCod(session, command('cod')))
  expect((await run((session) => service.commitCod(session, command('cod')))).id).toBe(allocated.id)
  await expect(
    run((session) =>
      service.commitCod(session, command('cod', { orderId: new Types.ObjectId().toHexString() })),
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    run((session) => service.commitCod(session, command('cod', { reason: 'Different reason' }))),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await run((session) => service.ship(session, command('ship')))
  const replay = await run((session) => service.commitCod(session, command('cod')))
  expect(replay.status).toBe('shipped')
  expect((await inventory.read(variantId)).physical).toBe(3)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(3)
})
it('commits a hold once and accepts full Unicode release reasons within the canonical limit', async () => {
  await run((session) => service.reserve(session, command('hold'), new Date(time)))
  await run((session) => service.commit(session, command('paid')))
  await run((session) => service.commit(session, command('paid')))
  await run((session) =>
    service.release(session, command('cancel', { reason: '🏏'.repeat(2000) }), 'committed'),
  )
  expect((await inventory.read(variantId)).available).toBe(5)
  expect(await inventoryMovementModel(db.connection).countDocuments()).toBe(4)
})

import { Types } from 'mongoose'
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { categoryService } from '../../src/modules/catalog/categories/category.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { productService } from '../../src/modules/catalog/products/product.service.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { variantStockAccess } from '../../src/modules/catalog/variants/variant.service.js'
import { inventoryService } from '../../src/modules/inventory/inventory.service.js'
import { inventoryMovementModel } from '../../src/modules/inventory/inventory.model.js'
import {
  initializeInventoryPersistence,
  verifyInventoryPersistence,
} from '../../src/modules/inventory/inventory.persistence.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { inTransaction } from '../../src/shared/database/transaction.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let inventory: ReturnType<typeof inventoryService>
let stock: ReturnType<typeof variantStockAccess>
let variantId: string
const actorId = '535a00000000000000000002'
const command = (deltaPhysical: number, operationKey = 'count-1') => ({
  variantId,
  actorId,
  deltaPhysical,
  operationKey,
  reason: 'Inspected stock count',
})
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(fixture.connection))
  await initializeProductPersistence(fixture.connection)
  await initializeInventoryPersistence(fixture.connection)
  stock = variantStockAccess(fixture.connection)
  inventory = inventoryService(fixture.connection, stock)
})
beforeEach(async () => {
  const models = productModels(fixture.connection)
  await models.variants.deleteMany({})
  await models.products.deleteMany({})
  await categoryModel(fixture.connection).deleteMany({})
  // Privileged isolated-fixture cleanup; the application movement model is append-only.
  await inventoryMovementModel(fixture.connection).collection.deleteMany({})
  const categories = categoryService(fixture.connection)
  const category = await categories.create({ name: 'Sports', slug: 'sports' })
  const product = await productService(fixture.connection, categories).create(
    {
      name: 'Ball',
      slug: 'ball',
      description: 'Ball',
      categoryIds: [category.id],
      status: 'active',
    },
    [{ sku: 'BALL-1', attributes: {}, regularPricePoisha: 10000 }],
  )
  const firstVariant = product.variants[0]
  if (!firstVariant) throw new Error('Missing fixture variant')
  variantId = firstVariant.id
})
afterAll(async () => {
  await fixture?.close()
})
it('starts at zero and atomically records signed physical adjustments without changing prices or allocations', async () => {
  expect(await inventory.read(variantId)).toEqual({
    physical: 0,
    reserved: 0,
    committed: 0,
    available: 0,
  })
  const first = await inventory.adjustPhysical(command(5))
  await inventory.adjustPhysical(command(-2, 'count-2'))
  expect(await inventory.read(variantId)).toEqual({
    physical: 3,
    reserved: 0,
    committed: 0,
    available: 3,
  })
  const rows = await inventoryMovementModel(fixture.connection).find().lean()
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({
    type: 'adjustment',
    deltaReserved: 0,
    deltaCommitted: 0,
    actor: { type: 'admin', id: new Types.ObjectId(actorId) },
  })
  expect(first.movementId).toBe(rows[0]?._id.toHexString())
  expect(rows[0]).not.toHaveProperty('createdAt')
  const variant = await productModels(fixture.connection)
    .variants.findById(variantId)
    .lean()
    .orFail()
  expect(variant.regularPricePoisha).toBe(10000)
  expect(variant.revision).toBe(2)
})
it('serializes duplicate commands and returns one stable movement id without double counting', async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => inventory.adjustPhysical(command(1))),
  )
  expect(new Set(results.map((result) => result.movementId)).size).toBe(1)
  expect((await inventory.read(variantId)).physical).toBe(1)
  expect(await inventoryMovementModel(fixture.connection).countDocuments()).toBe(1)
})
it('rejects replay with a different quantity, actor or reason', async () => {
  await inventory.adjustPhysical(command(5))
  for (const patch of [
    { deltaPhysical: 4 },
    { actorId: new Types.ObjectId().toHexString() },
    { reason: 'Different count' },
  ])
    await expect(inventory.adjustPhysical({ ...command(5), ...patch })).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    })
  expect((await inventory.read(variantId)).physical).toBe(5)
})
it('keeps available nonnegative under concurrent deductions', async () => {
  await inventory.adjustPhysical(command(1))
  const outcomes = await Promise.allSettled([
    inventory.adjustPhysical(command(-1, 'take-1')),
    inventory.adjustPhysical(command(-1, 'take-2')),
  ])
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect((await inventory.read(variantId)).available).toBe(0)
  expect(await inventoryMovementModel(fixture.connection).countDocuments()).toBe(2)
})
it('protects both reserved and committed quantities and integer overflow', async () => {
  await inventory.adjustPhysical(command(10))
  await inTransaction(fixture.connection, async (session) => {
    expect(
      await stock.change(
        new Types.ObjectId(variantId),
        { physical: 0, reserved: 3, committed: 4 },
        session,
      ),
    ).not.toBeNull()
  })
  await expect(inventory.adjustPhysical(command(-4, 'too-much'))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await inventory.adjustPhysical(command(-3, 'remaining'))
  expect(await inventory.read(variantId)).toEqual({
    physical: 7,
    reserved: 3,
    committed: 4,
    available: 0,
  })
  await expect(
    inventory.adjustPhysical(command(Number.MAX_SAFE_INTEGER, 'overflow')),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
})
it('rolls back counter changes if the movement cannot be committed', async () => {
  const model = inventoryMovementModel(fixture.connection)
  const insertion = vi
    .spyOn(model, 'create')
    .mockRejectedValueOnce(new Error('synthetic ledger failure'))
  await expect(inventory.adjustPhysical(command(5))).rejects.toThrow('synthetic ledger failure')
  insertion.mockRestore()
  expect((await inventory.read(variantId)).physical).toBe(0)
  expect(await model.countDocuments()).toBe(0)
})
it('requires real transactions for the stock capability and never exposes a raw model', async () => {
  expect(Object.keys(stock).sort()).toEqual(['change', 'read'])
  const session = await fixture.connection.startSession()
  try {
    await expect(
      stock.change(
        new Types.ObjectId(variantId),
        { physical: 1, reserved: 0, committed: 0 },
        session,
      ),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  } finally {
    await session.endSession()
  }
})
it('has an additive explicit bootstrap and refuses missing unique indexes before changing stock', async () => {
  await initializeInventoryPersistence(fixture.connection)
  const model = inventoryMovementModel(fixture.connection)
  await model.collection.dropIndex('movement_operation_unique')
  try {
    await expect(inventory.adjustPhysical(command(1))).rejects.toThrow()
    expect((await inventory.read(variantId)).physical).toBe(0)
  } finally {
    await initializeInventoryPersistence(fixture.connection)
  }
  await verifyInventoryPersistence(fixture.connection)
})
it('rejects invalid/missing identities and prevents app-level movement edits/deletions', async () => {
  await expect(inventory.read(new Types.ObjectId().toHexString())).rejects.toMatchObject({
    code: 'NOT_FOUND',
  })
  await expect(
    inventory.adjustPhysical({ ...command(1), stock: { physical: 10 } }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await inventory.adjustPhysical(command(1))
  const model = inventoryMovementModel(fixture.connection)
  await expect(model.updateOne({}, { $set: { reason: 'changed' } })).rejects.toThrow('append-only')
  await expect(model.deleteMany({})).rejects.toThrow('append-only')
})

it('serializes distinct concurrent increases and preserves replay after later writes', async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      inventory.adjustPhysical(command(1, `count-${index}`)),
    ),
  )
  expect(new Set(results.map((result) => result.movementId)).size).toBe(12)
  expect((await inventory.read(variantId)).physical).toBe(12)
  const original = await inventory.adjustPhysical(command(1, 'count-0'))
  expect(original).toEqual(results[0])
  expect((await inventory.read(variantId)).physical).toBe(12)
})
it('rejects malformed persisted ledger facts and direct duplicate keys on the real server', async () => {
  await inventory.adjustPhysical(command(1))
  const model = inventoryMovementModel(fixture.connection)
  const row = await model.findOne().lean().orFail()
  for (const patch of [
    { deltaPhysical: 1.5 },
    { deltaReserved: Number.MAX_SAFE_INTEGER + 1 },
    { actor: { type: 'customer' } },
    { unknown: true },
    { reason: null },
  ]) {
    await expect(
      model.collection.insertOne({
        ...row,
        _id: new Types.ObjectId(),
        operationKey: new Types.ObjectId().toHexString(),
        ...patch,
      }),
    ).rejects.toMatchObject({ code: 121 })
  }
  await expect(
    model.collection.insertOne({ ...row, _id: new Types.ObjectId() }),
  ).rejects.toMatchObject({ code: 11000 })
  const document = await model.findById(row._id).orFail()
  document.reason = 'tampered'
  await expect(document.save()).rejects.toThrow('append-only')
  await expect(document.deleteOne()).rejects.toThrow('append-only')
  await expect(model.bulkWrite([{ deleteOne: { filter: { _id: row._id } } }])).rejects.toThrow(
    'append-only',
  )
})
it('rejects missing variants, invalid clocks, and corrupt counters without a movement', async () => {
  await expect(
    inventory.adjustPhysical({ ...command(1), variantId: new Types.ObjectId().toHexString() }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const invalidClock = inventoryService(fixture.connection, stock, () => new Date(NaN))
  await expect(invalidClock.adjustPhysical(command(1))).rejects.toThrow('Invalid inventory clock')
  await productModels(fixture.connection).variants.collection.updateOne(
    { _id: new Types.ObjectId(variantId) },
    { $set: { 'stock.physical': 1.5 } },
    { bypassDocumentValidation: true },
  )
  await expect(inventory.read(variantId)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(inventory.adjustPhysical(command(1))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await inventoryMovementModel(fixture.connection).countDocuments()).toBe(0)
})
it('leaves incompatible validators untouched and fails closed before a counter mutation', async () => {
  const { inventoryMovementValidator } = await import(
    '../../src/modules/inventory/inventory.persistence.js'
  )
  if (!fixture.connection.db) throw new Error('Missing fixture DB')
  const weakened = { $jsonSchema: { bsonType: 'object' } }
  await fixture.connection.db.command({ collMod: 'inventoryMovements', validator: weakened })
  try {
    await expect(initializeInventoryPersistence(fixture.connection)).rejects.toThrow(
      'reviewed migration',
    )
    await expect(inventory.adjustPhysical(command(1))).rejects.toThrow('validator unavailable')
    expect((await inventory.read(variantId)).physical).toBe(0)
  } finally {
    await fixture.connection.db.command({
      collMod: 'inventoryMovements',
      validator: inventoryMovementValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
})

it('supports exact safe-integer boundaries and refuses overflow without a new movement', async () => {
  await inventory.adjustPhysical(command(Number.MAX_SAFE_INTEGER))
  await expect(inventory.adjustPhysical(command(1, 'too-large'))).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect((await inventory.read(variantId)).physical).toBe(Number.MAX_SAFE_INTEGER)
  await inventory.adjustPhysical(command(-Number.MAX_SAFE_INTEGER, 'empty'))
  expect((await inventory.read(variantId)).physical).toBe(0)
  expect(await inventoryMovementModel(fixture.connection).countDocuments()).toBe(2)
})
it('catalog capability rejects unsafe deltas and reserved/committed underflow', async () => {
  await inTransaction(fixture.connection, async (session) => {
    for (const delta of [
      { physical: 0, reserved: -1, committed: 0 },
      { physical: 0, reserved: 0, committed: -1 },
    ])
      expect(await stock.change(new Types.ObjectId(variantId), delta, session)).toBeNull()
    await expect(
      stock.change(
        new Types.ObjectId(variantId),
        { physical: NaN, reserved: 0, committed: 0 },
        session,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
  expect(await inventory.read(variantId)).toEqual({
    physical: 0,
    reserved: 0,
    committed: 0,
    available: 0,
  })
})

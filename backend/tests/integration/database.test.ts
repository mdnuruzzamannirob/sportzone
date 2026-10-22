import { Schema, Types, type ClientSession } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DatabaseError, openDatabase } from '../../src/config/database.js'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../src/shared/database/indexes.js'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../src/shared/database/schema.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { isolatedDatabase } from '../helpers/database.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
interface RecordData {
  key: string
  amount: number
  currency: string
  optionalRef?: Types.ObjectId
}
const schema = new Schema<RecordData>(
  {
    key: { type: String, required: true },
    amount: { ...integerField(), required: true },
    currency: { type: String, enum: ['BDT'], required: true },
    optionalRef: optionalObjectIdField(),
  },
  mutableSchemaOptions,
)
schema.index({ key: 1 }, { unique: true, name: 'fixture_key_unique' })
schema.index(
  { optionalRef: 1 },
  {
    unique: true,
    name: 'fixture_optional_ref_unique',
    partialFilterExpression: { optionalRef: { $type: 'objectId' } },
  },
)
function records() {
  return fixture.connection.model<RecordData>('FixtureRecord', schema, 'fixture_records')
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await createDeclaredIndexes(records())
}, 120000)
afterAll(async () => {
  await fixture?.close()
})
describe('real replica-set persistence foundation', () => {
  it('verifies real server version/topology and bounded connection options', async () => {
    const db = fixture.connection.db
    expect((await db?.admin().command({ hello: 1 }))?.setName).toBeTruthy()
    expect((await db?.admin().command({ buildInfo: 1 }))?.version).toBe('8.0.16')
    expect(fixture.connection.getClient().options.maxPoolSize).toBe(10)
    expect(fixture.connection.getClient().options.minPoolSize).toBe(0)
    expect(fixture.connection.name).toMatch(/^sportzone_test_/)
  })
  it('has no automatic index deployment and preserves extra indexes', async () => {
    const model = records()
    expect(model.schema.options.autoIndex).toBe(false)
    await model.collection.createIndex({ currency: 1 }, { name: 'extra_preserved' })
    expect((await verifyDeclaredIndexes(model)).extraIndexes).toContain('extra_preserved')
    await createDeclaredIndexes(model)
    expect((await model.listIndexes()).some((index) => index.name === 'extra_preserved')).toBe(true)
  })
  it('detects missing declared indexes before explicit additive repair', async () => {
    await records().collection.dropIndex('fixture_key_unique')
    await expect(verifyDeclaredIndexes(records())).rejects.toMatchObject({
      code: 'INDEX_MISMATCH',
    })
    await createDeclaredIndexes(records())
    expect(
      (await records().listIndexes()).find((index) => index.name === 'fixture_key_unique')?.unique,
    ).toBe(true)
  })
  it('enforces unique indexes under concurrent inserts', async () => {
    const results = await Promise.allSettled([
      records().create({ key: 'duplicate', amount: 1, currency: 'BDT' }),
      records().create({ key: 'duplicate', amount: 1, currency: 'BDT' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason.code).toBe(11000)
  })
  it('enforces partial unique reference indexes while permitting absent references', async () => {
    const optionalRef = new Types.ObjectId()
    await records().create({ key: 'with-ref', amount: 1, currency: 'BDT', optionalRef })
    await expect(
      records().create({
        key: 'duplicate-ref',
        amount: 1,
        currency: 'BDT',
        optionalRef,
      }),
    ).rejects.toMatchObject({ code: 11000 })
    const nullDoc = new (records())({ key: 'null-ref', amount: 1, currency: 'BDT' })
    nullDoc.set('optionalRef', null)
    await expect(nullDoc.save()).rejects.toThrow()
  })
  it('commits two document writes atomically and returns callback result', async () => {
    let completedSession: ClientSession | undefined
    const result = await inTransaction(fixture.connection, async (session) => {
      completedSession = session
      await records().create([{ key: 'commit-a', amount: 100, currency: 'BDT' }], {
        session,
      })
      await records().create([{ key: 'commit-b', amount: 200, currency: 'BDT' }], {
        session,
      })
      return 'committed'
    })
    expect(completedSession?.hasEnded).toBe(true)
    expect(result).toBe('committed')
    expect(await records().countDocuments({ key: { $in: ['commit-a', 'commit-b'] } })).toBe(2)
  })
  it('rolls back all writes on callback rejection', async () => {
    await expect(
      inTransaction(fixture.connection, async (session) => {
        await records().create([{ key: 'abort-a', amount: 1, currency: 'BDT' }], {
          session,
        })
        await records().create([{ key: 'abort-b', amount: 2, currency: 'BDT' }], {
          session,
        })
        throw new Error('Synthetic rollback')
      }),
    ).rejects.toThrow('Synthetic rollback')
    expect(await records().countDocuments({ key: { $in: ['abort-a', 'abort-b'] } })).toBe(0)
  })
  it('rolls back a companion write when a unique-key insert fails', async () => {
    await expect(
      inTransaction(fixture.connection, async (session) => {
        await records().create([{ key: 'before-duplicate', amount: 1, currency: 'BDT' }], {
          session,
        })
        await records().create([{ key: 'duplicate', amount: 2, currency: 'BDT' }], {
          session,
        })
      }),
    ).rejects.toMatchObject({ code: 11000 })
    expect(await records().countDocuments({ key: 'before-duplicate' })).toBe(0)
  })
  it('serializes competing transactions without lost increments', async () => {
    await records().create({ key: 'counter', amount: 0, currency: 'BDT' })
    await Promise.all(
      Array.from({ length: 4 }, () =>
        inTransaction(fixture.connection, async (session) => {
          const record = await records().findOne({ key: 'counter' }).session(session)
          if (!record) throw new Error('Missing fixture')
          record.amount += 1
          await record.save({ session })
        }),
      ),
    )
    expect((await records().findOne({ key: 'counter' }))?.amount).toBe(4)
  })
  it('rejects nested independent transactions and rolls back the parent', async () => {
    await expect(
      inTransaction(fixture.connection, async (session) => {
        await records().create([{ key: 'nested', amount: 1, currency: 'BDT' }], {
          session,
        })
        await inTransaction(fixture.connection, async () => undefined)
      }),
    ).rejects.toMatchObject({ code: 'NESTED_TRANSACTION' })
    expect(await records().countDocuments({ key: 'nested' })).toBe(0)
  })
  it('uses strict schemas, ObjectIds, timestamps and absent optional fields', async () => {
    const doc = await records().create({
      key: 'conventions',
      amount: 0,
      currency: 'BDT',
    })
    expect(doc._id).toBeInstanceOf(Types.ObjectId)
    expect(doc.toObject()).toMatchObject({
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(doc.toObject()).not.toHaveProperty('optionalRef')
    expect(doc.toObject()).not.toHaveProperty('__v')
    await expect(
      records().updateOne({ key: 'conventions' }, { $set: { unapproved: true } }),
    ).rejects.toThrow()
    await expect(records().findOne({ unapproved: true })).rejects.toThrow()
    await expect(
      records().create({ key: 'wrong-currency', amount: 1, currency: 'USD' }),
    ).rejects.toThrow()
  })
  it.each([-1, 1.2, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '100', true])(
    'rejects invalid stored amount %s',
    async (amount) => {
      const doc = new (records())({ key: `invalid-${String(amount)}`, currency: 'BDT' })
      doc.set('amount', amount)
      await expect(doc.save()).rejects.toThrow()
    },
  )
  it('restores Mongoose document state after an aborted save', async () => {
    const doc = new (records())({ key: 'document-retry', amount: 1, currency: 'BDT' })
    await expect(
      inTransaction(fixture.connection, async (session) => {
        await doc.save({ session })
        throw new Error('Abort save')
      }),
    ).rejects.toThrow('Abort save')
    expect(doc.isNew).toBe(true)
    doc.$session(null)
    await doc.save()
    expect(await records().countDocuments({ key: 'document-retry' })).toBe(1)
  })
  it('rejects standalone MongoDB and releases failed connection', async () => {
    const standalone = await MongoMemoryServer.create({
      binary: { version: '8.0.16' },
      instance: { ip: '127.0.0.1', storageEngine: 'wiredTiger' },
    })
    try {
      await expect(
        openDatabase(standalone.getUri(), 'sportzone_test_standalone'),
      ).rejects.toMatchObject({ code: 'REPLICA_SET_REQUIRED' })
    } finally {
      await standalone.stop()
    }
  })
  it('supports an independent connect/close lifecycle', async () => {
    const other = await openDatabase(fixture.replica.getUri(), 'sportzone_test_lifecycle')
    expect(other.readyState).toBe(1)
    await other.close()
    expect(other.readyState).toBe(0)
    expect(fixture.connection.readyState).toBe(1)
  })
})
it('rejects invalid database configuration without echoing input', async () => {
  for (const [uri, name] of [
    ['invalid-private-value', 'sportzone_test'],
    ['mongodb://127.0.0.1:1', 'admin'],
  ]) {
    await expect(openDatabase(uri ?? '', name ?? '')).rejects.toBeInstanceOf(DatabaseError)
    await expect(openDatabase(uri ?? '', name ?? '')).rejects.not.toThrow('invalid-private-value')
  }
})

it('redacts actual connection failure diagnostics', async () => {
  await expect(
    openDatabase('mongodb://127.0.0.1:1/synthetic', 'sportzone_test_failure'),
  ).rejects.toMatchObject({
    code: 'CONNECTION_FAILED',
    message: 'Database operation failed: CONNECTION_FAILED.',
  })
})

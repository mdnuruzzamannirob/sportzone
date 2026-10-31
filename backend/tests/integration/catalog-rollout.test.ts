import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testEnvironment } from '../helpers/environment.js'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import {
  inspectCatalogRollout,
  applyCatalogRollout,
} from '../../src/modules/catalog/catalog-rollout.service.js'
import { verifyProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { verifyDeclaredIndexes } from '../../src/shared/database/indexes.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
beforeAll(async () => {
  db = await isolatedDatabase()
})
beforeEach(async () => {
  await db.connection.dropDatabase()
})
afterAll(async () => {
  await db?.close()
})

it('inventory is read-only even when every catalog collection is missing', async () => {
  const plan = await inspectCatalogRollout(db.connection)
  expect(plan.safeToApply).toBe(true)
  expect(plan.collections).toHaveLength(3)
  expect(plan.collections.every((row) => !row.exists && row.missingIndexes.length > 0)).toBe(true)
  expect(await db.connection.db?.listCollections().toArray()).toEqual([])
  expect(await inspectCatalogRollout(db.connection)).toEqual(plan)
})

it('reviewed initial rollout adds canonical validators/indexes and replay preserves records', async () => {
  const plan = await inspectCatalogRollout(db.connection)
  const result = await applyCatalogRollout(db.connection, plan.digest)
  expect(result.collections.every((row) => row.exists && row.missingIndexes.length === 0)).toBe(
    true,
  )
  await verifyProductPersistence(db.connection)
  await verifyDeclaredIndexes(categoryModel(db.connection))
  const saved = await categoryModel(db.connection).create({ name: 'Synthetic', slug: 'synthetic' })
  const replay = await inspectCatalogRollout(db.connection)
  await applyCatalogRollout(db.connection, replay.digest)
  expect(await categoryModel(db.connection).countDocuments({ _id: saved._id })).toBe(1)
})

it('all collections are inspected before mutation so a later validator conflict creates nothing else', async () => {
  await db.connection.db?.createCollection('productVariants', {
    validator: { $jsonSchema: { bsonType: 'object' } },
  })
  const plan = await inspectCatalogRollout(db.connection)
  expect(plan.safeToApply).toBe(false)
  expect(plan.collections.find((row) => row.name === 'productVariants')?.blockers).toContain(
    'VALIDATOR_CONFLICT',
  )
  await expect(applyCatalogRollout(db.connection, plan.digest)).rejects.toThrow(
    'fresh reviewed plan',
  )
  expect((await db.connection.db?.listCollections().toArray())?.map((row) => row.name)).toEqual([
    'productVariants',
  ])
})

it('nonempty unindexed collections require an existing-data migration and preserve all records', async () => {
  await db.connection.db?.collection('categories').insertOne({ synthetic: 'preserve' })
  const plan = await inspectCatalogRollout(db.connection)
  expect(plan.collections[0]?.blockers).toContain('EXISTING_DATA_REQUIRES_MIGRATION')
  await expect(applyCatalogRollout(db.connection, plan.digest)).rejects.toThrow()
  expect(await db.connection.db?.collection('categories').countDocuments()).toBe(1)
  expect(await db.connection.db?.listCollections({ name: 'products' }).next()).toBeNull()
})

it('stale reviewed inventory is rejected when another operator changes target state', async () => {
  const old = await inspectCatalogRollout(db.connection)
  await db.connection.db?.createCollection('categories')
  await expect(applyCatalogRollout(db.connection, old.digest)).rejects.toThrow(
    'fresh reviewed plan',
  )
  expect(await db.connection.db?.listCollections({ name: 'products' }).next()).toBeNull()
})

it('conflicting declared index names are blocked and unrelated indexes survive an additive rollout', async () => {
  await db.connection.db?.createCollection('categories')
  await db.connection.db
    ?.collection('categories')
    .createIndex({ wrong: 1 }, { name: 'category_slug_unique' })
  const conflict = await inspectCatalogRollout(db.connection)
  expect(conflict.collections[0]?.blockers).toContain('DECLARED_INDEX_CONFLICT')
  await expect(applyCatalogRollout(db.connection, conflict.digest)).rejects.toThrow()
  // This test owns an isolated empty database, never a configured external target.
  await db.connection.dropDatabase()
  await db.connection.db?.createCollection('categories')
  await db.connection.db
    ?.collection('categories')
    .createIndex({ synthetic: 1 }, { name: 'extra_preserved' })
  const plan = await inspectCatalogRollout(db.connection)
  expect(plan.safeToApply).toBe(true)
  const result = await applyCatalogRollout(db.connection, plan.digest)
  expect(result.collections[0]?.extraIndexes).toContain('extra_preserved')
})

it('invalid review digests never create persistence', async () => {
  await expect(applyCatalogRollout(db.connection, '')).rejects.toThrow('Reviewed plan digest')
  expect(await db.connection.db?.listCollections().toArray()).toEqual([])
})

it('operator CLI refuses production and never overwrites an existing report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sportzone-catalog-rollout-'))
  const report = join(directory, 'report.json')
  const env = {
    ...testEnvironment(),
    NODE_ENV: 'production',
    APP_ENV: 'staging',
    MONGODB_DB_NAME: 'synthetic_staging',
    MONGODB_URI: 'mongodb://127.0.0.1:1/synthetic',
    API_PUBLIC_ORIGIN: 'https://api.example.test',
    STOREFRONT_ORIGIN: 'https://shop.example.test',
    ADMIN_ORIGIN: 'https://admin.example.test',
    CORS_ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test',
  }
  try {
    const production = spawnSync(process.execPath, ['scripts/staging-catalog.mjs', report], {
      env: { ...env, APP_ENV: 'production' },
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(production.status).toBe(1)
    expect(existsSync(report)).toBe(false)
    writeFileSync(report, 'preserve-existing-private-report')
    const collision = spawnSync(process.execPath, ['scripts/staging-catalog.mjs', report], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(collision.status).toBe(1)
    expect(readFileSync(report, 'utf8')).toBe('preserve-existing-private-report')
    expect(collision.stderr).not.toContain('127.0.0.1')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('operator CLI refuses expired review evidence before contacting the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sportzone-catalog-approval-'))
  const approval = join(directory, 'approval.json'),
    report = join(directory, 'report.json')
  try {
    writeFileSync(
      approval,
      JSON.stringify({
        environment: 'staging',
        databaseName: 'synthetic_staging',
        planDigest: 'a'.repeat(64),
        approvedBy: 'Synthetic isolated reviewer',
        approvedAt: '2020-01-01T00:00:00Z',
        validUntil: '2020-01-02T00:00:00Z',
        backupReference: 'synthetic-empty-baseline',
        maintenanceReference: 'synthetic-writers-paused',
      }),
    )
    const result = spawnSync(
      process.execPath,
      ['scripts/staging-catalog.mjs', '--apply', approval, report],
      {
        env: {
          ...testEnvironment(),
          NODE_ENV: 'production',
          APP_ENV: 'staging',
          MONGODB_DB_NAME: 'synthetic_staging',
          MONGODB_URI: 'mongodb://127.0.0.1:1/synthetic',
          API_PUBLIC_ORIGIN: 'https://api.example.test',
          STOREFRONT_ORIGIN: 'https://shop.example.test',
          ADMIN_ORIGIN: 'https://admin.example.test',
          CORS_ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test',
        },
        encoding: 'utf8',
        timeout: 10000,
      },
    )
    expect(result.status).toBe(1)
    expect(existsSync(report)).toBe(false)
    expect(result.stderr).not.toContain('127.0.0.1')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('competing initial rollouts preserve canonical state and can be resumed from fresh inventory', async () => {
  const plan = await inspectCatalogRollout(db.connection)
  const outcomes = await Promise.allSettled([
    applyCatalogRollout(db.connection, plan.digest),
    applyCatalogRollout(db.connection, plan.digest),
  ])
  expect(outcomes.some((result) => result.status === 'fulfilled')).toBe(true)
  const final = await inspectCatalogRollout(db.connection)
  expect(final.safeToApply).toBe(true)
  expect(
    final.collections.every((row) => row.documentCount === 0 && row.missingIndexes.length === 0),
  ).toBe(true)
  await applyCatalogRollout(db.connection, final.digest)
  await verifyProductPersistence(db.connection)
})

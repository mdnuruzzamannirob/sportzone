import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { categoryModel } from './categories/category.model.js'
import { productModels } from './products/product.model.js'
import {
  initializeProductPersistence,
  productCollectionValidators,
  verifyProductPersistence,
} from './products/product.persistence.js'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'

const validators: Readonly<Record<string, unknown>> = productCollectionValidators
export async function inspectCatalogRollout(connection: Connection) {
  if (!connection.db) throw new Error('Catalog rollout database unavailable.')
  const products = productModels(connection)
  const collections = []
  for (const model of [categoryModel(connection), products.products, products.variants]) {
    const name = model.collection.collectionName
    const current = await connection.db.listCollections({ name }, { nameOnly: false }).next()
    const declared = model.schema.indexes()
    const count = current
      ? await connection.db.collection(name).countDocuments({}, { maxTimeMS: 5000 })
      : 0
    const difference = current
      ? await model.diffIndexes()
      : { toCreate: declared.map(([keys]) => keys), toDrop: [] }
    const existingIndexes = current ? await model.listIndexes() : []
    const missingIndexes = declared
      .filter(([keys]) => difference.toCreate.some((missing) => isDeepStrictEqual(keys, missing)))
      .map(([, options]) => String(options.name))
    const blockers: string[] = []
    const expectedValidator = validators[name]
    if (
      current &&
      expectedValidator &&
      (!isDeepStrictEqual(current.options?.validator, expectedValidator) ||
        current.options?.validationLevel !== 'strict' ||
        current.options?.validationAction !== 'error')
    )
      blockers.push('VALIDATOR_CONFLICT')
    // Existing-data migrations need their own duplicate/invalid-data and recovery review.
    if (count > 0 && difference.toCreate.length) blockers.push('EXISTING_DATA_REQUIRES_MIGRATION')
    if (difference.toDrop.some((name) => declared.some(([, options]) => options.name === name)))
      blockers.push('DECLARED_INDEX_CONFLICT')
    if (
      declared.some(
        ([keys]) =>
          Object.values(keys).includes('text') &&
          difference.toCreate.some((missing) => isDeepStrictEqual(keys, missing)),
      ) &&
      existingIndexes.some((index) => Object.values(index.key).includes('text'))
    )
      blockers.push('TEXT_INDEX_CONFLICT')
    collections.push({
      name,
      exists: Boolean(current),
      documentCount: count,
      missingIndexes,
      extraIndexes: [...difference.toDrop].sort(),
      blockers,
    })
  }
  const state = {
    version: 1,
    databaseName: connection.name,
    collections,
    safeToApply: collections.every((collection) => collection.blockers.length === 0),
  }
  const digest = createHash('sha256').update(JSON.stringify(state)).digest('hex')
  return { ...state, digest }
}

export async function applyCatalogRollout(connection: Connection, expectedDigest: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error('Reviewed plan digest required.')
  const before = await inspectCatalogRollout(connection)
  if (!before.safeToApply || before.digest !== expectedDigest)
    throw new Error('Catalog rollout requires a fresh reviewed plan.')
  // DDL is intentionally outside transactions. Caller must establish the reviewed writer pause.
  // Native validators/unique indexes reject incompatible concurrent writes; no records are changed.
  await initializeProductPersistence(connection)
  await createDeclaredIndexes(categoryModel(connection))
  await verifyProductPersistence(connection)
  await verifyDeclaredIndexes(categoryModel(connection))
  return inspectCatalogRollout(connection)
}

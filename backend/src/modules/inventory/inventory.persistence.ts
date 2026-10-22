import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { inventoryMovementModel } from './inventory.model.js'

const objectId = { bsonType: 'objectId' }
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: -Number.MAX_SAFE_INTEGER,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
export const inventoryMovementValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'variantId',
      'type',
      'deltaPhysical',
      'deltaReserved',
      'deltaCommitted',
      'operationKey',
      'actor',
      'reason',
      'occurredAt',
    ],
    properties: {
      _id: objectId,
      variantId: objectId,
      orderId: objectId,
      reservationId: objectId,
      type: {
        enum: [
          'opening',
          'adjustment',
          'reserve',
          'release_hold',
          'commit_hold',
          'commit_cod',
          'release_commit',
          'dispatch',
          'return_receipt',
        ],
      },
      deltaPhysical: integer,
      deltaReserved: integer,
      deltaCommitted: integer,
      operationKey: { bsonType: 'string', minLength: 1, maxLength: 128 },
      actor: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { enum: ['system', 'admin'] },
          id: objectId,
        },
      },
      reason: { bsonType: 'string', minLength: 1, maxLength: 2000 },
      occurredAt: { bsonType: 'date' },
    },
  },
}
async function collectionState(connection: Connection) {
  if (!connection.db) throw new Error('Inventory database is unavailable.')
  return connection.db.listCollections({ name: 'inventoryMovements' }, { nameOnly: false }).next()
}
function compatible(existing: Awaited<ReturnType<typeof collectionState>>) {
  return (
    existing &&
    isDeepStrictEqual(existing.options?.validator, inventoryMovementValidator) &&
    existing.options?.validationLevel === 'strict' &&
    existing.options?.validationAction === 'error'
  )
}
export async function verifyInventoryPersistence(connection: Connection) {
  if (!compatible(await collectionState(connection)))
    throw new Error('Inventory validator unavailable.')
  await verifyDeclaredIndexes(inventoryMovementModel(connection))
}
// Explicit additive bootstrap only; existing validators/indexes/history are never replaced or dropped.
export async function initializeInventoryPersistence(connection: Connection) {
  const existing = await collectionState(connection)
  if (existing && !compatible(existing))
    throw new Error('Inventory collection requires a reviewed migration.')
  if (!existing) {
    if (!connection.db) throw new Error('Inventory database is unavailable.')
    await connection.db.createCollection('inventoryMovements', {
      validator: inventoryMovementValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
  await inventoryMovementModel(connection).createIndexes()
  await verifyInventoryPersistence(connection)
}

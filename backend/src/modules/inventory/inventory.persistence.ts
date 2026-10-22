import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { inventoryMovementModel, inventoryReservationModel } from './inventory.model.js'

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

export const inventoryReservationValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'orderId', 'variantId', 'quantity', 'generation', 'status'],
    properties: {
      _id: objectId,
      orderId: objectId,
      variantId: objectId,
      quantity: { ...integer, minimum: 1, maximum: 50 },
      generation: { ...integer, minimum: 1 },
      status: { enum: ['held', 'committed', 'released', 'shipped'] },
      activeKey: { enum: ['active'] },
      heldAt: { bsonType: 'date' },
      expiresAt: { bsonType: 'date' },
      committedAt: { bsonType: 'date' },
      releasedAt: { bsonType: 'date' },
      shippedAt: { bsonType: 'date' },
      releaseReason: { bsonType: 'string', minLength: 1, maxLength: 2000 },
      lastOperationKey: { bsonType: 'string', minLength: 1, maxLength: 128 },
    },
    oneOf: [
      {
        properties: { status: { enum: ['held'] } },
        required: ['activeKey', 'heldAt', 'expiresAt'],
        not: {
          anyOf: [
            { required: ['committedAt'] },
            { required: ['releasedAt'] },
            { required: ['shippedAt'] },
          ],
        },
      },
      {
        properties: { status: { enum: ['committed'] } },
        required: ['activeKey', 'committedAt'],
        not: {
          anyOf: [
            { required: ['expiresAt'] },
            { required: ['releasedAt'] },
            { required: ['shippedAt'] },
          ],
        },
      },
      {
        properties: { status: { enum: ['released'] } },
        required: ['releasedAt', 'releaseReason'],
        not: {
          anyOf: [
            { required: ['activeKey'] },
            { required: ['expiresAt'] },
            { required: ['shippedAt'] },
          ],
        },
      },
      {
        properties: { status: { enum: ['shipped'] } },
        required: ['shippedAt', 'committedAt'],
        not: {
          anyOf: [
            { required: ['activeKey'] },
            { required: ['expiresAt'] },
            { required: ['releasedAt'] },
          ],
        },
      },
    ],
  },
  $expr: {
    $or: [{ $ne: ['$status', 'held'] }, { $eq: ['$expiresAt', { $add: ['$heldAt', 900000] }] }],
  },
}
export async function verifyAllocationPersistence(connection: Connection) {
  await verifyInventoryPersistence(connection)
  if (!connection.db) throw new Error('Inventory database is unavailable.')
  const collection = await connection.db
    .listCollections({ name: 'inventoryReservations' }, { nameOnly: false })
    .next()
  if (
    !collection ||
    !isDeepStrictEqual(collection.options?.validator, inventoryReservationValidator) ||
    collection.options?.validationLevel !== 'strict' ||
    collection.options?.validationAction !== 'error'
  )
    throw new Error('Inventory reservation validator unavailable.')
  await verifyDeclaredIndexes(inventoryReservationModel(connection))
}
export async function initializeAllocationPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Inventory database is unavailable.')
  const collection = await connection.db
    .listCollections({ name: 'inventoryReservations' }, { nameOnly: false })
    .next()
  if (
    collection &&
    (!isDeepStrictEqual(collection.options?.validator, inventoryReservationValidator) ||
      collection.options?.validationLevel !== 'strict' ||
      collection.options?.validationAction !== 'error')
  )
    throw new Error('Inventory reservations require a reviewed migration.')
  await initializeInventoryPersistence(connection)
  if (!collection)
    await connection.db.createCollection('inventoryReservations', {
      validator: inventoryReservationValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await inventoryReservationModel(connection).createIndexes()
  await verifyAllocationPersistence(connection)
}

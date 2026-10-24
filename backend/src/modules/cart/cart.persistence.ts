import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { cartModel } from './cart.model.js'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'

const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
export const cartValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'userId', 'items', 'revision', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      revision: integer,
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      items: {
        bsonType: 'array',
        maxItems: 100,
        items: {
          bsonType: 'object',
          additionalProperties: false,
          required: ['variantId', 'quantity', 'addedAt'],
          properties: {
            variantId: { bsonType: 'objectId' },
            quantity: { ...integer, minimum: 1, maximum: 50 },
            addedAt: { bsonType: 'date' },
          },
        },
      },
    },
  },
  $expr: { $eq: [{ $size: '$items' }, { $size: { $setUnion: ['$items.variantId', []] } }] },
}
async function verifyOptions(connection: Connection) {
  const collection = await connection.db
    ?.listCollections({ name: 'carts' }, { nameOnly: false })
    .next()
  if (
    !collection ||
    !isDeepStrictEqual(collection.options?.validator, cartValidator) ||
    collection.options?.validationLevel !== 'strict' ||
    collection.options?.validationAction !== 'error'
  )
    throw new Error('Cart persistence requires reviewed bootstrap/migration.')
}
export async function initializeCartPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  const exists = await connection.db.listCollections({ name: 'carts' }).hasNext()
  if (!exists)
    await connection.db.createCollection('carts', {
      validator: cartValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyOptions(connection)
  await createDeclaredIndexes(cartModel(connection))
}
export async function verifyCartPersistence(connection: Connection) {
  await verifyOptions(connection)
  await verifyDeclaredIndexes(cartModel(connection))
}

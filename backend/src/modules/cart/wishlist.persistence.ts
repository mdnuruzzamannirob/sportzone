import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { wishlistModel } from './wishlist.model.js'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'

export const wishlistValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'userId', 'productIds', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      productIds: {
        bsonType: 'array',
        maxItems: 200,
        uniqueItems: true,
        items: { bsonType: 'objectId' },
      },
    },
  },
}
async function verifyOptions(connection: Connection) {
  const collection = await connection.db
    ?.listCollections({ name: 'wishlists' }, { nameOnly: false })
    .next()
  if (
    !collection ||
    !isDeepStrictEqual(collection.options?.validator, wishlistValidator) ||
    collection.options?.validationLevel !== 'strict' ||
    collection.options?.validationAction !== 'error'
  )
    throw new Error('Wishlist persistence requires reviewed bootstrap/migration.')
}
export async function initializeWishlistPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  const exists = await connection.db.listCollections({ name: 'wishlists' }).hasNext()
  if (!exists)
    await connection.db.createCollection('wishlists', {
      validator: wishlistValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyOptions(connection)
  await createDeclaredIndexes(wishlistModel(connection))
}
export async function verifyWishlistPersistence(connection: Connection) {
  await verifyOptions(connection)
  await verifyDeclaredIndexes(wishlistModel(connection))
}

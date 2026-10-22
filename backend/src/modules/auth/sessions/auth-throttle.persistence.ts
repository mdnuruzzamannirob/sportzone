import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'

export type QuotaStore = {
  verify?(): Promise<void>
  increment(key: string, expiresAt: Date, limit: number): Promise<number>
}
const validator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'count', 'expiresAt'],
    properties: {
      _id: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
      count: {
        bsonType: ['int', 'long', 'double'],
        minimum: 1,
        maximum: 61,
        multipleOf: 1,
      },
      expiresAt: { bsonType: 'date' },
    },
  },
}
type Bucket = { _id: string; count: number; expiresAt: Date }
export function createAuthQuotaStore(connection: Connection) {
  if (!connection.db) throw new Error('Auth throttle persistence unavailable.')
  const db = connection.db,
    collection = db.collection<Bucket>('authRateLimits')
  async function verify() {
    const existing = await db
      .listCollections({ name: 'authRateLimits' }, { nameOnly: false })
      .next()
    if (
      !existing ||
      !isDeepStrictEqual(existing.options?.validator, validator) ||
      existing.options?.validationLevel !== 'strict' ||
      existing.options?.validationAction !== 'error'
    )
      throw new Error('Auth throttle requires reviewed bootstrap.')
    const indexes = await collection.indexes()
    if (
      indexes.length !== 2 ||
      !indexes.some((i) => i.name === '_id_' && isDeepStrictEqual(i.key, { _id: 1 })) ||
      !indexes.some(
        (i) =>
          i.name === 'auth_rate_limits_expiry' &&
          isDeepStrictEqual(i.key, { expiresAt: 1 }) &&
          i.expireAfterSeconds === 0,
      )
    )
      throw new Error('Auth throttle indexes require review.')
  }
  return {
    async initialize() {
      const existing = await db
        .listCollections({ name: 'authRateLimits' }, { nameOnly: false })
        .next()
      if (!existing)
        await db.createCollection('authRateLimits', {
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        })
      else if (
        !isDeepStrictEqual(existing.options?.validator, validator) ||
        existing.options?.validationLevel !== 'strict' ||
        existing.options?.validationAction !== 'error'
      )
        throw new Error('Auth throttle requires reviewed migration.')
      await collection.createIndex(
        { expiresAt: 1 },
        { name: 'auth_rate_limits_expiry', expireAfterSeconds: 0 },
      )
      await verify()
    },
    verify,
    async increment(key: string, expiresAt: Date, limit: number) {
      if (
        !/^[a-f0-9]{64}$/.test(key) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 60 ||
        !Number.isFinite(expiresAt.getTime())
      )
        throw new Error('Invalid auth quota request.')
      const update = [
        {
          $set: {
            count: {
              $min: [{ $add: [{ $ifNull: ['$count', 0] }, 1] }, limit + 1],
            },
            expiresAt: { $ifNull: ['$expiresAt', expiresAt] },
          },
        },
      ]
      let result: Bucket | null
      try {
        result = await collection.findOneAndUpdate({ _id: key }, update, {
          upsert: true,
          returnDocument: 'after',
          writeConcern: { w: 'majority' },
        })
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000)
          throw error
        result = await collection.findOneAndUpdate({ _id: key }, update, {
          returnDocument: 'after',
          writeConcern: { w: 'majority' },
        })
      }
      if (!result) throw new Error('Auth quota unavailable.')
      return result.count
    },
  }
}

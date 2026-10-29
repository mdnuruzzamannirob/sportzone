import type { Connection, ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'

// Read-only canonical settings capability. Bootstrap and policy/branding writes belong to P09-013.
export function stockSettingsReader(connection: Connection) {
  return async (session: ClientSession): Promise<number> => {
    if (!session.inTransaction() || !connection.db) throw new ApiError('SERVICE_UNAVAILABLE')
    try {
      const collection = connection.db.collection('storeSettings')
      const indexes = await collection.listIndexes().toArray()
      if (
        !indexes.some(
          (index) =>
            index.unique === true &&
            !index.sparse &&
            !index.partialFilterExpression &&
            Object.keys(index.key).length === 1 &&
            index.key.key === 1,
        )
      )
        throw new ApiError('SERVICE_UNAVAILABLE')
      const row = await collection.findOne(
        { key: 'primary' },
        { session, projection: { lowStockThreshold: 1 } },
      )
      const threshold: unknown = row?.lowStockThreshold
      if (typeof threshold !== 'number' || !Number.isSafeInteger(threshold) || threshold < 0)
        throw new ApiError('SERVICE_UNAVAILABLE')
      return threshold
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
}

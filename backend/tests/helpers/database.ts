import { randomUUID } from 'node:crypto'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { openDatabase } from '../../src/config/database.js'

export async function isolatedDatabase() {
  // Generated URI only: never read external MongoDB connection configuration.
  const replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.16' },
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  try {
    const connection = await openDatabase(
      replica.getUri(),
      `sportzone_test_${randomUUID().replaceAll('-', '')}`,
    )
    return {
      connection,
      replica,
      async close() {
        try {
          await connection.close()
        } finally {
          await replica.stop()
        }
      },
    }
  } catch (error) {
    await replica.stop()
    throw error
  }
}

import { createConnection, type Connection } from 'mongoose'

export class DatabaseError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CONFIGURATION'
      | 'CONNECTION_FAILED'
      | 'REPLICA_SET_REQUIRED'
      | 'INDEX_MISMATCH'
      | 'NESTED_TRANSACTION'
      | 'EXTERNAL_EFFECT_IN_TRANSACTION',
  ) {
    super(`Database operation failed: ${code}.`)
  }
}

// Configuration receives secrets privately; errors never include URI/driver diagnostics.
export async function openDatabase(uri: string, dbName: string): Promise<Connection> {
  if (
    !/^mongodb(?:\+srv)?:\/\//.test(uri) ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(dbName) ||
    ['admin', 'local', 'config'].includes(dbName)
  )
    throw new DatabaseError('INVALID_CONFIGURATION')
  const connection = createConnection()
  // Consumers may attach protected observability; never log raw driver errors here.
  connection.on('error', () => {})
  try {
    await connection.openUri(uri, {
      dbName,
      maxPoolSize: 10,
      minPoolSize: 0,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 15000,
      autoIndex: false,
      autoCreate: false,
      bufferCommands: false,
      retryWrites: true,
      readPreference: 'primary',
      writeConcern: { w: 'majority' },
    })
    const hello = await connection.db?.admin().command({ hello: 1 })
    if (
      !hello ||
      typeof hello.setName !== 'string' ||
      typeof hello.logicalSessionTimeoutMinutes !== 'number'
    )
      throw new DatabaseError('REPLICA_SET_REQUIRED')
    return connection
  } catch (error) {
    await connection.destroy().catch(() => {})
    if (error instanceof DatabaseError) throw error
    throw new DatabaseError('CONNECTION_FAILED')
  }
}

import { createConnection, type Connection } from 'mongoose'

import { DatabaseError, type DatabaseFailureReason } from '../shared/errors/database-error.js'
export { DatabaseError } from '../shared/errors/database-error.js'

// Reduce driver diagnostics to a fixed private operator vocabulary; never expose raw messages.
export function classifyDatabaseFailure(failure: unknown): DatabaseFailureReason {
  const property = (value: unknown, key: string): unknown =>
    value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined
  const nodes: unknown[] = [failure, property(failure, 'cause')]
  const servers = property(property(failure, 'reason'), 'servers')
  if (servers instanceof Map) nodes.push(...servers.values())
  for (const node of [...nodes])
    nodes.push(property(node, 'error'), property(property(node, 'error'), 'cause'))
  const codes = nodes.map((node) => property(node, 'code'))
  if (codes.includes(18)) return 'AUTHENTICATION_FAILED'
  if (
    codes.some(
      (code) =>
        typeof code === 'string' && (code.startsWith('ERR_SSL') || code.startsWith('CERT_')),
    )
  )
    return 'TLS_HANDSHAKE_FAILED'
  if (codes.some((code) => code === 'ENOTFOUND' || code === 'EAI_AGAIN')) return 'DNS_FAILED'
  if (
    codes.some((code) => code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ECONNRESET')
  )
    return 'NETWORK_UNREACHABLE'
  return 'SERVER_SELECTION_FAILED'
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
    throw new DatabaseError('CONNECTION_FAILED', classifyDatabaseFailure(error))
  }
}

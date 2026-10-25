import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { auditModel } from './audit.model.js'
const text = (maxLength: number) => ({ bsonType: 'string', minLength: 1, maxLength })
export const auditValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'actorType', 'action', 'targetType', 'operationKey', 'occurredAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      actorId: { bsonType: 'objectId' },
      targetId: { bsonType: 'objectId' },
      actorType: { enum: ['customer', 'admin', 'guest_order', 'system'] },
      action: text(128),
      targetType: text(128),
      operationKey: text(128),
      occurredAt: { bsonType: 'date' },
      beforeDigest: { ...text(64), pattern: '^[a-f0-9]{64}$' },
      afterDigest: { ...text(64), pattern: '^[a-f0-9]{64}$' },
      reason: text(2000),
      requestCorrelationId: text(128),
    },
  },
}
async function verifyCollection(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'auditLogs' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, auditValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Audit persistence requires reviewed bootstrap/migration.')
}
export async function initializeAuditPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'auditLogs' }).hasNext()))
    await connection.db.createCollection('auditLogs', {
      validator: auditValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyCollection(connection)
  await createDeclaredIndexes(auditModel(connection))
}
export async function verifyAuditPersistence(connection: Connection) {
  await verifyCollection(connection)
  await verifyDeclaredIndexes(auditModel(connection))
}

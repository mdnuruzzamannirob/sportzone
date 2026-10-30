import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { complaintModel } from './complaint.model.js'
const oid = { bsonType: 'objectId' },
  date = { bsonType: 'date' },
  text = { bsonType: 'string', minLength: 1, maxLength: 2000 },
  integer = {
    bsonType: ['int', 'long', 'double'],
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    multipleOf: 1,
  }
const object = (properties: Record<string, unknown>, required: string[]) => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
export const complaintValidator = {
  $and: [
    {
      $jsonSchema: object(
        {
          _id: oid,
          orderId: oid,
          userId: oid,
          contact: object(
            {
              name: { ...text, maxLength: 120 },
              emailNormalized: { ...text, maxLength: 254 },
              phone: { ...text, maxLength: 32 },
            },
            ['name', 'emailNormalized'],
          ),
          issue: text,
          status: { enum: ['open', 'in_review', 'resolved', 'closed'] },
          resolution: text,
          respondedAt: date,
          resolvedAt: date,
          assignedTo: oid,
          contactHistory: {
            bsonType: 'array',
            maxItems: 40,
            items: object({ at: date, outcome: text }, ['at', 'outcome']),
          },
          revision: integer,
          createdAt: date,
          updatedAt: date,
        },
        [
          '_id',
          'orderId',
          'contact',
          'issue',
          'status',
          'contactHistory',
          'revision',
          'createdAt',
          'updatedAt',
        ],
      ),
    },
    {
      $or: [
        { status: { $in: ['open', 'in_review'] }, resolvedAt: { $exists: false } },
        {
          status: { $in: ['resolved', 'closed'] },
          respondedAt: { $type: 'date' },
          resolvedAt: { $type: 'date' },
          resolution: { $type: 'string' },
        },
      ],
    },
  ],
}
async function shape(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'complaints' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, complaintValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Complaint persistence requires reviewed bootstrap')
}
export async function verifyComplaintPersistence(connection: Connection) {
  await shape(connection)
  await verifyDeclaredIndexes(complaintModel(connection))
  if (
    (await complaintModel(connection).collection.indexes()).some(
      (i) => i.expireAfterSeconds !== undefined,
    )
  )
    throw new Error('Complaint evidence cannot expire')
}
export async function initializeComplaintPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Database unavailable')
  if (!(await connection.db.listCollections({ name: 'complaints' }).hasNext()))
    await connection.db.createCollection('complaints', {
      validator: complaintValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await shape(connection)
  await createDeclaredIndexes(complaintModel(connection))
  await verifyComplaintPersistence(connection)
}

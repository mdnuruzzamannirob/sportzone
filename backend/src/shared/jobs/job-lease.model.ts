import { isDeepStrictEqual } from 'node:util'
import { type Connection, type InferSchemaType, Schema } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../database/indexes.js'
import { integerField, mutableSchemaOptions } from '../database/schema.js'

type JobLease = InferSchemaType<typeof schema>

const schema = new Schema(
  {
    jobKey: { type: String, required: true, immutable: true },
    leaseOwner: String,
    leaseUntil: Date,
    cursor: String,
    lastStartedAt: Date,
    lastSucceededAt: Date,
    failureCount: { ...integerField(), required: true },
    lastErrorCode: String,
  },
  mutableSchemaOptions,
)
schema.index({ jobKey: 1 }, { unique: true, name: 'job_key_unique' })
schema.index({ leaseUntil: 1 }, { name: 'job_lease_expiry' })
function jobLeaseModel(connection: Connection) {
  return connection.models.JobLease
    ? connection.model<JobLease>('JobLease')
    : connection.model<JobLease>('JobLease', schema, 'jobLeases')
}
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const jobLeaseValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'jobKey', 'failureCount', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      jobKey: { bsonType: 'string', minLength: 1, maxLength: 128 },
      leaseOwner: { bsonType: 'string', minLength: 1, maxLength: 64 },
      leaseUntil: { bsonType: 'date' },
      cursor: { bsonType: 'string', maxLength: 256 },
      lastStartedAt: { bsonType: 'date' },
      lastSucceededAt: { bsonType: 'date' },
      failureCount: integer,
      lastErrorCode: { bsonType: 'string', maxLength: 64 },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
}
async function verifyValidator(connection: Connection) {
  const row = await connection.db
    ?.listCollections({ name: 'jobLeases' }, { nameOnly: false })
    .next()
  if (
    !row ||
    !isDeepStrictEqual(row.options?.validator, jobLeaseValidator) ||
    row.options?.validationLevel !== 'strict' ||
    row.options?.validationAction !== 'error'
  )
    throw new Error('Job leases require reviewed provisioning.')
}
async function initializeJobLeases(connection: Connection) {
  if (!connection.db) throw new Error('Job database unavailable')
  if (!(await connection.db.listCollections({ name: 'jobLeases' }).hasNext()))
    await connection.db.createCollection('jobLeases', {
      validator: jobLeaseValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyValidator(connection)
  await createDeclaredIndexes(jobLeaseModel(connection))
  await verifyJobLeases(connection)
}
async function verifyJobLeases(connection: Connection) {
  await verifyValidator(connection)
  await verifyDeclaredIndexes(jobLeaseModel(connection))
  if (
    (await jobLeaseModel(connection).collection.indexes()).some(
      (index) => index.expireAfterSeconds !== undefined,
    )
  )
    throw new Error('Durable job leases must not use TTL.')
}

export { initializeJobLeases, jobLeaseModel, jobLeaseValidator, verifyJobLeases }

import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import { verifyDeclaredIndexes } from '../../db/indexes.js'
import { mediaModel } from './media.model.js'
type Shape = Record<string, unknown>
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const oid = { bsonType: 'objectId' },
  date = { bsonType: 'date' }
const text = (maxLength: number): Shape => ({ bsonType: 'string', minLength: 1, maxLength })
const object = (properties: Shape, required: string[]): Shape => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
const references = {
  bsonType: 'array',
  maxItems: 40,
  uniqueItems: true,
  items: object(
    {
      targetType: { enum: ['product', 'category', 'store_settings', 'claim'] },
      targetId: oid,
      slot: text(128),
    },
    ['targetType', 'targetId', 'slot'],
  ),
}
const validator = {
  $and: [
    {
      $jsonSchema: object(
        {
          _id: oid,
          createdAt: date,
          updatedAt: date,
          publicId: { ...text(34), pattern: '^sportzone/[a-f0-9]{24}$' },
          assetKind: { enum: ['public_media', 'claim_evidence'] },
          owner: object(
            { kind: { enum: ['admin', 'customer', 'guest_order'] }, principalId: oid },
            ['kind', 'principalId'],
          ),
          orderId: oid,
          claimType: { enum: ['physical_return', 'shortage'] },
          orderItemIds: { bsonType: 'array', maxItems: 40, uniqueItems: true, items: oid },
          mimeType: { enum: ['image/png', 'image/jpeg', 'image/webp'] },
          format: { enum: ['png', 'jpg', 'webp'] },
          size: { ...integer, minimum: 1, maximum: 20971520 },
          digest: { ...text(64), pattern: '^[a-f0-9]{64}$' },
          scanStatus: { enum: ['pending', 'clean', 'rejected'] },
          access: { enum: ['public', 'private'] },
          status: {
            enum: ['uploading', 'temporary', 'attached', 'deleting', 'deleted', 'quarantined'],
          },
          references,
          expiresAt: date,
          deletedAt: date,
          legalHold: { bsonType: 'bool' },
          retainUntil: date,
          revision: integer,
        },
        [
          '_id',
          'createdAt',
          'updatedAt',
          'publicId',
          'assetKind',
          'owner',
          'orderItemIds',
          'mimeType',
          'format',
          'size',
          'digest',
          'scanStatus',
          'access',
          'status',
          'references',
          'legalHold',
          'revision',
        ],
      ),
    },
    {
      $or: [
        {
          assetKind: 'public_media',
          access: 'public',
          'owner.kind': 'admin',
          orderId: { $exists: false },
          claimType: { $exists: false },
          orderItemIds: { $size: 0 },
          'references.targetType': { $ne: 'claim' },
        },
        {
          assetKind: 'claim_evidence',
          access: 'private',
          orderId: { $exists: true },
          claimType: { $exists: true },
          'orderItemIds.0': { $exists: true },
          'owner.kind': { $in: ['customer', 'guest_order'] },
          'references.1': { $exists: false },
          references: { $not: { $elemMatch: { targetType: { $ne: 'claim' } } } },
        },
      ],
    },
    {
      $or: [
        { status: 'attached', 'references.0': { $exists: true }, scanStatus: 'clean' },
        { status: { $ne: 'attached' }, references: { $size: 0 } },
      ],
    },
    { $or: [{ status: { $nin: ['temporary', 'attached'] } }, { scanStatus: 'clean' }] },
    {
      $or: [
        { 'owner.kind': { $ne: 'guest_order' } },
        { $expr: { $eq: ['$owner.principalId', '$orderId'] } },
      ],
    },
  ],
}
async function verifyValidator(connection: Connection) {
  if (!connection.db) throw new Error('Media database unavailable.')
  const current = await connection.db
    .listCollections({ name: 'mediaAssets' }, { nameOnly: false })
    .next()
  if (
    !current ||
    !isDeepStrictEqual(current.options?.validator, validator) ||
    current.options?.validationLevel !== 'strict' ||
    current.options?.validationAction !== 'error'
  )
    throw new Error('Media collection requires explicit bootstrap or reviewed migration.')
}
export async function initializeMediaPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Media database unavailable.')
  const exists = await connection.db.listCollections({ name: 'mediaAssets' }).next()
  if (!exists)
    await connection.db.createCollection('mediaAssets', {
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await verifyValidator(connection)
  await mediaModel(connection).createIndexes()
  await verifyDeclaredIndexes(mediaModel(connection))
}
export async function verifyMediaPersistence(connection: Connection) {
  await verifyValidator(connection)
  await verifyDeclaredIndexes(mediaModel(connection))
}

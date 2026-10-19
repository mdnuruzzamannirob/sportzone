import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { verifyDeclaredIndexes } from '../../db/indexes.js'
import type { IdentityModels } from './models.js'

type Shape = Record<string, unknown>
const text = (max?: number): Shape => ({
  bsonType: 'string',
  minLength: 1,
  ...(max ? { maxLength: max } : {}),
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
})
const email: Shape = { ...text(254), pattern: z.regexes.email.source }
const oid = { bsonType: 'objectId' }
const date = { bsonType: 'date' }
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const object = (properties: Shape, required: string[]): Shape => ({
  bsonType: 'object',
  additionalProperties: false,
  required,
  properties,
})
const base = { _id: oid, createdAt: date, updatedAt: date }
const baseRequired = ['_id', 'createdAt', 'updatedAt']
const has = (...fields: string[]) => ({ required: fields })
const lacks = (...fields: string[]) => ({
  not: { anyOf: fields.map((field) => has(field)) },
})
const enumField = (...values: string[]) => ({
  bsonType: 'string',
  enum: values,
})
const address = object(
  {
    id: oid,
    recipient: text(120),
    phone: text(),
    districtKey: text(64),
    areaKey: text(64),
    street: text(300),
    addressLine2: text(300),
    isDefault: { bsonType: 'bool' },
  },
  ['id', 'recipient', 'phone', 'districtKey', 'areaKey', 'street', 'isDefault'],
)
const revisions = object(
  { email_verify: integer, email_change: integer, password_reset: integer },
  ['email_verify', 'email_change', 'password_reset'],
)
const deletion = {
  ...object(
    {
      id: oid,
      requestedAt: date,
      verifiedAt: date,
      status: enumField(
        'requested',
        'under_review',
        'approved',
        'rejected',
        'completed',
      ),
      reason: text(2000),
      decisionAt: date,
      decisionReason: text(2000),
    },
    ['id', 'requestedAt', 'verifiedAt', 'status'],
  ),
  oneOf: [
    { properties: { status: { enum: ['requested', 'under_review'] } } },
    {
      properties: { status: { enum: ['approved', 'rejected', 'completed'] } },
      required: ['decisionAt'],
    },
  ],
}
const envelope = object(
  {
    algorithm: enumField('AES-256-GCM'),
    keyVersion: text(),
    nonce: { bsonType: 'binData' },
    ciphertext: { bsonType: 'binData' },
    authTag: { bsonType: 'binData' },
  },
  ['algorithm', 'keyVersion', 'nonce', 'ciphertext', 'authTag'],
)
const normalized = (field: string) => ({
  $eq: [`$${field}`, { $toLower: `$${field}` }],
})
const issuanceExpiry = { $gt: ['$expiresAt', '$createdAt'] }
const guest = (key: 'kind' | 'purpose', value: string, revision = false) => ({
  properties: { [key]: { enum: [value] } },
  ...has('orderId'),
  ...lacks('userId', ...(revision ? ['securityRevisionAtIssue'] : [])),
})
const principal = (
  key: 'kind' | 'purpose',
  values: string[],
  revision = false,
) => ({
  properties: { [key]: { enum: values } },
  ...has('userId', ...(revision ? ['securityRevisionAtIssue'] : [])),
  ...lacks('orderId'),
})

// Raw MongoDB writes must enforce shape/scope too; authorization remains service-owned.
export const identityCollectionValidators = {
  users: {
    $jsonSchema: object(
      {
        ...base,
        emailNormalized: email,
        name: text(120),
        passwordHash: text(),
        phone: text(),
        role: enumField('customer', 'admin'),
        status: enumField(
          'active',
          'suspended',
          'deletion_pending',
          'deactivated',
        ),
        emailVerifiedAt: date,
        securityRevision: integer,
        challengeRevisions: revisions,
        addresses: { bsonType: 'array', maxItems: 10, items: address },
        deletionRequest: deletion,
      },
      [
        ...baseRequired,
        'emailNormalized',
        'name',
        'passwordHash',
        'role',
        'status',
        'securityRevision',
        'challengeRevisions',
        'addresses',
      ],
    ),
    $expr: {
      $and: [
        normalized('emailNormalized'),
        {
          $eq: [
            { $size: '$addresses' },
            { $size: { $setUnion: ['$addresses.id', []] } },
          ],
        },
        {
          $lte: [
            {
              $size: {
                $filter: {
                  input: '$addresses',
                  as: 'address',
                  cond: '$$address.isDefault',
                },
              },
            },
            1,
          ],
        },
      ],
    },
  },
  sessions: {
    $jsonSchema: {
      ...object(
        {
          ...base,
          tokenHash: text(),
          csrfSecretHash: text(),
          kind: enumField('customer', 'admin', 'guest_order'),
          userId: oid,
          orderId: oid,
          securityRevisionAtIssue: integer,
          expiresAt: date,
          revokedAt: date,
          lastUsedAt: date,
        },
        [...baseRequired, 'tokenHash', 'csrfSecretHash', 'kind', 'expiresAt'],
      ),
      oneOf: [
        guest('kind', 'guest_order', true),
        principal('kind', ['customer', 'admin'], true),
      ],
    },
    $expr: issuanceExpiry,
  },
  authChallenges: {
    $jsonSchema: {
      ...object(
        {
          ...base,
          purpose: enumField(
            'email_verify',
            'email_change',
            'password_reset',
            'guest_order_access',
          ),
          secretHash: text(),
          userId: oid,
          orderId: oid,
          emailNormalized: email,
          targetEmailNormalized: email,
          expiresAt: date,
          consumedAt: date,
          invalidatedAt: date,
          attemptCount: integer,
          scopeRevisionAtIssue: integer,
          issuedContextHash: text(),
          deliveryNotificationId: oid,
          deliveryEnvelope: envelope,
        },
        [
          ...baseRequired,
          'purpose',
          'secretHash',
          'emailNormalized',
          'expiresAt',
          'attemptCount',
          'scopeRevisionAtIssue',
        ],
      ),
      allOf: [
        {
          anyOf: [
            lacks('deliveryEnvelope'),
            lacks('consumedAt', 'invalidatedAt'),
          ],
        },
        {
          oneOf: [
            guest('purpose', 'guest_order_access'),
            principal('purpose', [
              'email_verify',
              'email_change',
              'password_reset',
            ]),
          ],
        },
        {
          oneOf: [
            {
              properties: { purpose: { enum: ['email_change'] } },
              ...has('targetEmailNormalized'),
            },
            {
              properties: {
                purpose: {
                  enum: [
                    'email_verify',
                    'password_reset',
                    'guest_order_access',
                  ],
                },
              },
              ...lacks('targetEmailNormalized'),
            },
          ],
        },
      ],
    },
    $expr: {
      $and: [
        issuanceExpiry,
        normalized('emailNormalized'),
        {
          $or: [
            { $eq: [{ $type: '$targetEmailNormalized' }, 'missing'] },
            normalized('targetEmailNormalized'),
          ],
        },
      ],
    },
  },
  browserContexts: {
    $jsonSchema: object(
      {
        ...base,
        contextTokenHash: text(),
        csrfSecretHash: text(),
        audience: enumField('storefront', 'admin'),
        expiresAt: date,
        rotatedAt: date,
      },
      [
        ...baseRequired,
        'contextTokenHash',
        'csrfSecretHash',
        'audience',
        'expiresAt',
      ],
    ),
    $expr: issuanceExpiry,
  },
}

// Explicit empty-environment bootstrap only; existing validators require a reviewed migration.
export async function initializeIdentityPersistence(
  connection: Connection,
  models: IdentityModels,
) {
  if (!connection.db) throw new Error('Identity database is unavailable.')
  for (const [name, validator] of Object.entries(
    identityCollectionValidators,
  )) {
    const existing = await connection.db
      .listCollections({ name }, { nameOnly: false })
      .next()
    if (existing) {
      if (
        !isDeepStrictEqual(existing.options?.validator, validator) ||
        existing.options?.validationLevel !== 'strict' ||
        existing.options?.validationAction !== 'error'
      )
        throw new Error('Identity collection requires a reviewed migration.')
    } else {
      await connection.db.createCollection(name, {
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      })
    }
  }
  for (const model of Object.values(models)) {
    await model.createIndexes()
  }
  await verifyDeclaredIndexes(models.users)
  await verifyDeclaredIndexes(models.sessions)
  await verifyDeclaredIndexes(models.challenges)
  await verifyDeclaredIndexes(models.contexts)
}

// Read-only readiness: never creates collections/indexes or changes validators.
export async function verifyIdentityPersistence(
  connection: Connection,
  models: IdentityModels,
) {
  if (!connection.db) throw new Error('Identity persistence unavailable.')
  for (const [name, validator] of Object.entries(
    identityCollectionValidators,
  )) {
    const existing = await connection.db
      .listCollections({ name }, { nameOnly: false })
      .next()
    if (
      !existing ||
      !isDeepStrictEqual(existing.options?.validator, validator) ||
      existing.options?.validationLevel !== 'strict' ||
      existing.options?.validationAction !== 'error'
    )
      throw new Error(
        'Identity persistence requires reviewed bootstrap/migration.',
      )
  }
  for (const model of Object.values(models)) await verifyDeclaredIndexes(model)
}

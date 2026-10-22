import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import type { NotificationModel } from './notification.model.js'

export function createNotificationPersistence(connection: Connection, model: NotificationModel) {
  return {
    // Explicit additive bootstrap, never automatic HTTP startup or deletion.
    async initialize() {
      if (!connection.db) throw new Error('Notification database unavailable.')
      const existing = await connection.db
        .listCollections({ name: 'notifications' }, { nameOnly: false })
        .next()
      if (
        existing &&
        (!isDeepStrictEqual(existing.options?.validator, registrationNotificationValidator) ||
          existing.options?.validationLevel !== 'strict' ||
          existing.options?.validationAction !== 'error')
      )
        throw new Error('Notification collection requires reviewed migration.')
      if (!existing)
        await connection.db.createCollection('notifications', {
          validator: registrationNotificationValidator,
          validationLevel: 'strict',
          validationAction: 'error',
        })
      await model.createIndexes()
    },
    async migrateFoundation() {
      if (!connection.db) throw new Error('Notification database unavailable.')
      const existing = await connection.db
        .listCollections({ name: 'notifications' }, { nameOnly: false })
        .next()
      if (!existing) {
        await this.initialize()
        return
      }
      if (
        existing.options?.validationLevel !== 'strict' ||
        existing.options?.validationAction !== 'error'
      )
        throw new Error('Notification collection requires reviewed migration.')
      if (!isDeepStrictEqual(existing.options?.validator, registrationNotificationValidator)) {
        if (
          !isDeepStrictEqual(
            existing.options?.validator,
            legacyRegistrationNotificationValidator,
          ) &&
          !isDeepStrictEqual(existing.options?.validator, foundationNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, passwordResetNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, emailChangeNotificationValidator)
        )
          throw new Error('Notification collection requires reviewed migration.')
        await connection.db.command({
          collMod: 'notifications',
          validator: registrationNotificationValidator,
          validationLevel: 'strict',
          validationAction: 'error',
        })
      }
      await model.createIndexes()
      await this.verifyIndexes()
    },
    async verifyIndexes() {
      if (!connection.db) throw new Error('Notification database unavailable.')
      const existing = await connection.db
        .listCollections({ name: 'notifications' }, { nameOnly: false })
        .next()
      if (
        !existing ||
        !isDeepStrictEqual(existing.options?.validator, registrationNotificationValidator) ||
        existing.options?.validationLevel !== 'strict' ||
        existing.options?.validationAction !== 'error'
      )
        throw new Error('Notification validator unavailable.')
      const diff = await model.diffIndexes()
      if (diff.toCreate.length) throw new Error('Notification indexes unavailable.')
    },
  }
}

export const legacyRegistrationNotificationValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'eventKey',
      'userId',
      'recipient',
      'eventType',
      'templateVersion',
      'payload',
      'status',
      'attemptCount',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      eventKey: { bsonType: 'string', minLength: 1 },
      recipient: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['emailNormalized'],
        properties: {
          emailNormalized: { bsonType: 'string', minLength: 1 },
          displayName: { bsonType: 'string' },
        },
      },
      eventType: { enum: ['registration'] },
      templateVersion: { enum: ['registration-v1'] },
      payload: { bsonType: 'object', additionalProperties: false },
      status: {
        enum: ['queued', 'sending', 'delivery_uncertain', 'sent', 'retry_wait', 'failed'],
      },
      attemptCount: {
        bsonType: ['int', 'long', 'double'],
        minimum: 0,
        maximum: Number.MAX_SAFE_INTEGER,
        multipleOf: 1,
      },
      nextAttemptAt: { bsonType: 'date' },
      providerMessageId: { bsonType: 'string' },
      lastErrorCode: { bsonType: 'string' },
      sentAt: { bsonType: 'date' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
}

// Immutable known predecessor above; extend only the current validator for this additive migration.
export const foundationNotificationValidator = {
  $jsonSchema: {
    ...legacyRegistrationNotificationValidator.$jsonSchema,
    properties: {
      ...legacyRegistrationNotificationValidator.$jsonSchema.properties,
      claimId: { bsonType: 'string', minLength: 1, maxLength: 64 },
      claimExpiresAt: { bsonType: 'date' },
      lastAttemptAt: { bsonType: 'date' },
    },
  },
}

// P03-010 additive event/payload contract; known foundation predecessor remains immutable.
export const passwordResetNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...foundationNotificationValidator.$jsonSchema,
        properties: {
          ...foundationNotificationValidator.$jsonSchema.properties,
          eventType: { enum: ['registration', 'password_reset'] },
          templateVersion: { enum: ['registration-v1', 'password-reset-v1'] },
          payload: {
            bsonType: 'object',
            additionalProperties: false,
            properties: { challengeId: { bsonType: 'objectId' } },
          },
        },
      },
    },
    {
      $or: [
        {
          eventType: 'registration',
          templateVersion: 'registration-v1',
          'payload.challengeId': { $exists: false },
        },
        {
          eventType: 'password_reset',
          templateVersion: 'password-reset-v1',
          'payload.challengeId': { $type: 'objectId' },
        },
      ],
    },
  ],
}

// Additive P03-011 contract; preserve exact known predecessor validators above.
export const emailChangeNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...foundationNotificationValidator.$jsonSchema,
        properties: {
          ...foundationNotificationValidator.$jsonSchema.properties,
          eventType: {
            enum: ['registration', 'password_reset', 'email_change'],
          },
          templateVersion: {
            enum: ['registration-v1', 'password-reset-v1', 'email-change-v1'],
          },
          payload: {
            bsonType: 'object',
            additionalProperties: false,
            properties: { challengeId: { bsonType: 'objectId' } },
          },
        },
      },
    },
    {
      $or: [
        {
          eventType: 'registration',
          templateVersion: 'registration-v1',
          'payload.challengeId': { $exists: false },
        },
        {
          eventType: 'password_reset',
          templateVersion: 'password-reset-v1',
          'payload.challengeId': { $type: 'objectId' },
        },
        {
          eventType: 'email_change',
          templateVersion: 'email-change-v1',
          'payload.challengeId': { $type: 'objectId' },
        },
      ],
    },
  ],
}

// P03-012 adds an admin-specific reset template without changing challenge purpose.
export const registrationNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...foundationNotificationValidator.$jsonSchema,
        properties: {
          ...foundationNotificationValidator.$jsonSchema.properties,
          eventType: {
            enum: ['registration', 'password_reset', 'email_change'],
          },
          templateVersion: {
            enum: [
              'registration-v1',
              'password-reset-v1',
              'email-change-v1',
              'admin-password-reset-v1',
            ],
          },
          payload: {
            bsonType: 'object',
            additionalProperties: false,
            properties: { challengeId: { bsonType: 'objectId' } },
          },
        },
      },
    },
    {
      $or: [
        {
          eventType: 'registration',
          templateVersion: 'registration-v1',
          'payload.challengeId': { $exists: false },
        },
        {
          eventType: 'password_reset',
          templateVersion: {
            $in: ['password-reset-v1', 'admin-password-reset-v1'],
          },
          'payload.challengeId': { $type: 'objectId' },
        },
        {
          eventType: 'email_change',
          templateVersion: 'email-change-v1',
          'payload.challengeId': { $type: 'objectId' },
        },
      ],
    },
  ],
}

import {
  Schema,
  type ClientSession,
  type Connection,
  type Types,
} from 'mongoose'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { mutableSchemaOptions } from '../../db/schema.js'
import type { DeliveryOutcome } from './notification.types.js'

const recipient = new Schema(
  { emailNormalized: { type: String, required: true }, displayName: String },
  { _id: false, strict: 'throw' },
)
const schema = new Schema(
  {
    eventKey: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    recipient: { type: recipient, required: true, select: false },
    eventType: {
      type: String,
      enum: ['registration', 'password_reset', 'email_change'],
      required: true,
    },
    templateVersion: { type: String, required: true },
    payload: {
      type: new Schema(
        { challengeId: Schema.Types.ObjectId },
        { _id: false, strict: 'throw' },
      ),
      required: true,
    },
    status: {
      type: String,
      enum: [
        'queued',
        'sending',
        'delivery_uncertain',
        'sent',
        'retry_wait',
        'failed',
      ],
      required: true,
    },
    attemptCount: {
      type: Number,
      min: 0,
      required: true,
      validate: Number.isSafeInteger,
    },
    nextAttemptAt: Date,
    providerMessageId: String,
    lastErrorCode: String,
    sentAt: Date,
    claimId: String,
    claimExpiresAt: Date,
    lastAttemptAt: Date,
  },
  { ...mutableSchemaOptions, minimize: false },
)
schema.index(
  { eventKey: 1 },
  { name: 'notifications_event_key_unique', unique: true },
)
schema.index(
  { status: 1, nextAttemptAt: 1 },
  { name: 'notifications_retry_queue' },
)
schema.index(
  { status: 1, claimExpiresAt: 1 },
  { name: 'notifications_claim_expiry' },
)
export function createRegistrationNotifications(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const model = connection.model(
    'RegistrationNotification',
    schema,
    'notifications',
  )
  return {
    // Explicit additive bootstrap, never automatic HTTP startup or deletion.
    async initialize() {
      if (!connection.db) throw new Error('Notification database unavailable.')
      const existing = await connection.db
        .listCollections({ name: 'notifications' }, { nameOnly: false })
        .next()
      if (
        existing &&
        (!isDeepStrictEqual(
          existing.options?.validator,
          registrationNotificationValidator,
        ) ||
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
    async enqueue(
      input: { userId: Types.ObjectId; email: string; name: string },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      await model.updateOne(
        { eventKey: `registration:${input.userId.toHexString()}:v1` },
        {
          $setOnInsert: {
            userId: input.userId,
            recipient: {
              emailNormalized: input.email,
              displayName: input.name,
            },
            eventType: 'registration',
            templateVersion: 'registration-v1',
            payload: {},
            status: 'queued',
            attemptCount: 0,
            nextAttemptAt: clock(),
          },
        },
        { upsert: true, session, runValidators: true },
      )
    },
    async enqueuePasswordReset(
      input: {
        id: Types.ObjectId
        challengeId: Types.ObjectId
        userId: Types.ObjectId
        email: string
      },
      session: ClientSession,
      kind: 'customer' | 'admin' = 'customer',
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      await new model({
        _id: input.id,
        eventKey: `password_reset:${input.challengeId.toHexString()}:v1`,
        userId: input.userId,
        recipient: { emailNormalized: input.email },
        eventType: 'password_reset',
        templateVersion:
          kind === 'admin' ? 'admin-password-reset-v1' : 'password-reset-v1',
        payload: { challengeId: input.challengeId },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: clock(),
      }).save({ session })
    },
    async enqueueEmailChange(
      input: {
        id: Types.ObjectId
        challengeId: Types.ObjectId
        userId: Types.ObjectId
        email: string
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      await new model({
        _id: input.id,
        eventKey: `email_change:${input.challengeId.toHexString()}:v1`,
        userId: input.userId,
        recipient: { emailNormalized: input.email },
        eventType: 'email_change',
        templateVersion: 'email-change-v1',
        payload: { challengeId: input.challengeId },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: clock(),
      }).save({ session })
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
      if (
        !isDeepStrictEqual(
          existing.options?.validator,
          registrationNotificationValidator,
        )
      ) {
        if (
          !isDeepStrictEqual(
            existing.options?.validator,
            legacyRegistrationNotificationValidator,
          ) &&
          !isDeepStrictEqual(
            existing.options?.validator,
            foundationNotificationValidator,
          ) &&
          !isDeepStrictEqual(
            existing.options?.validator,
            passwordResetNotificationValidator,
          ) &&
          !isDeepStrictEqual(
            existing.options?.validator,
            emailChangeNotificationValidator,
          )
        )
          throw new Error(
            'Notification collection requires reviewed migration.',
          )
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
    async claim(
      now: Date,
      ttlMs: number,
      maxAttempts: number,
      includeProofs = false,
      includeEmailChanges = false,
      includeAdminResets = false,
    ) {
      const claimId = randomUUID()
      const row = await model
        .findOneAndUpdate(
          {
            $or: [
              { eventType: 'registration', templateVersion: 'registration-v1' },
              ...(includeProofs
                ? [
                    {
                      eventType: 'password_reset' as const,
                      templateVersion: 'password-reset-v1',
                    },
                  ]
                : []),
              ...(includeEmailChanges
                ? [
                    {
                      eventType: 'email_change' as const,
                      templateVersion: 'email-change-v1',
                    },
                  ]
                : []),
              ...(includeAdminResets
                ? [
                    {
                      eventType: 'password_reset' as const,
                      templateVersion: 'admin-password-reset-v1',
                    },
                  ]
                : []),
            ],
            status: { $in: ['queued', 'retry_wait'] },
            attemptCount: { $lt: maxAttempts },
            nextAttemptAt: { $lte: now },
          },
          {
            $set: {
              status: 'sending',
              claimId,
              claimExpiresAt: new Date(now.getTime() + ttlMs),
              lastAttemptAt: now,
            },
            $inc: { attemptCount: 1 },
            $unset: { nextAttemptAt: 1 },
          },
          {
            returnDocument: 'after',
            sort: { nextAttemptAt: 1, _id: 1 },
            writeConcern: { w: 'majority' },
          },
        )
        .select('+recipient')
      return row
        ? {
            id: row._id,
            userId: row.userId,
            eventType: row.eventType,
            templateVersion: row.templateVersion,
            challengeId: row.payload.challengeId,
            eventKey: row.eventKey,
            recipient: row.recipient.emailNormalized,
            attemptCount: row.attemptCount,
            claimId,
          }
        : null
    },
    async currentClaim(id: Types.ObjectId, claimId: string, now: Date) {
      return Boolean(
        await model.exists({
          _id: id,
          claimId,
          status: 'sending',
          claimExpiresAt: { $gt: now },
        }),
      )
    },
    async finish(
      id: Types.ObjectId,
      claimId: string,
      outcome: DeliveryOutcome,
      now: Date,
      maxAttempts: number,
      delayMs: number,
    ) {
      if (outcome.kind === 'accepted') {
        await model.updateOne(
          {
            _id: id,
            claimId,
            status: { $in: ['sending', 'delivery_uncertain'] },
          },
          {
            $set: {
              status: 'sent',
              providerMessageId: outcome.providerMessageId,
              sentAt: now,
            },
            $unset: { claimExpiresAt: 1, nextAttemptAt: 1, lastErrorCode: 1 },
          },
          { writeConcern: { w: 'majority' }, runValidators: true },
        )
        return
      }
      const row = await model.findOne({ _id: id, claimId, status: 'sending' })
      if (!row) return
      const expired = !row.claimExpiresAt || row.claimExpiresAt <= now
      const uncertain = outcome.kind === 'uncertain' || expired
      const retry =
        !uncertain &&
        outcome.kind === 'rejected' &&
        outcome.retryable &&
        row.attemptCount < maxAttempts
      await model.updateOne(
        { _id: id, claimId, status: 'sending' },
        {
          $set: {
            status: uncertain
              ? 'delivery_uncertain'
              : retry
                ? 'retry_wait'
                : 'failed',
            lastErrorCode: expired ? 'CLAIM_EXPIRED' : outcome.code,
            ...(retry
              ? { nextAttemptAt: new Date(now.getTime() + delayMs) }
              : {}),
          },
          $unset: {
            claimExpiresAt: 1,
            ...(!retry ? { nextAttemptAt: 1 } : {}),
          },
        },
        { writeConcern: { w: 'majority' }, runValidators: true },
      )
    },
    async recover(now: Date, limit: number, maxAttempts: number) {
      const stale = await model
        .find({
          status: 'sending',
          $or: [
            { claimExpiresAt: { $lte: now } },
            { claimExpiresAt: { $exists: false } },
          ],
        })
        .sort({ _id: 1 })
        .limit(limit)
      for (const row of stale)
        await model.updateOne(
          {
            _id: row._id,
            status: 'sending',
            $or: [
              { claimExpiresAt: { $lte: now } },
              { claimExpiresAt: { $exists: false } },
            ],
          },
          {
            $set: {
              status: 'delivery_uncertain',
              lastErrorCode: 'WORKER_INTERRUPTED',
            },
            $unset: { nextAttemptAt: 1 },
          },
          { writeConcern: { w: 'majority' } },
        )
      const exhausted = await model
        .find({
          status: { $in: ['queued', 'retry_wait'] },
          attemptCount: { $gte: maxAttempts },
        })
        .sort({ _id: 1 })
        .limit(limit)
      for (const row of exhausted)
        await model.updateOne(
          {
            _id: row._id,
            status: { $in: ['queued', 'retry_wait'] },
            attemptCount: { $gte: maxAttempts },
          },
          {
            $set: { status: 'failed', lastErrorCode: 'RETRIES_EXHAUSTED' },
            $unset: { nextAttemptAt: 1 },
          },
          { writeConcern: { w: 'majority' } },
        )
    },
    async status(id: Types.ObjectId) {
      const row = await model
        .findById(id)
        .select('status attemptCount lastErrorCode sentAt providerMessageId')
      return row
        ? {
            id: row._id.toHexString(),
            status: row.status,
            attemptCount: row.attemptCount,
            ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
            ...(row.sentAt ? { sentAt: row.sentAt } : {}),
            ...(row.providerMessageId
              ? { providerMessageId: row.providerMessageId }
              : {}),
          }
        : null
    },
    async verifyIndexes() {
      if (!connection.db) throw new Error('Notification database unavailable.')
      const existing = await connection.db
        .listCollections({ name: 'notifications' }, { nameOnly: false })
        .next()
      if (
        !existing ||
        !isDeepStrictEqual(
          existing.options?.validator,
          registrationNotificationValidator,
        ) ||
        existing.options?.validationLevel !== 'strict' ||
        existing.options?.validationAction !== 'error'
      )
        throw new Error('Notification validator unavailable.')
      const diff = await model.diffIndexes()
      if (diff.toCreate.length)
        throw new Error('Notification indexes unavailable.')
    },
  }
}
export type RegistrationNotifications = ReturnType<
  typeof createRegistrationNotifications
>

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
        enum: [
          'queued',
          'sending',
          'delivery_uncertain',
          'sent',
          'retry_wait',
          'failed',
        ],
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

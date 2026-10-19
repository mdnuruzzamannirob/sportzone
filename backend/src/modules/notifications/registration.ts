import {
  Schema,
  type ClientSession,
  type Connection,
  type Types,
} from 'mongoose'
import { mutableSchemaOptions } from '../../db/schema.js'
import { isDeepStrictEqual } from 'node:util'

const recipient = new Schema(
  { emailNormalized: { type: String, required: true }, displayName: String },
  { _id: false, strict: 'throw' },
)
const schema = new Schema(
  {
    eventKey: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    recipient: { type: recipient, required: true, select: false },
    eventType: { type: String, enum: ['registration'], required: true },
    templateVersion: { type: String, required: true },
    payload: {
      type: new Schema({}, { _id: false, strict: 'throw' }),
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
export function createRegistrationNotifications(connection: Connection) {
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
        ) || existing.options?.validationLevel !== 'strict' || existing.options?.validationAction !== 'error')
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
            nextAttemptAt: new Date(),
          },
        },
        { upsert: true, session, runValidators: true },
      )
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

export const registrationNotificationValidator = {
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

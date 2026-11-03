import { isDeepStrictEqual } from 'node:util'
import type { Connection } from 'mongoose'
import type { NotificationModel } from './notification.model.js'

function createNotificationPersistence(connection: Connection, model: NotificationModel) {
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
          !isDeepStrictEqual(existing.options?.validator, emailChangeNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, adminResetNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, orderReceivedNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, guestNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, paymentNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, commerceNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, returnNotificationValidator) &&
          !isDeepStrictEqual(existing.options?.validator, refundNotificationValidator)
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

const legacyRegistrationNotificationValidator = {
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
const foundationNotificationValidator = {
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
const passwordResetNotificationValidator = {
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
const emailChangeNotificationValidator = {
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
const adminResetNotificationValidator = {
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

// Additive checkout receipt event; retain every exact known predecessor for explicit migration.
const orderReceivedNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...foundationNotificationValidator.$jsonSchema,
        required: foundationNotificationValidator.$jsonSchema.required.filter(
          (field) => field !== 'userId',
        ),
        properties: {
          ...foundationNotificationValidator.$jsonSchema.properties,
          orderId: { bsonType: 'objectId' },
          eventType: { enum: ['registration', 'password_reset', 'email_change', 'order_received'] },
          templateVersion: {
            enum: [
              'registration-v1',
              'password-reset-v1',
              'email-change-v1',
              'admin-password-reset-v1',
              'order-received-v1',
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
          eventType: 'order_received',
          templateVersion: 'order-received-v1',
          orderId: { $type: 'objectId' },
          'payload.challengeId': { $exists: false },
        },
        {
          $and: [
            { userId: { $type: 'objectId' }, orderId: { $exists: false } },
            adminResetNotificationValidator.$and[1],
          ],
        },
      ],
    },
  ] as const,
}

// Guest proofs retain challenge-only payloads, with order scope instead of account scope.
const guestNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...orderReceivedNotificationValidator.$and[0].$jsonSchema,
        properties: {
          ...orderReceivedNotificationValidator.$and[0].$jsonSchema?.properties,
          eventType: {
            enum: [
              'registration',
              'password_reset',
              'email_change',
              'order_received',
              'guest_order_access',
            ],
          },
          templateVersion: {
            enum: [
              'registration-v1',
              'password-reset-v1',
              'email-change-v1',
              'admin-password-reset-v1',
              'order-received-v1',
              'guest-order-access-v1',
            ],
          },
        },
      },
    },
    {
      $or: [
        orderReceivedNotificationValidator.$and[1],
        {
          eventType: 'guest_order_access',
          templateVersion: 'guest-order-access-v1',
          orderId: { $type: 'objectId' },
          userId: { $exists: false },
          'payload.challengeId': { $type: 'objectId' },
        },
      ],
    },
  ],
}

const paymentPayload = {
  bsonType: 'object',
  additionalProperties: false,
  properties: {
    challengeId: { bsonType: 'objectId' },
    paymentId: { bsonType: 'objectId' },
    attemptId: { bsonType: 'objectId' },
    intakeId: { bsonType: 'objectId' },
    orderNumber: { bsonType: 'string', minLength: 1, maxLength: 64 },
    amountPoisha: {
      bsonType: ['int', 'long', 'double'],
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      multipleOf: 1,
    },
  },
}

const paymentNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...guestNotificationValidator.$and[0]?.$jsonSchema,
        properties: {
          ...guestNotificationValidator.$and[0]?.$jsonSchema?.properties,
          eventType: {
            enum: [
              'registration',
              'password_reset',
              'email_change',
              'order_received',
              'guest_order_access',
              'payment_success',
              'payment_failure',
              'payment_pending',
            ],
          },
          templateVersion: {
            enum: [
              'registration-v1',
              'password-reset-v1',
              'email-change-v1',
              'admin-password-reset-v1',
              'order-received-v1',
              'guest-order-access-v1',
              'payment-success-v1',
              'payment-failure-v1',
              'payment-pending-v1',
            ],
          },
          payload: paymentPayload,
        },
      },
    },
    {
      $or: [
        {
          $and: [
            guestNotificationValidator.$and[1],
            {
              'payload.paymentId': { $exists: false },
              'payload.attemptId': { $exists: false },
              'payload.intakeId': { $exists: false },
              'payload.orderNumber': { $exists: false },
              'payload.amountPoisha': { $exists: false },
            },
          ],
        },
        ...['success', 'failure', 'pending'].map((kind) => ({
          eventType: `payment_${kind}`,
          templateVersion: `payment-${kind}-v1`,
          orderId: { $type: 'objectId' },
          'payload.paymentId': { $type: 'objectId' },
          'payload.attemptId': { $type: 'objectId' },
          'payload.orderNumber': { $type: 'string' },
          'payload.amountPoisha': { $type: 'number' },
          'payload.challengeId': { $exists: false },
          ...(kind === 'success' ? { 'payload.intakeId': { $type: 'objectId' } } : {}),
        })),
      ],
    },
  ],
}

// Commerce expansion preserves the exact payment predecessor and all proof branch restrictions.
const commerceNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...paymentNotificationValidator.$and[0]?.$jsonSchema,
        properties: {
          ...paymentNotificationValidator.$and[0]?.$jsonSchema?.properties,
          eventType: {
            enum: [
              'registration',
              'password_reset',
              'email_change',
              'order_received',
              'guest_order_access',
              'payment_success',
              'payment_failure',
              'payment_pending',
              'order_confirmation',
              'order_cancellation',
              'shipment_update',
              'delivery_completion',
            ],
          },
          templateVersion: {
            enum: [
              'registration-v1',
              'password-reset-v1',
              'email-change-v1',
              'admin-password-reset-v1',
              'order-received-v1',
              'guest-order-access-v1',
              'payment-success-v1',
              'payment-failure-v1',
              'payment-pending-v1',
              'order-confirmation-v1',
              'order-cancellation-v1',
              'shipment-update-v1',
              'delivery-completion-v1',
            ],
          },
          payload: {
            ...paymentPayload,
            properties: {
              ...paymentPayload.properties,
              operationKey: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
              occurredAt: { bsonType: 'date' },
            },
          },
        },
      },
    },
    {
      $or: [
        {
          $and: [
            paymentNotificationValidator.$and[1],
            {
              'payload.operationKey': { $exists: false },
              'payload.occurredAt': { $exists: false },
            },
          ],
        },
        ...[
          'order_confirmation',
          'order_cancellation',
          'shipment_update',
          'delivery_completion',
        ].map((eventType) => ({
          eventType,
          templateVersion: `${eventType.replaceAll('_', '-')}-v1`,
          orderId: { $type: 'objectId' },
          'payload.operationKey': { $type: 'string' },
          'payload.occurredAt': { $type: 'date' },
          'payload.challengeId': { $exists: false },
          'payload.paymentId': { $exists: false },
          'payload.attemptId': { $exists: false },
          'payload.intakeId': { $exists: false },
          'payload.orderNumber': { $exists: false },
          'payload.amountPoisha': { $exists: false },
        })),
      ],
    },
  ],
}

// Additive private return events retain the exact prior commerce validator as a predecessor.
const returnNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...commerceNotificationValidator.$and[0]?.$jsonSchema,
        properties: {
          ...commerceNotificationValidator.$and[0]?.$jsonSchema?.properties,
          eventType: {
            enum: [
              'registration',
              'password_reset',
              'email_change',
              'order_received',
              'guest_order_access',
              'payment_success',
              'payment_failure',
              'payment_pending',
              'order_confirmation',
              'order_cancellation',
              'shipment_update',
              'delivery_completion',
              'return_update',
            ],
          },
          templateVersion: {
            enum: [
              'registration-v1',
              'password-reset-v1',
              'email-change-v1',
              'admin-password-reset-v1',
              'order-received-v1',
              'guest-order-access-v1',
              'payment-success-v1',
              'payment-failure-v1',
              'payment-pending-v1',
              'order-confirmation-v1',
              'order-cancellation-v1',
              'shipment-update-v1',
              'delivery-completion-v1',
              'return-update-v1',
            ],
          },
          payload: {
            ...paymentPayload,
            properties: {
              ...paymentPayload.properties,
              operationKey: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
              occurredAt: { bsonType: 'date' },
              returnId: { bsonType: 'objectId' },
              returnFrom: { enum: ['under_review', 'approved', 'inspected'] },
              returnTo: { enum: ['approved', 'rejected', 'completed'] },
            },
          },
        },
      },
    },
    {
      $or: [
        {
          $and: [
            commerceNotificationValidator.$and[1],
            {
              'payload.returnId': { $exists: false },
              'payload.returnFrom': { $exists: false },
              'payload.returnTo': { $exists: false },
            },
          ],
        },
        {
          eventType: 'return_update',
          templateVersion: 'return-update-v1',
          orderId: { $type: 'objectId' },
          'payload.operationKey': { $type: 'string' },
          'payload.occurredAt': { $type: 'date' },
          'payload.returnId': { $type: 'objectId' },
          'payload.returnFrom': { $type: 'string' },
          'payload.returnTo': { $type: 'string' },
          $or: [
            {
              'payload.returnFrom': 'under_review',
              'payload.returnTo': { $in: ['approved', 'rejected'] },
            },
            {
              'payload.returnFrom': { $in: ['approved', 'inspected'] },
              'payload.returnTo': 'completed',
            },
          ],
          'payload.challengeId': { $exists: false },
          'payload.paymentId': { $exists: false },
          'payload.attemptId': { $exists: false },
          'payload.intakeId': { $exists: false },
          'payload.orderNumber': { $exists: false },
          'payload.amountPoisha': { $exists: false },
        },
      ],
    },
  ],
} as const

// Additive successor; exact prior return schema remains an accepted migration predecessor.
const refundNotificationValidator = {
  $and: [
    {
      $jsonSchema: {
        ...returnNotificationValidator.$and[0].$jsonSchema,
        properties: {
          ...returnNotificationValidator.$and[0].$jsonSchema.properties,
          eventType: {
            enum: [
              ...returnNotificationValidator.$and[0].$jsonSchema.properties.eventType.enum,
              'refund_update',
            ],
          },
          templateVersion: {
            enum: [
              ...returnNotificationValidator.$and[0].$jsonSchema.properties.templateVersion.enum,
              'refund-update-v1',
            ],
          },
          payload: {
            ...returnNotificationValidator.$and[0].$jsonSchema.properties.payload,
            properties: {
              ...returnNotificationValidator.$and[0].$jsonSchema.properties.payload.properties,
              refundId: { bsonType: 'objectId' },
              refundStatus: { enum: ['approved', 'processing', 'completed', 'failed', 'rejected'] },
            },
          },
        },
      },
    },
    {
      $or: [
        {
          $and: [
            returnNotificationValidator.$and[1],
            { 'payload.refundId': { $exists: false }, 'payload.refundStatus': { $exists: false } },
          ],
        },
        {
          eventType: 'refund_update',
          templateVersion: 'refund-update-v1',
          orderId: { $type: 'objectId' },
          'payload.refundId': { $type: 'objectId' },
          'payload.refundStatus': { $type: 'string' },
          'payload.operationKey': { $type: 'string' },
          'payload.occurredAt': { $type: 'date' },
          ...Object.fromEntries(
            [
              'challengeId',
              'paymentId',
              'attemptId',
              'intakeId',
              'orderNumber',
              'amountPoisha',
              'returnId',
              'returnFrom',
              'returnTo',
            ].map((k) => [`payload.${k}`, { $exists: false }]),
          ),
        },
      ],
    },
  ],
}

// Exact additive proof-notification successor; historical event shapes stay unchanged.
const registrationNotificationValidator = {
  $or: [
    refundNotificationValidator,
    {
      $and: [
        {
          $jsonSchema: {
            ...foundationNotificationValidator.$jsonSchema,
            properties: {
              ...foundationNotificationValidator.$jsonSchema.properties,
              eventType: { enum: ['email_verification'] },
              templateVersion: { enum: ['email-verification-v1'] },
              payload: {
                bsonType: 'object',
                additionalProperties: false,
                required: ['challengeId'],
                properties: { challengeId: { bsonType: 'objectId' } },
              },
            },
          },
        },
        { userId: { $type: 'objectId' }, orderId: { $exists: false } },
      ],
    },
  ],
}

export {
  adminResetNotificationValidator,
  commerceNotificationValidator,
  createNotificationPersistence,
  emailChangeNotificationValidator,
  foundationNotificationValidator,
  guestNotificationValidator,
  legacyRegistrationNotificationValidator,
  orderReceivedNotificationValidator,
  passwordResetNotificationValidator,
  paymentNotificationValidator,
  refundNotificationValidator,
  registrationNotificationValidator,
  returnNotificationValidator,
}

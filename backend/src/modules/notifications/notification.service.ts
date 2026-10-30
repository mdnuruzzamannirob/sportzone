import type { ClientSession, Connection, Types } from 'mongoose'
import { randomUUID } from 'node:crypto'
import type { DeliveryOutcome } from './notification.types.js'
import { createNotificationModel } from './notification.model.js'
import { createNotificationPersistence } from './notification.persistence.js'

export function createRegistrationNotifications(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const model = createNotificationModel(connection)
  return {
    ...createNotificationPersistence(connection, model),
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
    async enqueueOrderReceived(
      input: { orderId: Types.ObjectId; userId?: Types.ObjectId; email: string; name: string },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      await createNotificationPersistence(connection, model).verifyIndexes()
      await model.updateOne(
        { eventKey: `order_received:${input.orderId.toHexString()}:v1` },
        {
          $setOnInsert: {
            orderId: input.orderId,
            ...(input.userId ? { userId: input.userId } : {}),
            recipient: { emailNormalized: input.email, displayName: input.name },
            eventType: 'order_received',
            templateVersion: 'order-received-v1',
            payload: {},
            status: 'queued',
            attemptCount: 0,
            nextAttemptAt: clock(),
          },
        },
        { upsert: true, session, runValidators: true },
      )
    },
    async enqueuePayment(
      input: {
        event: 'success' | 'failure' | 'pending'
        cause: string
        orderId: Types.ObjectId
        userId?: Types.ObjectId
        email: string
        name: string
        paymentId: Types.ObjectId
        attemptId: Types.ObjectId
        intakeId?: Types.ObjectId
        orderNumber: string
        amountPoisha: number
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Payment notification requires business transaction')
      await createNotificationPersistence(connection, model).verifyIndexes()
      await model.updateOne(
        { eventKey: `payment_${input.event}:${input.cause}:v1` },
        {
          $setOnInsert: {
            orderId: input.orderId,
            ...(input.userId ? { userId: input.userId } : {}),
            recipient: { emailNormalized: input.email, displayName: input.name },
            eventType: `payment_${input.event}`,
            templateVersion: `payment-${input.event}-v1`,
            payload: {
              paymentId: input.paymentId,
              attemptId: input.attemptId,
              ...(input.intakeId ? { intakeId: input.intakeId } : {}),
              orderNumber: input.orderNumber,
              amountPoisha: input.amountPoisha,
            },
            status: 'queued',
            attemptCount: 0,
            nextAttemptAt: clock(),
          },
        },
        { upsert: true, session, runValidators: true },
      )
    },
    async enqueueGuestAccess(
      input: {
        id: Types.ObjectId
        challengeId: Types.ObjectId
        orderId: Types.ObjectId
        email: string
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      await new model({
        _id: input.id,
        eventKey: `guest_order_access:${input.challengeId.toHexString()}:v1`,
        orderId: input.orderId,
        recipient: { emailNormalized: input.email },
        eventType: 'guest_order_access',
        templateVersion: 'guest-order-access-v1',
        payload: { challengeId: input.challengeId },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: clock(),
      }).save({ session })
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
        templateVersion: kind === 'admin' ? 'admin-password-reset-v1' : 'password-reset-v1',
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
    async claim(
      now: Date,
      ttlMs: number,
      maxAttempts: number,
      includeProofs = false,
      includeEmailChanges = false,
      includeAdminResets = false,
      includeGuestProofs = false,
      includePayments = false,
    ) {
      const claimId = randomUUID()
      const row = await model
        .findOneAndUpdate(
          {
            $or: [
              { eventType: 'registration', templateVersion: 'registration-v1' },
              ...(includePayments
                ? [
                    {
                      eventType: 'payment_success' as const,
                      templateVersion: 'payment-success-v1',
                    },
                    {
                      eventType: 'payment_failure' as const,
                      templateVersion: 'payment-failure-v1',
                    },
                    {
                      eventType: 'payment_pending' as const,
                      templateVersion: 'payment-pending-v1',
                    },
                  ]
                : []),
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
              ...(includeGuestProofs
                ? [
                    {
                      eventType: 'guest_order_access' as const,
                      templateVersion: 'guest-order-access-v1',
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
      const userId = row?.userId
      if (row && !userId && !row.orderId) throw new Error('Invalid proof notification identity.')
      return row
        ? {
            id: row._id,
            userId,
            orderId: row.orderId,
            eventType: row.eventType,
            templateVersion: row.templateVersion,
            challengeId: row.payload.challengeId,
            payload: row.payload,
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
            status: uncertain ? 'delivery_uncertain' : retry ? 'retry_wait' : 'failed',
            lastErrorCode: expired ? 'CLAIM_EXPIRED' : outcome.code,
            ...(retry ? { nextAttemptAt: new Date(now.getTime() + delayMs) } : {}),
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
          $or: [{ claimExpiresAt: { $lte: now } }, { claimExpiresAt: { $exists: false } }],
        })
        .sort({ _id: 1 })
        .limit(limit)
      for (const row of stale)
        await model.updateOne(
          {
            _id: row._id,
            status: 'sending',
            $or: [{ claimExpiresAt: { $lte: now } }, { claimExpiresAt: { $exists: false } }],
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
            ...(row.providerMessageId ? { providerMessageId: row.providerMessageId } : {}),
          }
        : null
    },
  }
}
export type RegistrationNotifications = ReturnType<typeof createRegistrationNotifications>

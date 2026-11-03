import {
  notificationAdminView,
  notificationAdminQuery,
  notificationRetryInput,
} from './notification.schema.js'
import { createHash, randomUUID } from 'node:crypto'
import { type Connection, Types, type ClientSession } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import { createNotificationModel } from './notification.model.js'
import { createNotificationPersistence } from './notification.persistence.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { pageMeta } from '../../shared/pagination.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
import type { DeliveryOutcome } from './notification.types.js'

function createNotificationAdminService(
  connection: Connection,
  admins: AdminAccountAccess,
  clock: () => Date = () => new Date(),
) {
  const model = createNotificationModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(notificationAdminQuery, raw)
      return admins.owned(
        token,
        async (_actor, session) => {
          await createNotificationPersistence(connection, model).verifyIndexes()
          const filter = {
            ...(input.status ? { status: input.status } : {}),
            ...(input.eventType ? { eventType: input.eventType } : {}),
          }
          const rows = await model
            .find(filter)
            .select('eventType status attemptCount createdAt sentAt nextAttemptAt')
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .maxTimeMS(5000)
            .session(session)
          return {
            items: rows.map((row) =>
              notificationAdminView.parse({
                id: row._id.toHexString(),
                eventType: row.eventType,
                status: row.status,
                attemptCount: row.attemptCount,
                createdAt: row.createdAt.toISOString(),
                ...(row.sentAt ? { sentAt: row.sentAt.toISOString() } : {}),
              }),
            ),
            pagination: pageMeta(input, await model.countDocuments(filter).session(session)),
          }
        },
        false,
      )
    },
    async retry(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      const id = parseInput(z.string().regex(/^[a-f0-9]{24}$/), rawId),
        input = parseInput(notificationRetryInput, raw),
        key = parseInput(z.string().min(1).max(128), rawKey),
        digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      return admins.owned(token, async (actorId, session) => {
        await createNotificationPersistence(connection, model).verifyIndexes()
        const row = await model.findById(id).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const cause = {
          action: 'notification.retry.request',
          targetType: 'notification',
          targetId: id,
          operationKey: createHash('sha256').update(`${actorId}:${id}:${key}`).digest('hex'),
        }
        const prior = await lookup(session, cause)
        if (prior) {
          if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return { status: row.status }
        }
        if (
          !['failed', 'retry_wait'].includes(row.status) ||
          !['PROVIDER_RATE_LIMIT', 'PROVIDER_REJECTED', 'RETRIES_EXHAUSTED'].includes(
            row.lastErrorCode ?? '',
          ) ||
          [
            'registration',
            'password_reset',
            'email_verification',
            'email_change',
            'guest_order_access',
          ].includes(row.eventType)
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        const changed = await model.updateOne(
          { _id: row._id, status: row.status, attemptCount: row.attemptCount },
          { $set: { status: 'queued', nextAttemptAt: clock(), attemptCount: 0 } },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          beforeDigest: createHash('sha256').update(String(row.attemptCount)).digest('hex'),
          afterDigest: digest,
          reason: input.reason,
          occurredAt: clock(),
        })
        return { status: 'queued' }
      })
    },
  }
}

function createNotificationService(connection: Connection, clock: () => Date = () => new Date()) {
  const model = createNotificationModel(connection)
  return {
    ...createNotificationPersistence(connection, model),
    async enqueue(
      input: {
        userId: Types.ObjectId | string
        email: string
        name: string
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      const intent = {
        ...input,
        userId: typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId,
      }
      await model.updateOne(
        { eventKey: `registration:${intent.userId.toHexString()}:v1` },
        {
          $setOnInsert: {
            userId: intent.userId,
            recipient: {
              emailNormalized: intent.email,
              displayName: intent.name,
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
      input: {
        orderId: Types.ObjectId
        userId?: Types.ObjectId
        email: string
        name: string
      },
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
    async enqueueCommerce(
      input: {
        orderId: Types.ObjectId
        userId?: Types.ObjectId
        email: string
        name: string
        eventType:
          | 'order_confirmation'
          | 'order_cancellation'
          | 'shipment_update'
          | 'delivery_completion'
        operationKey: string
        occurredAt: Date
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction()) throw new Error('Commerce intent requires business transaction')
      await createNotificationPersistence(connection, model).verifyIndexes()
      await model.updateOne(
        { eventKey: `${input.eventType}:${input.orderId.toHexString()}:${input.operationKey}:v1` },
        {
          $setOnInsert: {
            orderId: input.orderId,
            ...(input.userId ? { userId: input.userId } : {}),
            recipient: { emailNormalized: input.email, displayName: input.name },
            eventType: input.eventType,
            templateVersion: `${input.eventType.replaceAll('_', '-')}-v1`,
            payload: { operationKey: input.operationKey, occurredAt: input.occurredAt },
            status: 'queued',
            attemptCount: 0,
            nextAttemptAt: clock(),
          },
        },
        { upsert: true, session, runValidators: true },
      )
    },
    async enqueueReturnDecision(
      input: {
        orderId: Types.ObjectId
        userId?: Types.ObjectId
        email: string
        name: string
        returnId: Types.ObjectId
        from: 'under_review' | 'approved' | 'inspected'
        to: 'approved' | 'rejected' | 'completed'
        operationKey: string
        occurredAt: Date
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Return notification requires business transaction')
      await createNotificationPersistence(connection, model).verifyIndexes()
      await model.updateOne(
        { eventKey: `return_update:${input.returnId.toHexString()}:${input.operationKey}:v1` },
        {
          $setOnInsert: {
            orderId: input.orderId,
            ...(input.userId ? { userId: input.userId } : {}),
            recipient: { emailNormalized: input.email, displayName: input.name },
            eventType: 'return_update',
            templateVersion: 'return-update-v1',
            payload: {
              returnId: input.returnId,
              returnFrom: input.from,
              returnTo: input.to,
              operationKey: input.operationKey,
              occurredAt: input.occurredAt,
            },
            status: 'queued',
            attemptCount: 0,
            nextAttemptAt: clock(),
          },
        },
        { upsert: true, session, runValidators: true },
      )
    },
    async enqueueRefund(
      input: {
        orderId: Types.ObjectId
        userId?: Types.ObjectId
        email: string
        name: string
        refundId: Types.ObjectId
        status: 'approved' | 'processing' | 'completed' | 'failed' | 'rejected'
        operationKey: string
        occurredAt: Date
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction()) throw new Error('Refund intent requires transaction')
      await createNotificationPersistence(connection, model).verifyIndexes()
      await model.updateOne(
        { eventKey: `refund_update:${input.refundId}:${input.status}:${input.operationKey}:v1` },
        {
          $setOnInsert: {
            orderId: input.orderId,
            ...(input.userId ? { userId: input.userId } : {}),
            recipient: { emailNormalized: input.email, displayName: input.name },
            eventType: 'refund_update',
            templateVersion: 'refund-update-v1',
            payload: {
              refundId: input.refundId,
              refundStatus: input.status,
              operationKey: input.operationKey,
              occurredAt: input.occurredAt,
            },
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
        id: Types.ObjectId | string
        challengeId: Types.ObjectId | string
        orderId: Types.ObjectId | string
        email: string
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      const intent = {
        ...input,
        id: typeof input.id === 'string' ? new Types.ObjectId(input.id) : input.id,
        challengeId:
          typeof input.challengeId === 'string'
            ? new Types.ObjectId(input.challengeId)
            : input.challengeId,
        orderId:
          typeof input.orderId === 'string' ? new Types.ObjectId(input.orderId) : input.orderId,
      }
      await new model({
        _id: intent.id,
        eventKey: `guest_order_access:${intent.challengeId.toHexString()}:v1`,
        orderId: intent.orderId,
        recipient: { emailNormalized: intent.email },
        eventType: 'guest_order_access',
        templateVersion: 'guest-order-access-v1',
        payload: { challengeId: intent.challengeId },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: clock(),
      }).save({ session })
    },
    async enqueuePasswordReset(
      input: {
        id: Types.ObjectId | string
        challengeId: Types.ObjectId | string
        userId: Types.ObjectId | string
        email: string
      },
      session: ClientSession,
      kind: 'customer' | 'admin' = 'customer',
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      const intent = {
        ...input,
        id: typeof input.id === 'string' ? new Types.ObjectId(input.id) : input.id,
        challengeId:
          typeof input.challengeId === 'string'
            ? new Types.ObjectId(input.challengeId)
            : input.challengeId,
        userId: typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId,
      }
      await new model({
        _id: intent.id,
        eventKey: `password_reset:${intent.challengeId.toHexString()}:v1`,
        userId: intent.userId,
        recipient: { emailNormalized: intent.email },
        eventType: 'password_reset',
        templateVersion: kind === 'admin' ? 'admin-password-reset-v1' : 'password-reset-v1',
        payload: { challengeId: intent.challengeId },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: clock(),
      }).save({ session })
    },
    async enqueueEmailVerification(
      input: {
        id: Types.ObjectId | string
        challengeId: Types.ObjectId | string
        userId: Types.ObjectId | string
        email: string
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      const intent = {
        ...input,
        id: typeof input.id === 'string' ? new Types.ObjectId(input.id) : input.id,
        challengeId:
          typeof input.challengeId === 'string'
            ? new Types.ObjectId(input.challengeId)
            : input.challengeId,
        userId: typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId,
      }
      await new model({
        _id: intent.id,
        eventKey: `email_verify:${intent.challengeId.toHexString()}:v1`,
        userId: intent.userId,
        recipient: { emailNormalized: intent.email },
        eventType: 'email_verification',
        templateVersion: 'email-verification-v1',
        payload: { challengeId: intent.challengeId },
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: clock(),
      }).save({ session })
    },
    async enqueueEmailChange(
      input: {
        id: Types.ObjectId | string
        challengeId: Types.ObjectId | string
        userId: Types.ObjectId | string
        email: string
      },
      session: ClientSession,
    ) {
      if (!session.inTransaction())
        throw new Error('Notification intent requires business transaction.')
      const intent = {
        ...input,
        id: typeof input.id === 'string' ? new Types.ObjectId(input.id) : input.id,
        challengeId:
          typeof input.challengeId === 'string'
            ? new Types.ObjectId(input.challengeId)
            : input.challengeId,
        userId: typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId,
      }
      await new model({
        _id: intent.id,
        eventKey: `email_change:${intent.challengeId.toHexString()}:v1`,
        userId: intent.userId,
        recipient: { emailNormalized: intent.email },
        eventType: 'email_change',
        templateVersion: 'email-change-v1',
        payload: { challengeId: intent.challengeId },
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
      includeCommerce = false,
      includeReturns = false,
      includeRefunds = false,
      includeEmailVerification = false,
    ) {
      const claimId = randomUUID()
      const row = await model
        .findOneAndUpdate(
          {
            $or: [
              { eventType: 'registration', templateVersion: 'registration-v1' },
              ...(includeEmailVerification
                ? [
                    {
                      eventType: 'email_verification' as const,
                      templateVersion: 'email-verification-v1',
                    },
                  ]
                : []),
              ...(includeRefunds
                ? [{ eventType: 'refund_update' as const, templateVersion: 'refund-update-v1' }]
                : []),
              ...(includeReturns
                ? [{ eventType: 'return_update' as const, templateVersion: 'return-update-v1' }]
                : []),
              ...(includeCommerce
                ? [
                    { eventType: 'order_received' as const, templateVersion: 'order-received-v1' },
                    {
                      eventType: 'order_confirmation' as const,
                      templateVersion: 'order-confirmation-v1',
                    },
                    {
                      eventType: 'order_cancellation' as const,
                      templateVersion: 'order-cancellation-v1',
                    },
                    {
                      eventType: 'shipment_update' as const,
                      templateVersion: 'shipment-update-v1',
                    },
                    {
                      eventType: 'delivery_completion' as const,
                      templateVersion: 'delivery-completion-v1',
                    },
                  ]
                : []),
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

type NotificationService = ReturnType<typeof createNotificationService>

export { createNotificationAdminService, createNotificationService }
export type { NotificationService }

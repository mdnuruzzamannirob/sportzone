import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { createNotificationModel } from './notification.model.js'
import { createNotificationPersistence } from './notification.persistence.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { paginationSchema, pageMeta } from '../../shared/pagination.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
export function notificationAdminService(
  connection: Connection,
  admins: AdminAccountAccess,
  clock: () => Date = () => new Date(),
) {
  const model = createNotificationModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(
        paginationSchema.safeExtend({
          status: z
            .enum(['queued', 'sending', 'sent', 'retry_wait', 'failed', 'delivery_uncertain'])
            .optional(),
          eventType: z
            .enum([
              'registration',
              'password_reset',
              'email_change',
              'guest_order_access',
              'order_received',
              'order_confirmation',
              'order_cancellation',
              'shipment_update',
              'delivery_completion',
              'payment_success',
              'payment_failure',
              'payment_pending',
              'return_update',
              'refund_update',
            ])
            .optional(),
        }),
        raw,
      )
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
            items: rows.map((row) => ({
              id: row._id.toHexString(),
              eventType: row.eventType,
              status: row.status,
              attemptCount: row.attemptCount,
              createdAt: row.createdAt.toISOString(),
              ...(row.sentAt ? { sentAt: row.sentAt.toISOString() } : {}),
            })),
            pagination: pageMeta(input, await model.countDocuments(filter).session(session)),
          }
        },
        false,
      )
    },
    async retry(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      const id = parseInput(z.string().regex(/^[a-f0-9]{24}$/), rawId),
        input = parseInput(z.strictObject({ reason: z.string().trim().min(1).max(2000) }), raw),
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
          ['registration', 'password_reset', 'email_change', 'guest_order_access'].includes(
            row.eventType,
          )
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

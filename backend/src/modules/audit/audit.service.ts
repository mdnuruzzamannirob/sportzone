import { Types, type Connection, type ClientSession } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { auditModel } from './audit.model.js'
import { verifyAuditPersistence } from './audit.persistence.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const eventInput = z.strictObject({
  actorType: z.enum(['customer', 'admin', 'guest_order', 'system']),
  actorId: id.optional(),
  action: z.string().min(1).max(128),
  targetType: z.string().min(1).max(128),
  targetId: id.optional(),
  operationKey: z.string().min(1).max(128),
  occurredAt: z.date(),
  beforeDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  afterDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  requestCorrelationId: z.string().min(1).max(128).optional(),
})
export function createAuditWriter(connection: Connection, replaySameDigest = false) {
  const model = auditModel(connection)
  // Append-only capability: callers receive no model, query, update or delete operation.
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyAuditPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const event = parseInput(eventInput, raw)
    if (replaySameDigest) {
      const previous = await model
        .findOne({
          operationKey: event.operationKey,
          action: event.action,
          targetType: event.targetType,
          ...(event.targetId ? { targetId: event.targetId } : { targetId: { $exists: false } }),
        })
        .session(session)
      if (previous) {
        if (
          previous.afterDigest !== event.afterDigest ||
          previous.beforeDigest !== event.beforeDigest ||
          previous.actorType !== event.actorType ||
          previous.actorId?.toHexString() !== event.actorId ||
          previous.reason !== event.reason
        )
          throw new ApiError('STATE_CONFLICT')
        return
      }
    }
    const row = new model(event)
    if (event.actorId) row.actorId = new Types.ObjectId(event.actorId)
    if (event.targetId) row.targetId = new Types.ObjectId(event.targetId)
    await row.save({ session })
  }
}

// Narrow durable operation identity lookup; exposes no persistence model or mutable audit capability.
export function auditOperationReader(connection: Connection) {
  const model = auditModel(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyAuditPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const input = z
      .strictObject({
        action: z.string().min(1).max(128),
        targetType: z.string().min(1).max(128),
        targetId: id,
        operationKey: z.string().min(1).max(128),
      })
      .parse(raw)
    const row = await model.findOne(input).session(session)
    return row ? { afterDigest: row.afterDigest } : undefined
  }
}

// Payment monitors receive only event identity/status facts, never free-form reasons or request data.
export function paymentAuditAccess(connection: Connection) {
  return async (session: ClientSession, paymentId: string, offset: number, limit: number) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyAuditPersistence(connection)
    const model = auditModel(connection),
      filter = { targetType: 'payment', targetId: new Types.ObjectId(paymentId) }
    const rows = await model
      .find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .session(session)
      .lean()
    return {
      total: await model.countDocuments(filter).session(session),
      items: rows.map((r) => ({
        id: r._id.toHexString(),
        action: r.action,
        occurredAt: r.occurredAt.toISOString(),
        actorType: r.actorType,
      })),
    }
  }
}

export function paymentReconciliationScheduleAccess(connection: Connection) {
  return async () => {
    await verifyAuditPersistence(connection)
    const rows = await auditModel(connection).aggregate<{ _id: Types.ObjectId; requestedAt: Date }>(
      [
        { $match: { action: 'payment.reconcile.request', targetType: 'payment' } },
        { $group: { _id: '$targetId', requestedAt: { $max: '$occurredAt' } } },
        { $sort: { requestedAt: -1, _id: -1 } },
        { $limit: 100 },
      ],
    )
    return rows.map((r) => ({ paymentId: r._id, requestedAt: r.requestedAt }))
  }
}

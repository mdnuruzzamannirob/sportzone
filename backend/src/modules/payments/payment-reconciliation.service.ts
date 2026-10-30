import { createHash } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { inTransaction } from '../../shared/database/transaction.js'
import {
  createAuditWriter,
  auditOperationReader,
  paymentReconciliationScheduleAccess,
} from '../audit/audit.service.js'
import { paymentRecordModels } from './payment-record.model.js'
import { paymentInitiationModel } from './payment-initiation.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { verifyPaymentInitiationPersistence } from './payment-initiation.persistence.js'
import type { paymentProcessingService } from './payment-processing.service.js'
export const paymentReconciliationOptions = z
  .strictObject({
    batchSize: z.int().min(1).max(100),
    leaseMs: z.int().min(1000).max(3600000),
    pollIntervalMs: z.int().min(1000).max(86400000),
    terminalPollIntervalMs: z.int().min(1000).max(604800000),
    escalateAfterMs: z.int().min(1000).max(2592000000),
  })
  .refine(
    (value) =>
      value.terminalPollIntervalMs >= value.pollIntervalMs &&
      value.escalateAfterMs >= value.pollIntervalMs,
  )
const unresolved = ['created', 'initiated', 'pending', 'uncertain'] as const
// Durable scheduling reuses canonical attempt state + lastCheckedAt and the shared job cursor.
// No financial TTL, alternate payment API, caller-supplied references or automatic charge retry.
export function paymentReconciliationService(
  connection: Connection,
  processor: ReturnType<typeof paymentProcessingService>,
  merchantAccountKey: string,
  raw: unknown,
  clock: () => Date = () => new Date(),
) {
  if (!/^[a-f0-9]{64}$/.test(merchantAccountKey)) throw new Error('Invalid reconciliation merchant')
  const options = paymentReconciliationOptions.parse(raw),
    { attempts, intake } = paymentRecordModels(connection),
    operations = paymentInitiationModel(connection),
    audit = createAuditWriter(connection, true),
    lookup = auditOperationReader(connection)
  async function verify() {
    await verifyPaymentRecordPersistence(connection)
    await verifyPaymentInitiationPersistence(connection)
  }
  return {
    jobKey: `payment-reconciliation-${merchantAccountKey}`,
    async due(cursor?: string) {
      await verify()
      const now = clock()
      if (!Number.isFinite(now.getTime()) || (cursor && !/^[a-f0-9]{24}$/.test(cursor)))
        throw new ApiError('STATE_CONFLICT')
      const due = (interval: number) => ({
        $or: [
          { lastCheckedAt: { $exists: false } },
          { lastCheckedAt: { $lte: new Date(now.getTime() - interval) } },
        ],
      })
      const requested = await paymentReconciliationScheduleAccess(connection)()
      const rows = await attempts
        .find({
          ...(cursor ? { _id: { $gt: new Types.ObjectId(cursor) } } : {}),
          $or: [
            ...requested.map((r) => ({
              paymentId: r.paymentId,
              $or: [
                { lastCheckedAt: { $exists: false } },
                { lastCheckedAt: { $lt: r.requestedAt } },
              ],
            })),
            { state: { $in: [...unresolved] }, ...due(options.pollIntervalMs) },
            {
              state: { $in: ['verified_paid', 'verified_failed', 'verified_cancelled'] },
              ...due(options.terminalPollIntervalMs),
            },
          ],
        })
        .sort({ _id: 1 })
        .limit(options.batchSize)
        .lean()
      return rows.map((row) => row._id.toHexString())
    },
    async reconcile(attemptId: string, fence: (session: ClientSession) => Promise<void>) {
      await verify()
      const row = await attempts.findById(attemptId).lean()
      if (!row) return { skipped: true, resolved: false, escalated: false }
      const operation = await operations
        .findOne({ attemptId: row._id, orderId: row.orderId, merchantAccountKey })
        .lean()
      if (!operation) return { skipped: true, resolved: false, escalated: false }
      // Processor independently queries the configured merchant transaction API and validates every
      // discovered paid receipt. Browser hints, elapsed time and provider timeout prove no failure.
      const outcome = await processor.process(
        { merchantAccountKey, tranId: row.tranId, claimedStatus: 'PENDING' },
        { fence },
      )
      return inTransaction(connection, async (session) => {
        await fence(session)
        const current = await attempts.findById(attemptId).session(session)
        if (!current) throw new ApiError('STATE_CONFLICT')
        const now = clock()
        if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
        const terminal = !unresolved.some((state) => state === current.state)
        const disputed = await intake
          .exists({
            merchantAccountKey,
            reportedTranId: current.tranId,
            matchingStatus: { $in: ['unmatched', 'quarantined'] },
          })
          .session(session)
        const resolved = outcome === 'committed' && terminal && !disputed
        const checkedAt = new Date(Math.max(now.getTime(), current.lastCheckedAt?.getTime() ?? 0))
        const changed = await attempts.updateOne(
          { _id: current._id, state: current.state },
          {
            $set: {
              lastCheckedAt: checkedAt,
              ...(!terminal && outcome === 'retry' ? { state: 'uncertain' } : {}),
            },
          },
          { session },
        )
        if (changed.matchedCount !== 1) throw new ApiError('STATE_CONFLICT')
        const overdue =
          !resolved && now.getTime() - current.createdAt.getTime() >= options.escalateAfterMs
        const cause = {
          action: 'payment.reconcile.escalated',
          targetType: 'payment_attempt',
          targetId: attemptId,
          operationKey: `reconcile-escalation:${attemptId}`,
        }
        const previous = await lookup(session, cause)
        const escalated = overdue && !previous
        if (escalated)
          await audit(session, {
            actorType: 'system',
            action: 'payment.reconcile.escalated',
            targetType: 'payment_attempt',
            targetId: attemptId,
            operationKey: `reconcile-escalation:${attemptId}`,
            afterDigest: createHash('sha256')
              .update(`${merchantAccountKey}:${attemptId}:unresolved`)
              .digest('hex'),
            reason: 'Provider outcome remains unresolved; authorized investigation required',
            occurredAt: now,
          })
        if (resolved && previous)
          await audit(session, {
            actorType: 'system',
            action: 'payment.reconcile.resolved',
            targetType: 'payment_attempt',
            targetId: attemptId,
            operationKey: `reconcile-resolved:${attemptId}:${current.state}`,
            afterDigest: createHash('sha256')
              .update(`${merchantAccountKey}:${attemptId}:${current.state}`)
              .digest('hex'),
            occurredAt: now,
          })
        await fence(session)
        return { skipped: false, resolved, escalated }
      })
    },
  }
}

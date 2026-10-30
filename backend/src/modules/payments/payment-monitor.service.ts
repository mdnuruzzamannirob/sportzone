import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import {
  createAuditWriter,
  auditOperationReader,
  paymentAuditAccess,
} from '../audit/audit.service.js'
import { correctionMonitoringAccess } from '../refunds/correction-obligation.service.js'
import { paymentModel, type Payment } from './payment.model.js'
import { paymentRecordModels } from './payment-record.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { paymentInitiationKey } from './payment-initiation.schema.js'
import {
  paymentMonitorQuery,
  paymentMonitorPage,
  paymentMonitorList,
  paymentMonitorDetail,
  paymentReconcileInput,
  monitorId,
} from './payment-monitor.schema.js'
import { pageMeta } from '../../shared/pagination.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const summary = (r: Payment & { _id: { toHexString(): string } }) => ({
  id: r._id.toHexString(),
  orderId: r.orderId.toHexString(),
  method: r.method,
  paymentStatus: r.paymentStatus,
  riskStatus: r.riskStatus,
  expectedPoisha: r.expectedPoisha,
  verifiedCollectedPoisha: r.verifiedCollectedPoisha,
  merchandiseFundedPoisha: r.merchandiseFundedPoisha,
  correctionCollectedPoisha: r.correctionCollectedPoisha,
  unassignedCollectedPoisha: r.unassignedCollectedPoisha,
  currency: r.currency,
  revision: r.revision,
})
export function paymentMonitorService(connection: Connection, access: AdminAccountAccess) {
  const payments = paymentModel(connection),
    { attempts, collections, intake } = paymentRecordModels(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection),
    readAudit = paymentAuditAccess(connection),
    corrections = correctionMonitoringAccess(connection)
  async function ready() {
    try {
      await verifyPaymentRecordPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  return {
    async list(token: string | undefined, raw: unknown) {
      const q = parseInput(paymentMonitorQuery, raw),
        offset = (q.page - 1) * q.pageSize
      return access.owned(
        token,
        async (_actor, session) => {
          await ready()
          if (q.view !== 'payments') {
            if (
              q.orderId ||
              q.paymentStatus ||
              q.riskStatus ||
              q.method ||
              q.attemptId ||
              q.collectionId
            )
              throw new ApiError('INVALID_REQUEST')
            const filter = { matchingStatus: q.view },
              rows = await intake
                .find(filter)
                .sort({ verifiedAt: -1, _id: -1 })
                .skip(offset)
                .limit(q.pageSize)
                .session(session)
                .lean()
            return paymentMonitorList.parse({
              items: [],
              intake: rows.map((r) => ({
                id: r._id.toHexString(),
                amountPoisha: r.amountPoisha,
                currency: r.currency,
                matchingStatus: r.matchingStatus,
                collectedAt: r.collectedAt.toISOString(),
                verifiedAt: r.verifiedAt.toISOString(),
                ...(r.linkedCollectionId
                  ? { linkedCollectionId: r.linkedCollectionId.toHexString() }
                  : {}),
              })),
              pagination: pageMeta(q, await intake.countDocuments(filter).session(session)),
            })
          }
          const byAttempt = q.attemptId
            ? await attempts.findById(q.attemptId).session(session).lean()
            : undefined
          const byCollection = q.collectionId
            ? await collections.findById(q.collectionId).session(session).lean()
            : undefined
          const selected = byAttempt?.paymentId ?? byCollection?.paymentId
          const noMatch =
            (q.attemptId && !byAttempt) ||
            (q.collectionId && !byCollection) ||
            (byAttempt && byCollection && !byAttempt.paymentId.equals(byCollection.paymentId))
          const filter = {
            ...(noMatch ? { _id: { $in: [] } } : selected ? { _id: selected } : {}),
            ...(q.orderId ? { orderId: q.orderId } : {}),
            ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
            ...(q.riskStatus ? { riskStatus: q.riskStatus } : {}),
            ...(q.method ? { method: q.method } : {}),
          }
          const rows = await payments
            .find(filter)
            .sort({ updatedAt: -1, _id: -1 })
            .skip(offset)
            .limit(q.pageSize)
            .session(session)
            .lean()
          return paymentMonitorList.parse({
            items: rows.map(summary),
            intake: [],
            pagination: pageMeta(q, await payments.countDocuments(filter).session(session)),
          })
        },
        false,
      )
    },
    async detail(token: string | undefined, rawId: unknown, raw: unknown) {
      const id = parseInput(monitorId, rawId),
        q = parseInput(paymentMonitorPage, raw),
        offset = (q.page - 1) * q.pageSize
      return access.owned(
        token,
        async (_actor, session) => {
          await ready()
          const payment = await payments.findById(id).session(session).lean()
          if (!payment) throw new ApiError('NOT_FOUND')
          const filter = { paymentId: id },
            a = await attempts
              .find(filter)
              .sort({ createdAt: -1, _id: -1 })
              .skip(offset)
              .limit(q.pageSize)
              .session(session)
              .lean(),
            c = await collections
              .find(filter)
              .sort({ createdAt: -1, _id: -1 })
              .skip(offset)
              .limit(q.pageSize)
              .session(session),
            correction = await corrections(session, id, offset, q.pageSize),
            facts = await readAudit(session, id, offset, q.pageSize)
          return paymentMonitorDetail.parse({
            payment: summary(payment),
            attempts: a.map((r) => ({
              id: r._id.toHexString(),
              state: r.state,
              amountDisposition: r.amountDisposition,
              expectedAmountPoisha: r.expectedAmountPoisha,
              ...(r.lastCheckedAt ? { lastCheckedAt: r.lastCheckedAt.toISOString() } : {}),
              ...(r.expiresAt ? { expiresAt: r.expiresAt.toISOString() } : {}),
            })),
            collections: c.map((r) => ({
              id: r._id.toHexString(),
              ...(r.attemptId ? { attemptId: r.attemptId.toHexString() } : {}),
              ...(r.intakeId ? { intakeId: r.intakeId.toHexString() } : {}),
              amountPoisha: r.amountPoisha,
              merchandiseAllocatedPoisha: r.get('merchandiseAllocatedPoisha'),
              correctionAllocatedPoisha: r.get('correctionAllocatedPoisha'),
              unassignedAllocatedPoisha: r.get('unassignedAllocatedPoisha'),
              collectedAt: r.collectedAt.toISOString(),
            })),
            corrections: correction.items,
            audit: facts.items,
            pagination: {
              attempts: pageMeta(q, await attempts.countDocuments(filter).session(session)),
              collections: pageMeta(q, await collections.countDocuments(filter).session(session)),
              corrections: pageMeta(q, correction.total),
              audit: pageMeta(q, facts.total),
            },
          })
        },
        false,
      )
    },
    async reconcile(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(monitorId, rawId),
        input = parseInput(paymentReconcileInput, raw),
        command = hash(`manual-reconcile:${id}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input))
      const run = () =>
        access.owned(token, async (actorId, session) => {
          await ready()
          const payment = await payments.findById(id).session(session)
          if (!payment) throw new ApiError('NOT_FOUND')
          const cause = {
              action: 'payment.reconcile.request',
              targetType: 'payment',
              targetId: id,
              operationKey: command,
            },
            old = await lookup(session, cause)
          if (old) {
            if (old.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            return { state: 'pending' as const }
          }
          if (payment.method !== 'online') throw new ApiError('STATE_CONFLICT')
          const rows = await attempts.find({ paymentId: id }).limit(102).session(session)
          if (!rows.length || rows.length > 101) throw new ApiError('STATE_CONFLICT')
          // This is only durable scheduling. The existing merchant-leased worker independently verifies
          // the provider; no admin body can set Paid, risk clearance, source mapping or collection fields.
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: new Date(),
          })
          return { state: 'pending' as const }
        })
      try {
        return await run()
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
          throw error
        return run() // New transaction and current authorization, never reuse an aborted session.
      }
    },
  }
}

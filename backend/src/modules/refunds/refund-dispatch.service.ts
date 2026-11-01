import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { refundFundingAccess } from '../payments/payment.service.js'
import type { createSslcommerzAdapter } from '../../providers/sslcommerz/sslcommerz.client.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { assertOutsideTransaction, inTransaction } from '../../shared/database/transaction.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { refundModel } from './refund.model.js'
import { refundAttemptModel } from './refund-attempt.model.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
import { verifyRefundAttemptPersistence } from './refund-attempt.persistence.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        s === s.trim() && [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    )
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
// Only durable created intents may dispatch. Submitted/uncertain intents always reconcile first.
export function refundDispatchService(
  connection: Connection,
  admins: AdminAccountAccess,
  funding: ReturnType<typeof refundFundingAccess>,
  gateway: Pick<ReturnType<typeof createSslcommerzAdapter>, 'initiateRefund'>,
  clock: () => Date = () => new Date(),
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection)
  const audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async dispatch(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      assertOutsideTransaction()
      const refundId = parseInput(id, rawId),
        input = parseInput(
          z.strictObject({ method: z.literal('gateway'), reason: text(2000) }),
          raw,
        ),
        key = parseInput(text(128), rawKey)
      const digest = hash(JSON.stringify(input))
      const begun = await admins.owned(token, async (actorId, session) => {
        await verifyCorrectionPersistence(connection)
        await verifyRefundAttemptPersistence(connection)
        const refund = await refunds.findById(refundId).session(session)
        if (!refund) throw new ApiError('NOT_FOUND')
        const cause = {
          action: 'refund.payout.dispatch',
          targetType: 'refund',
          targetId: refundId,
          operationKey: hash(`refund-dispatch:${actorId}:${refundId}:${key}`),
        }
        const prior = await lookup(session, cause)
        if (prior && prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
        const attempt = await attempts
          .findOne({ refundId: refund._id })
          .sort({ attemptNumber: -1 })
          .session(session)
        if (
          !attempt ||
          refund.method !== 'gateway' ||
          refund.capacityStatus !== 'reserved' ||
          !['approved', 'processing'].includes(refund.status) ||
          attempt.provider !== 'sslcommerz' ||
          attempt.amountPoisha !== refund.amountPoisha
        )
          throw new ApiError('STATE_CONFLICT')
        if (attempt.status !== 'created')
          return { intent: undefined, attemptId: attempt._id.toHexString(), state: attempt.status }
        if (prior || !attempt.originalBankTranId || !attempt.refundTransId)
          throw new ApiError('STATE_CONFLICT')
        const facts = await funding.list(
          session,
          refund.orderId.toHexString(),
          refund.classification,
        )
        const source = facts.sources.find(
          (s) => s.sourceCollectionId === refund.sourceCollectionId.toHexString(),
        )
        if (
          !source ||
          source.bankTranId !== attempt.originalBankTranId ||
          source.heldPoisha < refund.amountPoisha ||
          facts.order.heldPoisha < refund.amountPoisha
        )
          throw new ApiError('STATE_CONFLICT')
        const now = clock()
        if (
          !Number.isFinite(now.getTime()) ||
          now < attempt.initiatedAt ||
          attempt.revision >= Number.MAX_SAFE_INTEGER ||
          refund.revision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('STATE_CONFLICT')
        const changed = await attempts.collection.updateOne(
          { _id: attempt._id, status: 'created', revision: attempt.revision },
          {
            $set: { status: 'submitted', lastOperationKey: cause.operationKey, updatedAt: now },
            $inc: { revision: 1 },
          },
          { session },
        )
        const state = await refunds.collection.updateOne(
          {
            _id: refund._id,
            status: refund.status,
            capacityStatus: 'reserved',
            revision: refund.revision,
          },
          { $set: { status: 'processing', updatedAt: now }, $inc: { revision: 1 } },
          { session },
        )
        if (changed.modifiedCount !== 1 || state.modifiedCount !== 1)
          throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        return {
          attemptId: attempt._id.toHexString(),
          state: 'submitted',
          intent: {
            bankTranId: attempt.originalBankTranId,
            refundTransId: attempt.refundTransId,
            amountPoisha: attempt.amountPoisha,
            remarks: 'Approved SportZone refund',
            referenceId: refundId,
          },
        }
      })
      if (!begun.intent) return { attemptId: begun.attemptId, state: begun.state }
      let accepted: { refundRefId: string; evidenceDigest: string } | undefined
      try {
        const outcome = await gateway.initiateRefund(begun.intent)
        if (outcome.kind === 'accepted')
          accepted = parseInput(
            z.strictObject({
              refundRefId: z.string().min(1).max(50),
              evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
            }),
            { refundRefId: outcome.refundRefId, evidenceDigest: outcome.evidenceDigest },
          )
      } catch {
        /* A timeout/unknown result retains the original reserved identity. */
      }
      const receipt = accepted
      return inTransaction(connection, async (session) => {
        await verifyRefundAttemptPersistence(connection)
        const attempt = await attempts.findById(begun.attemptId).session(session)
        if (!attempt) throw new ApiError('STATE_CONFLICT')
        if (!['submitted', 'uncertain'].includes(attempt.status))
          return { attemptId: begun.attemptId, state: attempt.status }
        const now = clock()
        if (
          !Number.isFinite(now.getTime()) ||
          now < attempt.initiatedAt ||
          attempt.revision >= Number.MAX_SAFE_INTEGER ||
          (receipt && attempt.refundRefId && attempt.refundRefId !== receipt.refundRefId)
        )
          throw new ApiError('STATE_CONFLICT')
        const state = receipt ? 'submitted' : 'uncertain'
        const changed = await attempts.collection.updateOne(
          { _id: attempt._id, revision: attempt.revision, status: attempt.status },
          {
            $set: {
              status: state,
              ...(receipt ? { refundRefId: receipt.refundRefId } : {}),
              lastCheckedAt: now,
              updatedAt: now,
            },
            $inc: { revision: 1 },
          },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          actorType: 'system',
          action: `refund.payout.${receipt ? 'accepted' : 'uncertain'}`,
          targetType: 'refund',
          targetId: refundId,
          operationKey: hash(`refund-result:${begun.attemptId}`),
          ...(receipt ? { afterDigest: receipt.evidenceDigest } : {}),
          occurredAt: now,
        })
        return { attemptId: begun.attemptId, state }
      })
    },
  }
}

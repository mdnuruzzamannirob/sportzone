import { createHash } from 'node:crypto'
import { Types, type Connection } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { verifiedFundingOrderAccess } from '../orders/order.service.js'
import type { verifiedAllocationService } from '../checkout/verified-allocation.service.js'
import { correctionObligationService } from '../refunds/correction-obligation.service.js'
import { auditOperationReader, createAuditWriter } from '../audit/audit.service.js'
import { readProtectedFile } from '../../shared/protected-file.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { parseRevision } from '../../shared/preconditions.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { paymentRecordModels, collectionAmounts } from './payment-record.model.js'
import { paymentModel } from './payment.model.js'
import { paymentInitiationModel } from './payment-initiation.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { paymentInitiationKey } from './payment-initiation.schema.js'
import {
  receiptLinkInput,
  collectionAllocationInput,
  linkedReceipt,
  collectionSummary,
  matchingId,
  matchingProof,
  type MatchingFacts,
} from './payment-matching.schema.js'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type PaymentMatchingAuthority = (facts: Omit<MatchingFacts, 'verifiedAt'>) => Promise<void>
export function protectedPaymentMatchingEvidence(
  path: string,
  clock: () => Date = () => new Date(),
): PaymentMatchingAuthority {
  return async (facts) => {
    const records = z
      .strictObject({ version: z.literal(1), records: z.array(matchingProof).max(1000) })
      .parse(JSON.parse((await readProtectedFile(path, 1000000)).toString('utf8'))).records
    const rows = records.filter(
      (row) =>
        row.operation === facts.operation &&
        row.targetId === facts.targetId &&
        row.matchingEvidenceRef === facts.matchingEvidenceRef,
    )
    const row = rows[0]
    if (rows.length !== 1 || !row || Date.parse(row.verifiedAt) > clock().getTime())
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    const { verifiedAt: _at, ...body } = row
    const normalized = matchingProof.omit({ verifiedAt: true }).parse(facts)
    if (hash(body) !== hash(normalized)) throw new ApiError('BUSINESS_RULE_VIOLATION')
  }
}
export function paymentMatchingService(
  connection: Connection,
  admins: AdminAccountAccess,
  orders: ReturnType<typeof verifiedFundingOrderAccess>,
  allocation: ReturnType<typeof verifiedAllocationService>,
  verify?: PaymentMatchingAuthority,
  clock: () => Date = () => new Date(),
) {
  const { intake, collections, attempts } = paymentRecordModels(connection),
    payments = paymentModel(connection),
    initiations = paymentInitiationModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection),
    corrections = correctionObligationService(connection)
  const summary = (row: InstanceType<typeof collections>) =>
    collectionSummary.parse({
      id: row._id.toHexString(),
      paymentId: row.paymentId.toHexString(),
      orderId: row.orderId.toHexString(),
      provider: row.provider,
      sourceKind: row.provider,
      amountPoisha: row.amountPoisha,
      currency: row.currency,
      collectedAt: row.collectedAt.toISOString(),
      revision: row.revision,
      ...Object.fromEntries(collectionAmounts.map((name) => [name, row.get(name)])),
    })
  async function ready() {
    try {
      await verifyPaymentRecordPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function retry<T>(work: () => Promise<T>) {
    try {
      return await work()
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
        throw error
      return work()
    }
  }
  return {
    async link(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(matchingId, rawId),
        input = parseInput(receiptLinkInput, raw),
        operationKey = hash(['receipt-link', id, parseInput(paymentInitiationKey, key)]),
        digest = hash(input),
        cause = {
          action: 'payment.receipt.match',
          targetType: 'provider_receipt',
          targetId: id,
          operationKey,
        }
      const prepared = await admins.owned(
        token,
        async (_actor, session) => {
          await ready()
          const row = await intake.findById(id).session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          const old = await lookup(session, cause)
          if (old) {
            if (old.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            if (!row.linkedCollectionId) throw new ApiError('STATE_CONFLICT')
            return {
              result: linkedReceipt.parse({
                linkedCollectionId: row.linkedCollectionId.toHexString(),
                matchingStatus: 'linked',
              }),
            }
          }
          return {
            facts: {
              operation: 'link' as const,
              targetId: id,
              orderId: input.orderId,
              ...(input.attemptId ? { attemptId: input.attemptId } : {}),
              amountPoisha: row.amountPoisha,
              evidenceDigest: row.validationDigest,
              matchingEvidenceRef: input.matchingEvidenceRef,
            },
          }
        },
        false,
      )
      if ('result' in prepared) return prepared.result
      if (!verify) throw new ApiError('SERVICE_UNAVAILABLE')
      await verify(prepared.facts)
      return retry(() =>
        admins.owned(token, async (actorId, session) => {
          await ready()
          const row = await intake.findById(id).session(session)
          if (!row || row.validationDigest !== prepared.facts.evidenceDigest)
            throw new ApiError('STATE_CONFLICT')
          const old = await lookup(session, cause)
          if (old && old.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          if (row.linkedCollectionId) {
            const existing = await collections.findById(row.linkedCollectionId).session(session)
            if (
              !existing ||
              existing.orderId.toHexString() !== input.orderId ||
              (input.attemptId && existing.attemptId?.toHexString() !== input.attemptId)
            )
              throw new ApiError('STATE_CONFLICT')
            if (!old)
              await audit(session, {
                ...cause,
                actorType: 'admin',
                actorId,
                afterDigest: digest,
                reason: input.reason,
                occurredAt: clock(),
              })
            return linkedReceipt.parse({
              linkedCollectionId: existing._id.toHexString(),
              matchingStatus: 'linked',
            })
          }
          const now = clock(),
            payment = await payments
              .findOne({ orderId: input.orderId, method: 'online' })
              .session(session)
          if (
            !payment ||
            payment.revision >= Number.MAX_SAFE_INTEGER ||
            row.verifiedAt > now ||
            row.collectedAt > now ||
            !row.bankTranId ||
            !row.validationId ||
            row.currency !== 'BDT'
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          const operation = await initiations
            .findOne({
              orderId: input.orderId,
              merchantAccountKey: row.merchantAccountKey,
              ...(input.attemptId ? { attemptId: input.attemptId } : {}),
            })
            .session(session)
          if (!operation) throw new ApiError('BUSINESS_RULE_VIOLATION')
          const attempt = input.attemptId
            ? await attempts
                .findOne({ _id: input.attemptId, orderId: input.orderId, paymentId: payment._id })
                .session(session)
            : undefined
          if (input.attemptId && !attempt) throw new ApiError('BUSINESS_RULE_VIOLATION')
          const order = await orders.inspect(session, input.orderId)
          if (!order || order.expectedPoisha !== payment.expectedPoisha)
            throw new ApiError('STATE_CONFLICT')
          const next = payment.verifiedCollectedPoisha + row.amountPoisha
          if (!Number.isSafeInteger(next)) throw new ApiError('STATE_CONFLICT')
          const correction = order.cancelled ? row.amountPoisha : 0,
            unassigned = row.amountPoisha - correction
          const linked = new collections({
            paymentId: payment._id,
            orderId: payment.orderId,
            intakeId: row._id,
            ...(attempt ? { attemptId: attempt._id } : {}),
            provider: row.provider,
            merchantAccountKey: row.merchantAccountKey,
            providerCollectionRef: row.providerCollectionRef,
            bankTranId: row.bankTranId,
            validationId: row.validationId,
            amountPoisha: row.amountPoisha,
            currency: row.currency,
            collectedAt: row.collectedAt,
            verifiedAt: row.verifiedAt,
            evidenceDigest: row.validationDigest,
            verifiedBy: { type: 'provider' },
            revision: 0,
            ...Object.fromEntries(
              collectionAmounts.map((name) => [
                name,
                name === 'correctionAllocatedPoisha'
                  ? correction
                  : name === 'unassignedAllocatedPoisha'
                    ? unassigned
                    : 0,
              ]),
            ),
          })
          await linked.save({ session })
          const changed = await intake.updateOne(
            { _id: row._id, matchingStatus: row.matchingStatus },
            {
              $set: {
                matchingStatus: 'linked',
                linkedCollectionId: linked._id,
                resolutionKey: operationKey,
                resolvedBy: new Types.ObjectId(actorId),
                resolvedAt: now,
              },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          const updated = await payments.updateOne(
            { _id: payment._id, revision: payment.revision },
            {
              $inc: {
                revision: 1,
                verifiedCollectedPoisha: row.amountPoisha,
                correctionCollectedPoisha: correction,
                unassignedCollectedPoisha: unassigned,
              },
              $set: {
                riskStatus: 'review',
                lastReconciledAt: now,
                ...(order.cancelled ? { paymentStatus: 'paid' } : {}),
              },
            },
            { session },
          )
          if (updated.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          if (correction)
            await corrections.create(session, {
              orderId: input.orderId,
              paymentId: payment._id.toHexString(),
              sourceCollectionId: linked._id.toHexString(),
              amountPoisha: correction,
              decisionKey: hash(['payment-correction', linked._id.toHexString()]),
            })
          if (attempt && attempt.state !== 'verified_paid') {
            const changedAttempt = await attempts.updateOne(
              { _id: attempt._id, state: attempt.state },
              {
                $set: {
                  state: 'verified_paid',
                  verifiedReceiptAmountPoisha: row.amountPoisha,
                  amountDisposition:
                    row.amountPoisha === attempt.expectedAmountPoisha
                      ? 'matched'
                      : row.amountPoisha < attempt.expectedAmountPoisha
                        ? 'under_collected'
                        : 'over_collected',
                  providerValidationId: row.validationId,
                  bankTranId: row.bankTranId,
                  lastCheckedAt: now,
                  verification: {
                    verifiedAt: row.verifiedAt,
                    verifiedStatus: 'SUPERVISED_SETTLED',
                    merchantIdMatch: true,
                    amountMatch: row.amountPoisha === attempt.expectedAmountPoisha,
                    currencyMatch: true,
                    referenceMatch: true,
                    rawRecordDigest: row.validationDigest,
                  },
                },
              },
              { session },
            )
            if (changedAttempt.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          }
          await orders.finish(session, input.orderId, false, true)
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: now,
          })
          return linkedReceipt.parse({
            linkedCollectionId: linked._id.toHexString(),
            matchingStatus: 'linked',
          })
        }),
      )
    },
    async allocate(
      token: string | undefined,
      rawId: unknown,
      raw: unknown,
      key: unknown,
      ifMatch: string | undefined,
    ) {
      const id = parseInput(matchingId, rawId),
        input = parseInput(collectionAllocationInput, raw),
        revision = parseRevision(ifMatch),
        operationKey = hash(['collection-allocate', id, parseInput(paymentInitiationKey, key)]),
        digest = hash({ ...input, revision }),
        cause = {
          action: 'payment.collection.allocate',
          targetType: 'payment_collection',
          targetId: id,
          operationKey,
        }
      if (revision === undefined) throw new ApiError('PRECONDITION_REQUIRED')
      if (!Number.isSafeInteger(revision)) throw new ApiError('PRECONDITION_FAILED')
      const prepared = await admins.owned(
        token,
        async (_actor, session) => {
          await ready()
          const row = await collections.findById(id).session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          const old = await lookup(session, cause)
          if (old) {
            if (old.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            return { result: summary(row) }
          }
          if (row.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
          return {
            facts: {
              operation: 'allocate' as const,
              targetId: id,
              orderId: row.orderId.toHexString(),
              amountPoisha: row.amountPoisha,
              evidenceDigest: row.evidenceDigest,
              matchingEvidenceRef: input.matchingEvidenceRef,
              merchandisePoisha: input.merchandisePoisha,
              correctionPoisha: input.correctionPoisha,
              unassignedPoisha: input.unassignedPoisha,
            },
          }
        },
        false,
      )
      if ('result' in prepared) return prepared.result
      if (!verify) throw new ApiError('SERVICE_UNAVAILABLE')
      await verify(prepared.facts)
      return retry(() =>
        admins.owned(token, async (actorId, session) => {
          await ready()
          const row = await collections.findById(id).session(session),
            old = await lookup(session, cause)
          if (!row) throw new ApiError('NOT_FOUND')
          if (old) {
            if (old.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            return summary(row)
          }
          if (row.revision !== revision || row.revision >= Number.MAX_SAFE_INTEGER)
            throw new ApiError('PRECONDITION_FAILED')
          if (
            BigInt(input.merchandisePoisha) +
              BigInt(input.correctionPoisha) +
              BigInt(input.unassignedPoisha) !==
              BigInt(row.amountPoisha) ||
            input.merchandisePoisha <
              row.get('merchandiseRefundHeldPoisha') +
                row.get('merchandiseRefundCompletedPoisha') ||
            input.correctionPoisha <
              row.get('correctionRefundHeldPoisha') + row.get('correctionRefundCompletedPoisha')
          )
            throw new ApiError('REFUND_BALANCE_EXCEEDED')
          const payment = await payments
            .findOne({ _id: row.paymentId, orderId: row.orderId, method: 'online' })
            .session(session)
          if (!payment || payment.revision >= Number.MAX_SAFE_INTEGER)
            throw new ApiError('STATE_CONFLICT')
          const order = await orders.inspect(session, row.orderId.toHexString())
          if (!order) throw new ApiError('STATE_CONFLICT')
          const merchandise = input.merchandisePoisha - row.get('merchandiseAllocatedPoisha'),
            correction = input.correctionPoisha - row.get('correctionAllocatedPoisha'),
            unassigned = input.unassignedPoisha - row.get('unassignedAllocatedPoisha'),
            next = payment.merchandiseFundedPoisha + merchandise
          // A funding reduction needs a compensating order/capacity transition, never this generic financial mutation.
          if (
            merchandise < 0 ||
            (order.cancelled && input.merchandisePoisha > 0) ||
            next > payment.expectedPoisha ||
            payment.correctionCollectedPoisha + correction <
              payment.correctionRefundHeldPoisha + payment.correctionRefundCompletedPoisha ||
            payment.unassignedCollectedPoisha + unassigned < 0
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          const now = clock()
          const changed = await collections.updateOne(
            { _id: row._id, revision },
            {
              $set: {
                merchandiseAllocatedPoisha: input.merchandisePoisha,
                correctionAllocatedPoisha: input.correctionPoisha,
                unassignedAllocatedPoisha: input.unassignedPoisha,
              },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('PRECONDITION_FAILED')
          const updated = await payments.updateOne(
            { _id: payment._id, revision: payment.revision },
            {
              $inc: { revision: 1 },
              $set: {
                merchandiseFundedPoisha: next,
                correctionCollectedPoisha: payment.correctionCollectedPoisha + correction,
                unassignedCollectedPoisha: payment.unassignedCollectedPoisha + unassigned,
                lastReconciledAt: now,
                ...(next === payment.expectedPoisha &&
                !['partially_refunded', 'refunded'].includes(payment.paymentStatus)
                  ? { paymentStatus: 'paid' }
                  : {}),
              },
            },
            { session },
          )
          if (updated.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          if (correction > 0)
            await corrections.create(session, {
              orderId: row.orderId.toHexString(),
              paymentId: payment._id.toHexString(),
              sourceCollectionId: id,
              amountPoisha: correction,
              decisionKey: hash(['allocation-correction', id, revision + 1]),
            })
          let committed = false
          if (order.eligible && payment.riskStatus === 'clear' && next === payment.expectedPoisha)
            committed = await allocation.commitLive(session, order.binding)
          await orders.finish(
            session,
            row.orderId.toHexString(),
            committed,
            payment.riskStatus !== 'clear',
          )
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            beforeDigest: hash(summary(row)),
            afterDigest: digest,
            reason: input.reason,
            occurredAt: now,
          })
          const result = await collections.findById(id).session(session)
          if (!result) throw new ApiError('STATE_CONFLICT')
          return summary(result)
        }),
      )
    },
  }
}

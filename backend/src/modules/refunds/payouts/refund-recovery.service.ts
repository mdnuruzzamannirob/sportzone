import { createHash } from 'node:crypto'
import { type ClientSession, type Connection, Types } from 'mongoose'
import { z } from 'zod'
import { assertOutsideTransaction, inTransaction } from '../../../shared/database/transaction.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import type { AuditAccess } from '../../audit/audit.public.js'
import type { AdminAccountAccess } from '../../auth/auth.public.js'
import type { RefundUnitOutcomeAccess } from '../../orders/order.public.js'
import type { PaymentGateway, RefundFundingAccess } from '../../payments/payment.public.js'

import { refundApproval } from '../obligations/refund-reservation.schema.js'
import type { createRefundReservationService } from '../obligations/refund-reservation.service.js'
import { refundModel } from '../refund.model.js'
import { verifyCorrectionPersistence } from '../refund.persistence.js'
import type { RefundNotifier } from '../refund.public.js'
import { refundManualInput } from '../refund-api.schema.js'
import { refundAttemptModel } from './refund-attempt.model.js'
import { verifyRefundAttemptPersistence } from './refund-attempt.persistence.js'
import { type RefundOutcomeVerifier, refundOutcomeProof } from './refund-outcome.schema.js'

const id = z.string().regex(/^[a-f0-9]{24}$/),
  text = z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))

const keySchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (s) => s === s.trim() && [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
  )

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

function createRefundRecoveryService(
  connection: Connection,
  admins: AdminAccountAccess,
  funding: RefundFundingAccess,
  units: RefundUnitOutcomeAccess,
  auditAccess: AuditAccess,
  verifyEvidence?: RefundOutcomeVerifier,
  gateway?: {
    client: Pick<PaymentGateway, 'queryRefund'>
    merchantAccountKey: string
  },
  notify?: RefundNotifier,
  clock: () => Date = () => new Date(),
  methodPolicy?: Parameters<typeof createRefundReservationService>[7],
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection),
    audit = auditAccess.write,
    lookup = auditAccess.lookup
  async function ready() {
    await verifyCorrectionPersistence(connection)
    await verifyRefundAttemptPersistence(connection)
  }
  async function read(session: ClientSession, refundId: string) {
    await ready()
    const refund = await refunds.findById(refundId).session(session)
    if (!refund) throw new ApiError('NOT_FOUND')
    const attempt = await attempts
      .findOne({ refundId: refund._id })
      .sort({ attemptNumber: -1 })
      .session(session)
    if (
      !attempt ||
      refund.revision >= Number.MAX_SAFE_INTEGER ||
      attempt.revision >= Number.MAX_SAFE_INTEGER
    )
      throw new ApiError('STATE_CONFLICT')
    if (attempt.amountPoisha !== refund.amountPoisha) throw new ApiError('STATE_CONFLICT')
    const facts = await funding.list(session, refund.orderId.toHexString(), refund.classification),
      source = facts.sources.find(
        (s) => s.sourceCollectionId === refund.sourceCollectionId.toHexString(),
      )
    const dispatch = attempt.lastOperationKey
      ? await lookup(session, {
          action:
            attempt.provider === 'sslcommerz' ? 'refund.payout.dispatch' : 'refund.attempt.prepare',
          targetType: 'refund',
          targetId: refundId,
          operationKey: attempt.lastOperationKey,
        })
      : undefined
    return { refund, attempt, source, dispatchedAt: dispatch?.occurredAt }
  }
  const outcome = (
    refund: InstanceType<typeof refunds>,
    attempt: InstanceType<typeof attempts>,
  ) => ({
    status: refund.status,
    attemptState: attempt.status,
    attemptId: attempt._id.toHexString(),
  })
  async function event(
    session: ClientSession,
    refund: InstanceType<typeof refunds>,
    status: Parameters<RefundNotifier>[1]['status'],
    operationKey: string,
    now: Date,
  ) {
    await notify?.(session, {
      refundId: refund._id.toHexString(),
      orderId: refund.orderId.toHexString(),
      status,
      operationKey,
      occurredAt: now,
    })
  }
  async function ledger(
    session: ClientSession,
    refund: InstanceType<typeof refunds>,
    complete: boolean,
    occurredAt: Date,
  ) {
    await funding.settle(session, {
      orderId: refund.orderId.toHexString(),
      sourceCollectionId: refund.sourceCollectionId.toHexString(),
      classification: refund.classification,
      amountPoisha: refund.amountPoisha,
      deliveryAmountPoisha: refund.deliveryAmountPoisha,
      complete,
      occurredAt,
    })
    await units(session, {
      orderId: refund.orderId.toHexString(),
      action: complete ? 'complete' : 'release',
      items: refund.items.map((i) => ({
        orderItemId: i.orderItemId.toHexString(),
        unitAmounts: i.unitAmounts.map((u) => ({
          ordinal: u.ordinal,
          amountPoisha: u.amountPoisha,
        })),
      })),
    })
  }
  async function reconcile(
    refundId: string,
    authority: {
      token?: string | undefined
      system?: boolean
      fence?: (session: ClientSession) => Promise<void>
    },
    request?: {
      transferReference: string
      evidenceRef: string
    },
    reason = 'Scheduled refund investigation',
    rawKey = 'scheduled',
  ) {
    assertOutsideTransaction()
    parseInput(id, refundId)
    const operationKey = hash(`refund-reconcile:${refundId}:${parseInput(keySchema, rawKey)}`),
      digest = hash(JSON.stringify({ request, reason })),
      cause = { action: 'refund.reconcile', targetType: 'refund', targetId: refundId, operationKey }
    const readCommand = async (session: ClientSession) => {
      const value = await read(session, refundId),
        prior = await lookup(session, cause)
      if (prior && prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
      if (prior || ['completed', 'released'].includes(value.refund.capacityStatus)) {
        if (
          request &&
          (value.attempt.provider !== 'manual' ||
            (value.attempt.manualEvidence &&
              value.attempt.manualEvidence.transferReference !== request.transferReference))
        )
          throw new ApiError('STATE_CONFLICT')
        return { ...value, replay: true }
      }
      return { ...value, replay: false }
    }
    const before = authority.system
      ? await inTransaction(connection, readCommand)
      : await admins.owned(authority.token, (_a, s) => readCommand(s), false)
    if (before.replay) {
      const alias = async (actorId: string | undefined, session: ClientSession) => {
        await authority.fence?.(session)
        const prior = await lookup(session, cause)
        if (prior && prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
        if (!prior)
          await audit(session, {
            ...cause,
            actorType: actorId ? 'admin' : 'system',
            ...(actorId ? { actorId } : {}),
            afterDigest: digest,
            reason,
            occurredAt: clock(),
          })
        const current = await read(session, refundId)
        return outcome(current.refund, current.attempt)
      }
      return authority.system
        ? inTransaction(connection, (s) => alias(undefined, s))
        : admins.owned(authority.token, alias)
    }
    if (request && !verifyEvidence) throw new ApiError('SERVICE_UNAVAILABLE')
    if (request && before.attempt.provider !== 'manual') throw new ApiError('STATE_CONFLICT')
    if (
      before.refund.capacityStatus !== 'reserved' ||
      !['submitted', 'uncertain'].includes(before.attempt.status)
    )
      throw new ApiError('STATE_CONFLICT')
    let proof: ReturnType<typeof refundOutcomeProof.parse> | undefined
    if (verifyEvidence) {
      let raw: unknown
      try {
        raw = await verifyEvidence({ refundId, attemptId: before.attempt._id.toHexString() })
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      if (raw !== undefined) proof = parseInput(refundOutcomeProof, raw)
    }
    const recoveredRef =
      proof &&
      proof.refundId === refundId &&
      proof.orderId === before.refund.orderId.toHexString() &&
      proof.sourceCollectionId === before.refund.sourceCollectionId.toHexString() &&
      proof.attemptId === before.attempt._id.toHexString() &&
      proof.amountPoisha === before.refund.amountPoisha &&
      proof.method === 'gateway' &&
      proof.provider === 'sslcommerz' &&
      proof.merchantAccountKey === gateway?.merchantAccountKey &&
      proof.bankTranId === before.attempt.originalBankTranId &&
      proof.refundTransId === before.attempt.refundTransId
        ? proof.refundRefId
        : undefined
    const providerRef = before.attempt.refundRefId ?? recoveredRef
    let providerMatched = false
    if (
      before.attempt.provider === 'sslcommerz' &&
      gateway &&
      before.source?.merchantAccountKey === gateway.merchantAccountKey &&
      before.source?.bankTranId === before.attempt.originalBankTranId &&
      providerRef &&
      before.attempt.originalBankTranId
    ) {
      const report = await gateway.client
        .queryRefund({
          refundRefId: providerRef,
          bankTranId: before.attempt.originalBankTranId,
        })
        .catch(() => ({ kind: 'uncertain' as const }))
      providerMatched =
        report.kind === 'refund_report' &&
        report.merchantAccountKey === gateway.merchantAccountKey &&
        report.refundRefId === providerRef &&
        report.bankTranId === before.attempt.originalBankTranId &&
        report.status === (proof?.outcome === 'paid' ? 'refunded' : 'cancelled')
    }
    const now = clock(),
      r = before.refund,
      a = before.attempt
    if (!Number.isFinite(now.getTime()) || now < a.updatedAt) throw new ApiError('STATE_CONFLICT')
    if (proof) {
      const mismatch =
        proof.refundId !== refundId ||
        proof.orderId !== r.orderId.toHexString() ||
        proof.sourceCollectionId !== r.sourceCollectionId.toHexString() ||
        proof.attemptId !== a._id.toHexString() ||
        proof.provider !== a.provider ||
        proof.method !== r.method ||
        proof.amountPoisha !== r.amountPoisha ||
        proof.checkedAt > now ||
        !before.dispatchedAt ||
        proof.checkedAt < before.dispatchedAt ||
        (proof.outcome === 'no_payout' && proof.checkedAt <= before.dispatchedAt) ||
        (proof.outcome === 'paid' &&
          (!proof.paidAt ||
            proof.paidAt < (before.dispatchedAt ?? a.initiatedAt) ||
            proof.paidAt > proof.checkedAt)) ||
        (a.provider === 'sslcommerz' &&
          (!gateway ||
            before.source?.merchantAccountKey !== gateway.merchantAccountKey ||
            before.source?.bankTranId !== a.originalBankTranId ||
            proof.merchantAccountKey !== gateway.merchantAccountKey ||
            proof.bankTranId !== a.originalBankTranId ||
            proof.refundTransId !== a.refundTransId ||
            proof.refundRefId !== providerRef ||
            (providerRef ? !providerMatched : proof.outcome !== 'no_payout'))) ||
        (a.provider === 'manual' &&
          proof.outcome === 'paid' &&
          (!request ||
            proof.transferReference !== request.transferReference ||
            proof.evidenceRef !== request.evidenceRef ||
            !proof.destinationMasked ||
            (!!r.consentEvidenceRef &&
              (proof.consentEvidenceRef !== r.consentEvidenceRef ||
                !proof.consentDigest ||
                !proof.consentAt ||
                !proof.paidAt ||
                proof.consentAt > proof.paidAt))))
      if (mismatch) throw new ApiError('BUSINESS_RULE_VIOLATION')
    }
    if (request && proof?.outcome !== 'paid') throw new ApiError('BUSINESS_RULE_VIOLATION')
    const work = async (actorId: string | undefined, session: ClientSession) => {
      await authority.fence?.(session)
      const current = await read(session, refundId),
        cause = {
          action: 'refund.reconcile',
          targetType: 'refund',
          targetId: refundId,
          operationKey,
        }
      const prior = await lookup(session, cause)
      if (prior) {
        if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
        return outcome(current.refund, current.attempt)
      }
      if (current.refund.capacityStatus !== 'reserved') {
        await audit(session, {
          ...cause,
          actorType: actorId ? 'admin' : 'system',
          ...(actorId ? { actorId } : {}),
          afterDigest: digest,
          reason,
          occurredAt: now,
        })
        return outcome(current.refund, current.attempt)
      }
      if (
        current.attempt._id.toHexString() !== a._id.toHexString() ||
        current.refund.revision !== r.revision ||
        current.attempt.revision !== a.revision
      )
        throw new ApiError('STATE_CONFLICT')
      let status: 'completed' | 'failed' | 'processing' = 'processing'
      if (proof) {
        const complete = proof.outcome === 'paid'
        await ledger(session, current.refund, complete, now)
        status = complete ? 'completed' : 'failed'
        const changed = await refunds.collection.updateOne(
          { _id: r._id, revision: r.revision, capacityStatus: 'reserved' },
          {
            $set: {
              status,
              capacityStatus: complete ? 'completed' : 'released',
              ...(complete ? { completedAt: proof.paidAt } : {}),
              updatedAt: now,
            },
            $inc: { revision: 1 },
          },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      }
      const changed = await attempts.collection.updateOne(
        { _id: a._id, revision: a.revision, status: a.status },
        {
          $set: {
            status: proof ? (proof.outcome === 'paid' ? 'confirmed' : 'failed') : 'uncertain',
            ...(proof && providerRef && a.provider === 'sslcommerz'
              ? { refundRefId: providerRef }
              : {}),
            lastCheckedAt: now,
            updatedAt: now,
            ...(proof?.outcome === 'paid'
              ? {
                  confirmedAt: proof.paidAt,
                  ...(a.provider === 'manual'
                    ? {
                        manualEvidence: {
                          destinationMasked: proof.destinationMasked,
                          transferReference: proof.transferReference,
                          evidenceDigest: proof.evidenceDigest,
                          confirmedBy: new Types.ObjectId(actorId),
                          confirmedAt: proof.paidAt,
                        },
                      }
                    : {}),
                }
              : {}),
            ...(proof?.outcome === 'no_payout' ? { failureCode: 'VERIFIED_NO_PAYOUT' } : {}),
          },
          ...(proof?.outcome === 'paid' ? { $unset: { failureCode: 1 } } : {}),
          $inc: { revision: 1 },
        },
        { session },
      )
      if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      await audit(session, {
        ...cause,
        actorType: actorId ? 'admin' : 'system',
        ...(actorId ? { actorId } : {}),
        afterDigest: digest,
        reason,
        occurredAt: now,
      })
      if (proof) {
        await audit(session, {
          actorType: actorId ? 'admin' : 'system',
          ...(actorId ? { actorId } : {}),
          action: `refund.outcome.${status}`,
          targetType: 'refund',
          targetId: refundId,
          operationKey: hash(`outcome:${a._id}`),
          afterDigest: proof.evidenceDigest,
          occurredAt: now,
        })
        await event(session, r, status, operationKey, now)
      }
      return {
        status,
        attemptState: proof ? (proof.outcome === 'paid' ? 'confirmed' : 'failed') : 'uncertain',
        attemptId: a._id.toHexString(),
      }
    }
    try {
      return await (authority.system
        ? inTransaction(connection, (s) => work(undefined, s))
        : admins.owned(authority.token, work))
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  async function approveRequested(
    session: ClientSession,
    actorId: string,
    r: InstanceType<typeof refunds>,
    input: {
      decision: 'approve'
      reason: string
      method?: string | undefined
      consentEvidenceRef?: string | undefined
    },
    key: string,
  ) {
    if (!methodPolicy) throw new ApiError('SERVICE_UNAVAILABLE')
    const approved = parseInput(
      refundApproval,
      await methodPolicy(session, {
        orderId: r.orderId.toHexString(),
        basis: r.basis,
        ...(r.basisRefId ? { basisRefId: r.basisRefId.toHexString() } : {}),
        actorId,
        deliveryRequestedPoisha: r.deliveryAmountPoisha,
      }),
    )
    if (
      (approved.consentRequired && !approved.consentEvidenceRef) ||
      (input.method && input.method !== approved.method) ||
      (input.consentEvidenceRef && input.consentEvidenceRef !== approved.consentEvidenceRef) ||
      (r.deliveryAmountPoisha > 0 && !approved.deliveryApproved)
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    const now = clock()
    if (!Number.isFinite(now.getTime()) || now < r.createdAt) throw new ApiError('STATE_CONFLICT')
    const facts = await funding.list(session, r.orderId.toHexString(), r.classification),
      source = facts.sources.find(
        (s) => s.sourceCollectionId === r.sourceCollectionId.toHexString(),
      )
    if (
      !source ||
      (approved.method === 'gateway' && (source.provider !== 'sslcommerz' || !source.bankTranId))
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    const snapshot = await units(session, {
      orderId: r.orderId.toHexString(),
      action: 'reserve',
      items: r.items.map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        unitAmounts: item.unitAmounts.map((unit) => ({
          ordinal: unit.ordinal,
          amountPoisha: unit.amountPoisha,
        })),
      })),
    })
    await funding.reserve(session, {
      orderId: r.orderId.toHexString(),
      sourceCollectionId: r.sourceCollectionId.toHexString(),
      classification: r.classification,
      amountPoisha: r.amountPoisha,
      deliveryAmountPoisha: r.deliveryAmountPoisha,
      deliveryChargePoisha: snapshot.deliveryChargePoisha,
    })
    const attempt = new attempts({
      refundId: r._id,
      attemptNumber: 1,
      idempotencyKey: hash(`refund-attempt:${r._id}:1`),
      provider: approved.method === 'gateway' ? 'sslcommerz' : 'manual',
      ...(approved.method === 'gateway'
        ? {
            originalBankTranId: source.bankTranId,
            refundTransId: `szr_${hash(`${r._id}:1`).slice(0, 26)}`,
          }
        : {}),
      amountPoisha: r.amountPoisha,
      status: 'created',
      initiatedAt: now,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })
    await attempt.save({ session, timestamps: false })
    const changed = await refunds.collection.updateOne(
      { _id: r._id, revision: r.revision, status: 'requested', capacityStatus: 'not_reserved' },
      {
        $inc: { revision: 1 },
        $set: {
          status: 'approved',
          capacityStatus: 'reserved',
          approvedBy: new Types.ObjectId(actorId),
          approvedAt: now,
          updatedAt: now,
          method: approved.method,
          policyVersion: approved.policyVersion,
          ...(approved.consentEvidenceRef
            ? { consentEvidenceRef: approved.consentEvidenceRef }
            : {}),
          timingSnapshot: {
            policyVersion: approved.policyVersion,
            timezone: 'Asia/Dhaka',
            targetBusinessDays: 7,
            status: 'under_review',
          },
        },
        ...(!approved.consentEvidenceRef ? { $unset: { consentEvidenceRef: 1 } } : {}),
      },
      { session },
    )
    if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    const operationKey = hash(`approve:${r._id}:${parseInput(keySchema, key)}`)
    await audit(session, {
      action: 'refund.review.approve',
      targetType: 'refund',
      targetId: r._id.toHexString(),
      operationKey,
      actorType: 'admin',
      actorId,
      afterDigest: hash(JSON.stringify(input)),
      reason: input.reason,
      occurredAt: now,
    })
    await event(session, r, 'approved', operationKey, now)
    return {
      status: 'approved' as const,
      attemptState: attempt.status,
      attemptId: attempt._id.toHexString(),
    }
  }
  return {
    reconcile: (token: string | undefined, refundId: string, reason: string, key: string) =>
      reconcile(refundId, { token }, undefined, reason, key),
    scheduled: (refundId: string, fence: (session: ClientSession) => Promise<void>) =>
      reconcile(
        refundId,
        { system: true, fence },
        undefined,
        'Scheduled refund investigation',
        `worker:${clock().getTime()}`,
      ),
    async approve(token: string | undefined, refundId: string, raw: unknown, key: string) {
      const input = parseInput(
        z.strictObject({
          decision: z.literal('approve'),
          reason: text,
          method: z
            .enum(['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank'])
            .optional(),
          consentEvidenceRef: z.string().min(1).max(256).optional(),
        }),
        raw,
      )
      return admins.owned(token, async (actorId, session) => {
        await ready()
        const pending = await refunds
          .findOne({
            _id: parseInput(id, refundId),
            status: 'requested',
            capacityStatus: 'not_reserved',
          })
          .session(session)
        if (pending) return approveRequested(session, actorId, pending, input, key)
        const { refund: r, attempt: a } = await read(session, parseInput(id, refundId))
        const operationKey = hash(`approve:${refundId}:${parseInput(keySchema, key)}`),
          digest = hash(JSON.stringify(input)),
          cause = {
            action: 'refund.review.approve',
            targetType: 'refund',
            targetId: refundId,
            operationKey,
          },
          prior = await lookup(session, cause)
        if (prior) {
          if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return outcome(r, a)
        }
        if (
          r.status === 'failed' &&
          r.capacityStatus === 'released' &&
          a.status === 'failed' &&
          a.failureCode === 'VERIFIED_NO_PAYOUT' &&
          input.method &&
          input.method !== r.method
        ) {
          if (!methodPolicy) throw new ApiError('SERVICE_UNAVAILABLE')
          const approved = parseInput(
            refundApproval,
            await methodPolicy(session, {
              orderId: r.orderId.toHexString(),
              basis: r.basis,
              ...(r.basisRefId ? { basisRefId: r.basisRefId.toHexString() } : {}),
              actorId,
              deliveryRequestedPoisha: r.deliveryAmountPoisha,
            }),
          )
          if (
            approved.method !== input.method ||
            approved.method === 'gateway' ||
            approved.policyVersion !== r.policyVersion ||
            !approved.consentEvidenceRef ||
            (input.consentEvidenceRef &&
              input.consentEvidenceRef !== approved.consentEvidenceRef) ||
            (r.deliveryAmountPoisha > 0 && !approved.deliveryApproved)
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          const now = clock()
          if (now < a.updatedAt) throw new ApiError('STATE_CONFLICT')
          const changed = await refunds.collection.updateOne(
            { _id: r._id, revision: r.revision, status: 'failed', capacityStatus: 'released' },
            {
              $set: {
                method: approved.method,
                consentEvidenceRef: approved.consentEvidenceRef,
                updatedAt: now,
              },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: now,
          })
          await audit(session, {
            actorType: 'admin',
            actorId,
            action: 'refund.method.approved',
            targetType: 'refund',
            targetId: refundId,
            operationKey,
            afterDigest: hash(JSON.stringify(approved)),
            occurredAt: now,
          })
          return outcome(r, a)
        }
        if (
          r.status !== 'approved' ||
          r.capacityStatus !== 'reserved' ||
          (input.method && input.method !== r.method) ||
          (input.consentEvidenceRef && input.consentEvidenceRef !== r.consentEvidenceRef)
        )
          throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: clock(),
        })
        return outcome(r, a)
      })
    },
    async confirmManual(token: string | undefined, refundId: string, raw: unknown, key: string) {
      const input = parseInput(refundManualInput, raw)
      return reconcile(
        refundId,
        { token },
        { transferReference: input.transferReference, evidenceRef: input.evidenceRef },
        input.reason,
        key,
      )
    },
    async prepare(token: string | undefined, refundId: string, raw: unknown, rawKey: unknown) {
      const input = parseInput(
          z.strictObject({
            method: z.enum([
              'gateway',
              'manual_bkash',
              'manual_nagad',
              'manual_rocket',
              'manual_bank',
            ]),
            reason: text,
          }),
          raw,
        ),
        key = parseInput(keySchema, rawKey)
      return admins.owned(token, async (actorId, session) => {
        const { refund: r, attempt: a } = await read(session, parseInput(id, refundId)),
          now = clock()
        if (input.method !== r.method || !Number.isFinite(now.getTime()) || now < a.updatedAt)
          throw new ApiError('STATE_CONFLICT')
        const cause = {
            action: 'refund.attempt.prepare',
            targetType: 'refund',
            targetId: refundId,
            operationKey: hash(`prepare:${refundId}:${key}`),
          },
          digest = hash(JSON.stringify(input)),
          prior = await lookup(session, cause)
        if (prior) {
          if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return outcome(r, a)
        }
        let attempt = a
        if (
          r.status === 'failed' &&
          r.capacityStatus === 'released' &&
          a.status === 'failed' &&
          a.failureCode === 'VERIFIED_NO_PAYOUT'
        ) {
          if (a.attemptNumber >= 100) throw new ApiError('STATE_CONFLICT')
          const snapshot = await units(session, {
            orderId: r.orderId.toHexString(),
            action: 'reserve',
            items: r.items.map((i) => ({
              orderItemId: i.orderItemId.toHexString(),
              unitAmounts: i.unitAmounts.map((u) => ({
                ordinal: u.ordinal,
                amountPoisha: u.amountPoisha,
              })),
            })),
          })
          await funding.reserve(session, {
            orderId: r.orderId.toHexString(),
            sourceCollectionId: r.sourceCollectionId.toHexString(),
            classification: r.classification,
            amountPoisha: r.amountPoisha,
            deliveryAmountPoisha: r.deliveryAmountPoisha,
            deliveryChargePoisha: snapshot.deliveryChargePoisha,
          })
          const number = a.attemptNumber + 1
          attempt = new attempts({
            refundId: r._id,
            attemptNumber: number,
            idempotencyKey: hash(`refund-attempt:${refundId}:${number}`),
            provider: r.method === 'gateway' ? 'sslcommerz' : 'manual',
            ...(r.method === 'gateway'
              ? {
                  originalBankTranId: a.originalBankTranId,
                  refundTransId: `szr_${hash(`${refundId}:${number}`).slice(0, 26)}`,
                }
              : {}),
            amountPoisha: r.amountPoisha,
            status: 'created',
            initiatedAt: now,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          })
          await attempt.save({ session, timestamps: false })
          const changed = await refunds.collection.updateOne(
            { _id: r._id, revision: r.revision, status: 'failed', capacityStatus: 'released' },
            {
              $set: { status: 'approved', capacityStatus: 'reserved', updatedAt: now },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await event(session, r, 'approved', cause.operationKey, now)
        } else if (
          r.capacityStatus !== 'reserved' ||
          !['approved', 'processing'].includes(r.status)
        )
          throw new ApiError('STATE_CONFLICT')
        if (attempt.provider === 'manual' && attempt.status === 'created') {
          const changed = await attempts.collection.updateOne(
            { _id: attempt._id, revision: attempt.revision, status: 'created' },
            {
              $set: { status: 'submitted', lastOperationKey: cause.operationKey, updatedAt: now },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          const changedRefund = await refunds.collection.updateOne(
            { _id: r._id, capacityStatus: 'reserved' },
            { $set: { status: 'processing', updatedAt: now }, $inc: { revision: 1 } },
            { session },
          )
          if (changedRefund.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await event(session, r, 'processing', cause.operationKey, now)
        }
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        return {
          status: attempt.provider === 'manual' ? 'processing' : 'approved',
          attemptState: attempt.provider === 'manual' ? 'submitted' : attempt.status,
          attemptId: attempt._id.toHexString(),
        }
      })
    },
    async reject(token: string | undefined, refundId: string, reason: string, key: string) {
      return admins.owned(token, async (actorId, session) => {
        await ready()
        const rejected = await refunds
          .findOne({
            _id: parseInput(id, refundId),
            status: 'rejected',
            capacityStatus: 'released',
          })
          .session(session)
        if (rejected && !(await attempts.exists({ refundId: rejected._id }).session(session))) {
          const operationKey = hash(`reject:${refundId}:${parseInput(keySchema, key)}`),
            prior = await lookup(session, {
              action: 'refund.review.reject',
              targetType: 'refund',
              targetId: refundId,
              operationKey,
            })
          if (!prior) throw new ApiError('STATE_CONFLICT')
          if (prior.afterDigest !== hash(parseInput(text, reason)))
            throw new ApiError('IDEMPOTENCY_CONFLICT')
          return {
            status: 'rejected' as const,
            attemptState: 'not_created' as const,
            attemptId: undefined,
          }
        }
        const pending = await refunds
          .findOne({
            _id: parseInput(id, refundId),
            status: 'requested',
            capacityStatus: 'not_reserved',
          })
          .session(session)
        if (pending) {
          const operationKey = hash(`reject:${refundId}:${parseInput(keySchema, key)}`),
            now = clock()
          const changed = await refunds.collection.updateOne(
            {
              _id: pending._id,
              revision: pending.revision,
              status: 'requested',
              capacityStatus: 'not_reserved',
            },
            {
              $set: { status: 'rejected', capacityStatus: 'released', updatedAt: now },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await audit(session, {
            action: 'refund.review.reject',
            targetType: 'refund',
            targetId: refundId,
            operationKey,
            actorType: 'admin',
            actorId,
            afterDigest: hash(parseInput(text, reason)),
            reason,
            occurredAt: now,
          })
          await event(session, pending, 'rejected', operationKey, now)
          return {
            status: 'rejected' as const,
            attemptState: 'not_created' as const,
            attemptId: undefined,
          }
        }
        const { refund: r, attempt: a } = await read(session, parseInput(id, refundId)),
          operationKey = hash(`reject:${refundId}:${parseInput(keySchema, key)}`),
          digest = hash(parseInput(text, reason)),
          cause = {
            action: 'refund.review.reject',
            targetType: 'refund',
            targetId: refundId,
            operationKey,
          },
          prior = await lookup(session, cause)
        if (prior) {
          if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return outcome(r, a)
        }
        if (r.status !== 'approved' || r.capacityStatus !== 'reserved' || a.status !== 'created')
          throw new ApiError('STATE_CONFLICT')
        const now = clock()
        if (!Number.isFinite(now.getTime()) || now < a.updatedAt)
          throw new ApiError('STATE_CONFLICT')
        await ledger(session, r, false, now)
        const changedAttempt = await attempts.collection.updateOne(
          { _id: a._id, revision: a.revision },
          {
            $set: { status: 'failed', failureCode: 'REJECTED_BEFORE_DISPATCH', updatedAt: now },
            $inc: { revision: 1 },
          },
          { session },
        )
        const changedRefund = await refunds.collection.updateOne(
          { _id: r._id, revision: r.revision },
          {
            $set: { status: 'rejected', capacityStatus: 'released', updatedAt: now },
            $inc: { revision: 1 },
          },
          { session },
        )
        if (changedAttempt.modifiedCount !== 1 || changedRefund.modifiedCount !== 1)
          throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason,
          occurredAt: now,
        })
        await event(session, r, 'rejected', operationKey, now)
        return { status: 'rejected', attemptState: 'failed', attemptId: a._id.toHexString() }
      })
    },
    async defer(refundId: string, fence: (session: ClientSession) => Promise<void>) {
      return inTransaction(connection, async (session) => {
        await fence(session)
        const { attempt: a } = await read(session, refundId)
        if (!['submitted', 'uncertain'].includes(a.status)) return
        const now = clock()
        if (now < a.updatedAt || a.revision >= Number.MAX_SAFE_INTEGER)
          throw new ApiError('STATE_CONFLICT')
        const changed = await attempts.collection.updateOne(
          { _id: a._id, revision: a.revision },
          {
            $set: {
              status: 'uncertain',
              failureCode: 'INVESTIGATION_REQUIRED',
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
          action: 'refund.investigation.required',
          targetType: 'refund',
          targetId: refundId,
          operationKey: hash(`investigation:${a._id}:${now.getTime()}`),
          occurredAt: now,
        })
      })
    },
    async due(cursor?: string, limit = 20, pollMs = 60000) {
      await ready()
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isSafeInteger(pollMs) ||
        pollMs < 1000
      )
        throw new ApiError('VALIDATION_FAILED')
      const rows = await attempts
        .find({
          provider: 'sslcommerz',
          status: { $in: ['submitted', 'uncertain'] },
          ...(cursor ? { _id: { $gt: new Types.ObjectId(parseInput(id, cursor)) } } : {}),
          $or: [
            { lastCheckedAt: { $exists: false } },
            { lastCheckedAt: { $lte: new Date(clock().getTime() - pollMs) } },
          ],
        })
        .sort({ _id: 1 })
        .limit(limit)
        .select('_id refundId')
        .lean()
      return rows.map((r) => ({ cursor: r._id.toHexString(), refundId: r.refundId.toHexString() }))
    },
  }
}

function refundNotificationProofAccess(
  connection: Connection,
  order: ReturnType<typeof import('../../orders/order.service.js').returnNotificationOrderAccess>,
  auditAccess: AuditAccess,
) {
  return async (input: {
    refundId: string
    orderId: string
    status: string
    operationKey: string
    occurredAt: Date
    recipient: string
  }) =>
    inTransaction(connection, async (session) => {
      const row = await refundModel(connection)
        .findOne({ _id: input.refundId, orderId: input.orderId })
        .session(session)
      if (!row) return undefined
      const audit = await auditAccess.lookup(session, {
        action: `refund.notification.${input.status}`,
        targetType: 'refund',
        targetId: input.refundId,
        operationKey: input.operationKey,
      })
      if (!audit || audit.occurredAt.getTime() !== input.occurredAt.getTime()) return undefined
      if (input.status === 'completed') {
        if (row.status !== 'completed' || row.capacityStatus !== 'completed' || !row.completedAt)
          return undefined
        const proof = await refundAttemptModel(connection)
          .findOne({
            refundId: row._id,
            status: 'confirmed',
            amountPoisha: row.amountPoisha,
            confirmedAt: row.completedAt,
          })
          .session(session)
        if (!proof) return undefined
      }
      const contact = await order(session, input.orderId)
      return contact.email === input.recipient
        ? { recipient: contact.email, orderNumber: contact.orderNumber }
        : undefined
    })
}

export type { RefundNotifier }
export { createRefundRecoveryService, refundNotificationProofAccess }

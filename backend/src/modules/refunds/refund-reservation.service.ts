import { refundGroupInput as command } from './refund-reservation.schema.js'
import type { refundRequestOrderAccess } from '../orders/order.service.js'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
} from '../auth/checkout-access.service.js'
import { customerRefundRequestInput, customerRefundRequestResult } from './refund-request.schema.js'
import type { RefundNotifier } from './refund-recovery.service.js'
import { refundApproval } from './refund-reservation.schema.js'
export { refundApproval } from './refund-reservation.schema.js'
import { createHash } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { refundFundingAccess } from '../payments/payment.service.js'
import type { refundClaimSnapshotAccess } from '../returns/return.service.js'
import type {
  refundOrderSnapshotAccess,
  refundUnitReservationAccess,
} from '../orders/order.service.js'
import { auditOperationReader, createAuditWriter } from '../audit/audit.service.js'
import { planMultiSourceMerchandiseRefund } from './refund-calculation.service.js'
import { refundModel } from './refund.model.js'
import { refundAttemptModel } from './refund-attempt.model.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
import { verifyRefundAttemptPersistence } from './refund-attempt.persistence.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
type Item = {
  orderItemId: string
  unitAmounts: { ordinal: number; amountPoisha: number }[]
  amountPoisha: number
}
type Slice = {
  sourceCollectionId: string
  items: Item[]
  merchandiseAmountPoisha: number
  deliveryAmountPoisha: number
  correctionAmountPoisha: number
  amountPoisha: number
}

// Only explicit local assembly currently supplies the protected policy authority. No provider call.
export function refundReservationService(
  connection: Connection,
  admins: AdminAccountAccess,
  claims: ReturnType<typeof refundClaimSnapshotAccess>,
  order: ReturnType<typeof refundOrderSnapshotAccess>,
  units: ReturnType<typeof refundUnitReservationAccess>,
  funding: ReturnType<typeof refundFundingAccess>,
  policy?: (
    session: ClientSession,
    input: {
      orderId: string
      basis: string
      basisRefId?: string
      actorId: string
      deliveryRequestedPoisha: number
    },
  ) => Promise<unknown>,
  clock: () => Date = () => new Date(),
  notify?: RefundNotifier,
  requests?: {
    scope: ReturnType<typeof orderScopeAccess>
    ownedOrder: ReturnType<typeof refundRequestOrderAccess>
    claimSelection(
      session: ClientSession,
      orderId: string,
      claimId: string,
      kind: 'physical_return' | 'shortage',
    ): Promise<{ orderItemId: string; quantity: number }[]>
    qualifiedClosed(
      session: ClientSession,
      orderId: string,
      basis: 'cancellation' | 'delivery_exception',
      basisRefId: string,
    ): Promise<unknown>
  },
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection)
  const audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  const view = (rows: InstanceType<typeof refunds>[]) => ({
    refundGroupKey: rows[0]?.refundGroupKey,
    refunds: rows.map((row) => ({
      id: row._id.toHexString(),
      status: row.status,
      capacityStatus: row.capacityStatus,
      amountPoisha: row.amountPoisha,
      sourceCollectionId: row.sourceCollectionId.toHexString(),
    })),
  })
  type Expected = {
    method?: string
    consentEvidenceRef?: string
    review?: { refundId: string; key: string; digest: string }
    requestUnitDigest?: string
  }
  type Result = ReturnType<typeof view>
  async function reserveCore(
    raw: unknown,
    rawKey: unknown,
    expected: Expected | undefined,
    execute: (
      work: (actorId: string, session: ClientSession) => Promise<Result>,
    ) => Promise<Result>,
    actorType: 'admin' | 'customer' | 'guest_order',
    mode: 'approved' | 'requested',
  ) {
    const input = parseInput(command, raw)
    const key = parseInput(
      z
        .string()
        .min(1)
        .max(128)
        .refine(
          (v) =>
            v === v.trim() && [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
        ),
      rawKey,
    )
    const correction = input.classification === 'payment_correction'
    if (
      correction !== (input.basis === 'payment_correction') ||
      (correction
        ? !input.correctionCollectionId ||
          input.basisRefId ||
          input.requestedItems ||
          input.deliveryChargeRequestedPoisha
        : !input.basisRefId || !input.requestedItems || input.correctionCollectionId) ||
      new Set(input.requestedItems?.map((i) => i.orderItemId)).size !==
        (input.requestedItems?.length ?? 0)
    )
      throw new ApiError('VALIDATION_FAILED')
    const normalized = {
      ...input,
      ...(input.requestedItems
        ? {
            requestedItems: [...input.requestedItems].sort((a, b) =>
              a.orderItemId.localeCompare(b.orderItemId),
            ),
          }
        : {}),
    }
    const { reason: _reason, ...natural } = normalized
    const group = hash(
        JSON.stringify({
          ...natural,
          ...(expected?.requestUnitDigest ? { requestUnitDigest: expected.requestUnitDigest } : {}),
          ...(expected?.review ? { reviewedIntent: expected.review.refundId } : {}),
        }),
      ),
      digest = hash(JSON.stringify(normalized))
    return execute(async (actorId, session) => {
      await verifyCorrectionPersistence(connection)
      await verifyRefundAttemptPersistence(connection)
      const cause = {
        action: 'refund.group.reserve',
        targetType: 'order',
        targetId: input.orderId,
        operationKey: hash(`refund-group:${actorId}:${input.orderId}:${key}`),
      }
      const reviewCause = expected?.review
        ? {
            action: 'refund.review.approve',
            targetType: 'refund',
            targetId: expected.review.refundId,
            operationKey: hash(`approve:${expected.review.refundId}:${expected.review.key}`),
          }
        : undefined
      const reviewPrior = reviewCause ? await lookup(session, reviewCause) : undefined
      if (reviewPrior && reviewPrior.afterDigest !== expected?.review?.digest)
        throw new ApiError('IDEMPOTENCY_CONFLICT')
      const reviewReceipt = async (rows: InstanceType<typeof refunds>[]) => {
        if (!reviewCause || !expected?.review) return
        if (rows.length !== 1 || rows[0]?._id.toHexString() !== expected.review.refundId)
          throw new ApiError('STATE_CONFLICT')
        if (!reviewPrior)
          await audit(session, {
            ...reviewCause,
            actorType,
            actorId,
            afterDigest: expected.review.digest,
            reason: input.reason,
            occurredAt: clock(),
          })
      }
      const prior = await lookup(session, cause)
      if (prior && prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
      const existing = await refunds
        .find({ orderId: input.orderId, refundGroupKey: group })
        .sort({ sourceCollectionId: 1 })
        .session(session)
      if (existing.length) {
        if (!prior)
          await audit(session, {
            ...cause,
            actorType,
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: clock(),
          })
        await reviewReceipt(existing)
        return view(existing)
      }
      if (prior) throw new ApiError('STATE_CONFLICT')
      if (!policy) throw new ApiError('SERVICE_UNAVAILABLE')
      const authorized = parseInput(
        refundApproval,
        await policy(session, {
          orderId: input.orderId,
          basis: input.basis,
          ...(input.basisRefId ? { basisRefId: input.basisRefId } : {}),
          actorId,
          deliveryRequestedPoisha: input.deliveryChargeRequestedPoisha,
        }),
      )
      if (
        (expected?.method && expected.method !== authorized.method) ||
        (expected?.consentEvidenceRef &&
          expected.consentEvidenceRef !== authorized.consentEvidenceRef)
      )
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      if (mode === 'approved' && authorized.consentRequired && !authorized.consentEvidenceRef)
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      const now = clock()
      if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
      const pendingUnitKeys = new Set<string>()
      const facts = await funding.list(session, input.orderId, input.classification)
      if (mode === 'requested') {
        const pending = await refunds
          .find({
            orderId: input.orderId,
            classification: input.classification,
            status: 'requested',
            capacityStatus: 'not_reserved',
          })
          .limit(1001)
          .session(session)
        if (pending.length > 1000) throw new ApiError('SERVICE_UNAVAILABLE')
        for (const row of pending) {
          for (const item of row.items)
            for (const unit of item.unitAmounts)
              pendingUnitKeys.add(`${item.orderItemId}:${unit.ordinal}`)
          const source = facts.sources.find(
            (source) => source.sourceCollectionId === row.sourceCollectionId.toHexString(),
          )
          if (!source) throw new ApiError('STATE_CONFLICT')
          source.heldPoisha += row.amountPoisha
          facts.order.heldPoisha += row.amountPoisha
          if (
            !Number.isSafeInteger(source.heldPoisha) ||
            !Number.isSafeInteger(facts.order.heldPoisha)
          )
            throw new ApiError('STATE_CONFLICT')
        }
      }
      if (!facts.sources.length) throw new ApiError('REFUND_BALANCE_EXCEEDED')
      let deliveryChargePoisha = 0
      let slices: Slice[]
      if (correction) {
        const source = facts.sources.find(
          (s) => s.sourceCollectionId === input.correctionCollectionId,
        )
        if (!source) throw new ApiError('NOT_FOUND')
        const availableAmount = source.allocatedPoisha - source.heldPoisha - source.completedPoisha
        const reviewed = expected?.review
          ? await refunds
              .findOne({
                _id: expected.review.refundId,
                orderId: input.orderId,
                sourceCollectionId: source.sourceCollectionId,
                classification: 'payment_correction',
                status: 'under_review',
                capacityStatus: 'not_reserved',
              })
              .session(session)
          : undefined
        if (expected?.review && !reviewed) throw new ApiError('STATE_CONFLICT')
        const amount = reviewed?.amountPoisha ?? availableAmount
        if (amount > availableAmount) throw new ApiError('REFUND_BALANCE_EXCEEDED')
        if (
          amount <= 0 ||
          amount >
            facts.order.allocatedPoisha - facts.order.heldPoisha - facts.order.completedPoisha
        )
          throw new ApiError('REFUND_BALANCE_EXCEEDED')
        slices = [
          {
            sourceCollectionId: source.sourceCollectionId,
            items: [],
            merchandiseAmountPoisha: 0,
            deliveryAmountPoisha: 0,
            correctionAmountPoisha: amount,
            amountPoisha: amount,
          },
        ]
      } else {
        if (!input.basisRefId || !input.requestedItems) throw new ApiError('VALIDATION_FAILED')
        const selection = await claims(
          session,
          input.orderId,
          input.basisRefId,
          input.requestedItems,
          input.basis === 'shortage' ? 'shortage' : 'physical_return',
        )
        const snapshot = await order(session, input.orderId, input.basisRefId, selection)
        for (const line of snapshot.lines)
          for (const unit of line.units)
            if (pendingUnitKeys.has(`${line.orderItemId}:${unit.ordinal}`)) unit.eligible = false
        deliveryChargePoisha = snapshot.deliveryChargePoisha
        if (
          BigInt(facts.delivery.heldPoisha) +
            BigInt(facts.delivery.completedPoisha) +
            BigInt(input.deliveryChargeRequestedPoisha) >
          BigInt(deliveryChargePoisha)
        )
          throw new ApiError('REFUND_BALANCE_EXCEEDED')
        if (
          snapshot.lines.some(
            (line) =>
              line.units.filter(
                (unit) =>
                  unit.eligible &&
                  unit.netEntitlementPoisha > unit.refundHeldPoisha + unit.refundCompletedPoisha,
              ).length < line.quantity,
          )
        )
          throw new ApiError('REFUND_BALANCE_EXCEEDED')
        const plan = planMultiSourceMerchandiseRefund({
          lines: snapshot.lines,
          sources: facts.sources.map((s) => ({
            sourceCollectionId: s.sourceCollectionId,
            allocatedPoisha: s.allocatedPoisha,
            heldPoisha: s.heldPoisha,
            completedPoisha: s.completedPoisha,
          })),
          order: facts.order,
          delivery: {
            snapshotChargePoisha: deliveryChargePoisha,
            ...facts.delivery,
            requestedPoisha: input.deliveryChargeRequestedPoisha,
            approvedByPolicy:
              input.deliveryChargeRequestedPoisha === 0 || authorized.deliveryApproved,
          },
        })
        if (plan.status !== 'advisory') throw new ApiError('REFUND_BALANCE_EXCEEDED')
        slices = plan.slices.map((slice) => ({ ...slice, correctionAmountPoisha: 0 }))
      }
      const rows: InstanceType<typeof refunds>[] = []
      for (const slice of slices) {
        const source = facts.sources.find((s) => s.sourceCollectionId === slice.sourceCollectionId)
        if (
          !source ||
          source.verifiedAt > now ||
          source.collectedAt > now ||
          (authorized.method === 'gateway' &&
            (source.provider !== 'sslcommerz' || !source.bankTranId))
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        if (mode === 'approved')
          await funding.reserve(session, {
            orderId: input.orderId,
            sourceCollectionId: slice.sourceCollectionId,
            classification: input.classification,
            amountPoisha: slice.amountPoisha,
            deliveryAmountPoisha: slice.deliveryAmountPoisha,
            deliveryChargePoisha,
          })
        if (!correction && mode === 'approved')
          await units(session, {
            orderId: input.orderId,
            claimId: input.basisRefId,
            items: slice.items.map((i) => ({
              orderItemId: i.orderItemId,
              unitAmounts: i.unitAmounts,
            })),
          })
        const oldIntent = correction
          ? await refunds
              .findOne({
                orderId: input.orderId,
                sourceCollectionId: slice.sourceCollectionId,
                classification: 'payment_correction',
                capacityStatus: 'not_reserved',
                status: 'under_review',
                ...(expected?.review ? { _id: expected.review.refundId } : {}),
              })
              .session(session)
          : null
        const values = {
          refundGroupKey: group,
          method: authorized.method,
          policyVersion: authorized.policyVersion,
          ...(authorized.consentEvidenceRef
            ? { consentEvidenceRef: authorized.consentEvidenceRef }
            : {}),
          status: mode,
          capacityStatus: mode === 'approved' ? ('reserved' as const) : ('not_reserved' as const),
          ...(mode === 'approved'
            ? {
                approvedBy: new Types.ObjectId(actorId),
                approvedAt: now,
                timingSnapshot: {
                  policyVersion: authorized.policyVersion,
                  timezone: 'Asia/Dhaka' as const,
                  targetBusinessDays: 7,
                  status: 'under_review' as const,
                },
              }
            : {}),
          updatedAt: now,
        }
        let row: InstanceType<typeof refunds>
        if (oldIntent) {
          if (
            oldIntent.amountPoisha !== slice.amountPoisha ||
            oldIntent.revision >= Number.MAX_SAFE_INTEGER ||
            oldIntent.createdAt > now
          )
            throw new ApiError('STATE_CONFLICT')
          const changed = await refunds.collection.updateOne(
            {
              _id: oldIntent._id,
              revision: oldIntent.revision,
              status: 'under_review',
              capacityStatus: 'not_reserved',
            },
            { $set: values, $inc: { revision: 1 } },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          row = await refunds.findById(oldIntent._id).session(session).orFail()
        } else {
          row = new refunds({
            ...values,
            orderId: new Types.ObjectId(input.orderId),
            paymentId: new Types.ObjectId(facts.paymentId),
            sourceCollectionId: new Types.ObjectId(slice.sourceCollectionId),
            basis: input.basis,
            ...(input.basisRefId ? { basisRefId: new Types.ObjectId(input.basisRefId) } : {}),
            classification: input.classification,
            items: slice.items.map((i) => ({
              ...i,
              orderItemId: new Types.ObjectId(i.orderItemId),
            })),
            merchandiseAmountPoisha: slice.merchandiseAmountPoisha,
            deliveryAmountPoisha: slice.deliveryAmountPoisha,
            correctionAmountPoisha: slice.correctionAmountPoisha,
            amountPoisha: slice.amountPoisha,
            decisionKey: hash(`${group}:${slice.sourceCollectionId}`),
            revision: 0,
            createdAt: now,
          })
          await row.save({ session, timestamps: false })
        }
        if (mode === 'approved')
          await new attempts({
            refundId: row._id,
            attemptNumber: 1,
            idempotencyKey: hash(`refund-attempt:${row._id}:1`),
            provider: authorized.method === 'gateway' ? 'sslcommerz' : 'manual',
            ...(authorized.method === 'gateway'
              ? {
                  originalBankTranId: source.bankTranId,
                  refundTransId: `szr_${hash(`${row._id}:1`).slice(0, 26)}`,
                }
              : {}),
            amountPoisha: row.amountPoisha,
            status: 'created',
            initiatedAt: now,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }).save({ session, timestamps: false })
        if (mode === 'approved')
          await notify?.(session, {
            refundId: row._id.toHexString(),
            orderId: input.orderId,
            status: 'approved',
            operationKey: hash(`approved:${row._id}`),
            occurredAt: now,
          })
        rows.push(row)
      }
      await audit(session, {
        ...cause,
        actorType,
        actorId,
        afterDigest: digest,
        reason: input.reason,
        occurredAt: now,
      })
      await reviewReceipt(rows)
      return view(rows)
    })
  }
  return {
    reserve(token: string | undefined, raw: unknown, rawKey: unknown, expected?: Expected) {
      return reserveCore(
        raw,
        rawKey,
        expected,
        (work) => admins.owned(token, work),
        'admin',
        'approved',
      )
    },
    async request(
      credentials: PaymentInitiationCredentials,
      rawOrderId: unknown,
      raw: unknown,
      rawKey: unknown,
    ) {
      if (!requests) throw new ApiError('SERVICE_UNAVAILABLE')
      const orderId = parseInput(id, rawOrderId),
        input = parseInput(customerRefundRequestInput, raw),
        key = parseInput(
          z
            .string()
            .min(1)
            .max(128)
            .regex(/^[\x21-\x7e]+$/),
          rawKey,
        ),
        digest = hash(JSON.stringify(input)),
        cause = {
          action: 'refund.request.submit',
          targetType: 'order',
          targetId: orderId,
          operationKey: hash(`customer-refund-request:${orderId}:${key}`),
        }
      return requests.scope
        .owned(
          credentials,
          orderId,
          async (principal, session) => {
            const owner = await requests.ownedOrder(session, orderId)
            if (
              principal.kind === 'customer'
                ? owner.customerId !== principal.userId
                : owner.customerId !== undefined || principal.orderId !== orderId
            )
              throw new ApiError('NOT_FOUND')
            await verifyCorrectionPersistence(connection)
            await verifyRefundAttemptPersistence(connection)
            const actorId = principal.kind === 'customer' ? principal.userId : principal.orderId,
              actorType =
                principal.kind === 'customer' ? ('customer' as const) : ('guest_order' as const),
              prior = await lookup(session, cause)
            if (prior) {
              if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
              return customerRefundRequestResult.parse({
                requestStatus: 'recorded',
                ...(prior.beforeDigest ? { refundGroupKey: prior.beforeDigest } : {}),
              })
            }
            const existing = await refunds
              .find({
                orderId,
                basis: input.basis,
                ...(input.basisRefId ? { basisRefId: input.basisRefId } : {}),
                status: { $ne: 'rejected' },
                capacityStatus: { $ne: 'released' },
              })
              .sort({ createdAt: -1, _id: -1 })
              .limit(51)
              .session(session)
            if (existing.length > 50) throw new ApiError('BUSINESS_RULE_VIOLATION')
            let group = existing[0]?.refundGroupKey
            const record = async () => {
              await audit(session, {
                ...cause,
                actorType,
                actorId,
                afterDigest: digest,
                ...(group ? { beforeDigest: group } : {}),
                reason: input.reason,
                occurredAt: clock(),
              })
              return customerRefundRequestResult.parse({
                requestStatus: 'recorded',
                ...(group ? { refundGroupKey: group } : {}),
              })
            }
            if (input.basis === 'cancellation' || input.basis === 'delivery_exception') {
              if (!input.basisRefId) throw new ApiError('BUSINESS_RULE_VIOLATION')
              await requests.qualifiedClosed(session, orderId, input.basis, input.basisRefId)
              if (!existing.length) throw new ApiError('BUSINESS_RULE_VIOLATION')
              return record()
            }
            if (input.basis === 'payment_correction') {
              if (existing.length) return record()
              const facts = await funding.list(session, orderId, 'payment_correction')
              const eligible = facts.sources.filter(
                (source) => source.allocatedPoisha > source.heldPoisha + source.completedPoisha,
              )
              if (!eligible.length) {
                if (!existing.length) throw new ApiError('BUSINESS_RULE_VIOLATION')
                return record()
              }
              for (const source of eligible) {
                const result = await reserveCore(
                  {
                    orderId,
                    basis: 'payment_correction',
                    classification: 'payment_correction',
                    correctionCollectionId: source.sourceCollectionId,
                    reason: input.reason,
                  },
                  hash(`${key}:${source.sourceCollectionId}`),
                  undefined,
                  (work) => work(actorId, session),
                  actorType,
                  'requested',
                )
                group ??= result.refundGroupKey
              }
              return record()
            }
            if (!input.basisRefId) throw new ApiError('BUSINESS_RULE_VIOLATION')
            const requested = await requests.claimSelection(
                session,
                orderId,
                input.basisRefId,
                input.basis,
              ),
              selected = await claims(session, orderId, input.basisRefId, requested, input.basis),
              snapshot = await order(session, orderId, input.basisRefId, selected)
            const pendingUnits = new Set(
              existing
                .filter(
                  (row) => row.status === 'requested' && row.capacityStatus === 'not_reserved',
                )
                .flatMap((row) =>
                  row.items.flatMap((item) =>
                    item.unitAmounts.map((unit) => `${item.orderItemId}:${unit.ordinal}`),
                  ),
                ),
            )
            const available = snapshot.lines
              .map((line) => ({
                orderItemId: line.orderItemId,
                units: line.units.filter(
                  (unit) =>
                    unit.eligible &&
                    !pendingUnits.has(`${line.orderItemId}:${unit.ordinal}`) &&
                    unit.netEntitlementPoisha > unit.refundHeldPoisha + unit.refundCompletedPoisha,
                ),
              }))
              .filter((line) => line.units.length > 0)
            if (!available.length) {
              if (!existing.length) throw new ApiError('BUSINESS_RULE_VIOLATION')
              return record()
            }
            const result = await reserveCore(
              {
                orderId,
                basis: input.basis,
                basisRefId: input.basisRefId,
                classification: 'merchandise',
                requestedItems: available.map((line) => ({
                  orderItemId: line.orderItemId,
                  quantity: line.units.length,
                })),
                reason: input.reason,
              },
              key,
              { requestUnitDigest: hash(JSON.stringify(available)) },
              (work) => work(actorId, session),
              actorType,
              'requested',
            )
            group = result.refundGroupKey
            return record()
          },
          true,
        )
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.code === 'REFUND_BALANCE_EXCEEDED')
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          throw error
        })
    },
  }
}

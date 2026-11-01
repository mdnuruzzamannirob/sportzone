import { createHash } from 'node:crypto'
import { Types, type Connection, type ClientSession } from 'mongoose'
import { z } from 'zod'
import type {
  cancellationRefundSnapshotAccess,
  refundUnitReservationAccess,
} from '../orders/order.service.js'
import type { refundFundingAccess } from '../payments/payment.service.js'
import { createAuditWriter } from '../audit/audit.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { refundModel } from './refund.model.js'
import { refundAttemptModel } from './refund-attempt.model.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
import { verifyRefundAttemptPersistence } from './refund-attempt.persistence.js'
import { planMultiSourceMerchandiseRefund } from './refund-calculation.service.js'
import { refundApproval, type refundReservationService } from './refund-reservation.service.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const command = z.strictObject({
  orderId: id,
  paymentId: id,
  requestId: id,
  actorId: id,
  reason: z.string().trim().min(1).max(2000),
})
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

// Capability handed only to the current Orders cancellation-decision transaction, never HTTP.
export function cancellationRefundService(
  connection: Connection,
  snapshot: ReturnType<typeof cancellationRefundSnapshotAccess>,
  units: ReturnType<typeof refundUnitReservationAccess>,
  funding: ReturnType<typeof refundFundingAccess>,
  policy?: Parameters<typeof refundReservationService>[6],
  clock: () => Date = () => new Date(),
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection),
    audit = createAuditWriter(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = parseInput(command, raw)
    await verifyCorrectionPersistence(connection)
    await verifyRefundAttemptPersistence(connection)
    const order = await snapshot(session, input.orderId, input.requestId)
    const group = hash(`cancellation:${input.orderId}:${input.requestId}`)
    if (await refunds.exists({ orderId: input.orderId, refundGroupKey: group }).session(session))
      return
    if (!policy) throw new ApiError('SERVICE_UNAVAILABLE')
    const approved = parseInput(
      refundApproval,
      await policy(session, {
        orderId: input.orderId,
        basis: 'cancellation',
        basisRefId: input.requestId,
        actorId: input.actorId,
        deliveryRequestedPoisha: order.deliveryChargePoisha,
      }),
    )
    if (approved.consentRequired && !approved.consentEvidenceRef)
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    const facts = await funding.list(session, input.orderId, 'merchandise')
    if (facts.paymentId !== input.paymentId) throw new ApiError('STATE_CONFLICT')
    const sourceTotal = facts.sources.reduce(
      (sum, s) => sum + BigInt(s.allocatedPoisha - s.heldPoisha - s.completedPoisha),
      0n,
    )
    const orderTotal = BigInt(
      facts.order.allocatedPoisha - facts.order.heldPoisha - facts.order.completedPoisha,
    )
    const amount = Number(sourceTotal < orderTotal ? sourceTotal : orderTotal)
    if (amount <= 0) throw new ApiError('REFUND_BALANCE_EXCEEDED')
    let remaining = amount
    const lines = []
    for (const line of [...order.lines].sort((a, b) =>
      a.orderItemId.localeCompare(b.orderItemId),
    )) {
      const chosen = []
      for (const unit of [...line.units].sort((a, b) => a.ordinal - b.ordinal)) {
        const available =
          unit.netEntitlementPoisha - unit.refundHeldPoisha - unit.refundCompletedPoisha
        if (!unit.eligible || !remaining || available <= 0) continue
        const used = Math.min(remaining, available)
        chosen.push({
          ordinal: unit.ordinal,
          netEntitlementPoisha: used,
          refundHeldPoisha: 0,
          refundCompletedPoisha: 0,
          eligible: true,
        })
        remaining -= used
      }
      if (chosen.length)
        lines.push({ orderItemId: line.orderItemId, quantity: chosen.length, units: chosen })
    }
    if (
      remaining &&
      (!approved.deliveryApproved ||
        remaining >
          order.deliveryChargePoisha - facts.delivery.heldPoisha - facts.delivery.completedPoisha)
    )
      throw new ApiError('REFUND_BALANCE_EXCEEDED')
    const plan = planMultiSourceMerchandiseRefund({
      lines,
      sources: facts.sources.map((s) => ({
        sourceCollectionId: s.sourceCollectionId,
        allocatedPoisha: s.allocatedPoisha,
        heldPoisha: s.heldPoisha,
        completedPoisha: s.completedPoisha,
      })),
      order: facts.order,
      delivery: {
        snapshotChargePoisha: order.deliveryChargePoisha,
        ...facts.delivery,
        requestedPoisha: remaining,
        approvedByPolicy: remaining === 0 || approved.deliveryApproved,
      },
    })
    if (plan.status !== 'advisory' || plan.amountPoisha !== amount)
      throw new ApiError('REFUND_BALANCE_EXCEEDED')
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
    for (const slice of plan.slices) {
      const source = facts.sources.find((s) => s.sourceCollectionId === slice.sourceCollectionId)
      if (
        !source ||
        source.verifiedAt > now ||
        source.collectedAt > now ||
        (approved.method === 'gateway' && (source.provider !== 'sslcommerz' || !source.bankTranId))
      )
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      await funding.reserve(session, {
        orderId: input.orderId,
        sourceCollectionId: slice.sourceCollectionId,
        classification: 'merchandise',
        amountPoisha: slice.amountPoisha,
        deliveryAmountPoisha: slice.deliveryAmountPoisha,
        deliveryChargePoisha: order.deliveryChargePoisha,
      })
      await units(session, {
        orderId: input.orderId,
        cancellationRequestId: input.requestId,
        items: slice.items.map((i) => ({ orderItemId: i.orderItemId, unitAmounts: i.unitAmounts })),
      })
      const row = new refunds({
        orderId: new Types.ObjectId(input.orderId),
        paymentId: new Types.ObjectId(input.paymentId),
        sourceCollectionId: new Types.ObjectId(slice.sourceCollectionId),
        basis: 'cancellation',
        basisRefId: new Types.ObjectId(input.requestId),
        refundGroupKey: group,
        classification: 'merchandise',
        items: slice.items.map((i) => ({ ...i, orderItemId: new Types.ObjectId(i.orderItemId) })),
        merchandiseAmountPoisha: slice.merchandiseAmountPoisha,
        deliveryAmountPoisha: slice.deliveryAmountPoisha,
        correctionAmountPoisha: 0,
        amountPoisha: slice.amountPoisha,
        method: approved.method,
        policyVersion: approved.policyVersion,
        ...(approved.consentEvidenceRef ? { consentEvidenceRef: approved.consentEvidenceRef } : {}),
        approvedBy: new Types.ObjectId(input.actorId),
        approvedAt: now,
        timingSnapshot: {
          policyVersion: approved.policyVersion,
          timezone: 'Asia/Dhaka',
          targetBusinessDays: 7,
          status: 'under_review',
        },
        status: 'approved',
        capacityStatus: 'reserved',
        decisionKey: hash(`${group}:${slice.sourceCollectionId}`),
        revision: 0,
        createdAt: now,
        updatedAt: now,
      })
      await row.save({ session, timestamps: false })
      await new attempts({
        refundId: row._id,
        attemptNumber: 1,
        idempotencyKey: hash(`refund-attempt:${row._id}:1`),
        provider: approved.method === 'gateway' ? 'sslcommerz' : 'manual',
        ...(approved.method === 'gateway'
          ? {
              originalBankTranId: source.bankTranId,
              refundTransId: `szr_${hash(`${row._id}:1`).slice(0, 26)}`,
            }
          : {}),
        status: 'created',
        amountPoisha: row.amountPoisha,
        initiatedAt: now,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      }).save({ session, timestamps: false })
    }
    await audit(session, {
      actorType: 'admin',
      actorId: input.actorId,
      action: 'refund.cancellation.reserve',
      targetType: 'order',
      targetId: input.orderId,
      operationKey: group,
      afterDigest: hash(
        JSON.stringify({ amountPoisha: amount, policyVersion: approved.policyVersion }),
      ),
      reason: input.reason,
      occurredAt: now,
    })
  }
}

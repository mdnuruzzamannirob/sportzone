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

const id = z.string().regex(/^[a-f0-9]{24}$/),
  money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const text = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
const command = z.strictObject({
  orderId: id,
  basis: z.enum(['physical_return', 'shortage', 'payment_correction']),
  basisRefId: id.optional(),
  classification: z.enum(['merchandise', 'payment_correction']),
  requestedItems: z
    .array(z.strictObject({ orderItemId: id, quantity: z.int().min(1).max(50) }))
    .min(1)
    .max(50)
    .optional(),
  deliveryChargeRequestedPoisha: money.default(0),
  correctionCollectionId: id.optional(),
  reason: text,
})
export const refundApproval = z.strictObject({
  policyVersion: z.string().trim().min(1).max(100),
  method: z.enum(['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank']),
  consentRequired: z.boolean(),
  deliveryApproved: z.boolean().default(false),
  consentEvidenceRef: z.string().trim().min(1).max(256).optional(),
})
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
  return {
    async reserve(token: string | undefined, raw: unknown, rawKey: unknown) {
      const input = parseInput(command, raw)
      const key = parseInput(
        z
          .string()
          .min(1)
          .max(128)
          .refine(
            (v) =>
              v === v.trim() &&
              [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
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
      const group = hash(JSON.stringify(natural)),
        digest = hash(JSON.stringify(normalized))
      return admins.owned(token, async (actorId, session) => {
        await verifyCorrectionPersistence(connection)
        await verifyRefundAttemptPersistence(connection)
        const cause = {
          action: 'refund.group.reserve',
          targetType: 'order',
          targetId: input.orderId,
          operationKey: hash(`refund-group:${actorId}:${input.orderId}:${key}`),
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
              actorType: 'admin',
              actorId,
              afterDigest: digest,
              reason: input.reason,
              occurredAt: clock(),
            })
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
        if (authorized.consentRequired && !authorized.consentEvidenceRef)
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        const now = clock()
        if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
        const facts = await funding.list(session, input.orderId, input.classification)
        if (!facts.sources.length) throw new ApiError('REFUND_BALANCE_EXCEEDED')
        let deliveryChargePoisha = 0
        let slices: Slice[]
        if (correction) {
          const source = facts.sources.find(
            (s) => s.sourceCollectionId === input.correctionCollectionId,
          )
          if (!source) throw new ApiError('NOT_FOUND')
          const amount = source.allocatedPoisha - source.heldPoisha - source.completedPoisha
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
          deliveryChargePoisha = snapshot.deliveryChargePoisha
          if (
            BigInt(facts.delivery.heldPoisha) +
              BigInt(facts.delivery.completedPoisha) +
              BigInt(input.deliveryChargeRequestedPoisha) >
            BigInt(deliveryChargePoisha)
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
          const source = facts.sources.find(
            (s) => s.sourceCollectionId === slice.sourceCollectionId,
          )
          if (
            !source ||
            source.verifiedAt > now ||
            source.collectedAt > now ||
            (authorized.method === 'gateway' &&
              (source.provider !== 'sslcommerz' || !source.bankTranId))
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          await funding.reserve(session, {
            orderId: input.orderId,
            sourceCollectionId: slice.sourceCollectionId,
            classification: input.classification,
            amountPoisha: slice.amountPoisha,
            deliveryAmountPoisha: slice.deliveryAmountPoisha,
            deliveryChargePoisha,
          })
          if (!correction)
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
            status: 'approved' as const,
            capacityStatus: 'reserved' as const,
            approvedBy: new Types.ObjectId(actorId),
            approvedAt: now,
            timingSnapshot: {
              policyVersion: authorized.policyVersion,
              timezone: 'Asia/Dhaka',
              targetBusinessDays: 7,
              status: 'under_review',
            },
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
          rows.push(row)
        }
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        return view(rows)
      })
    },
  }
}

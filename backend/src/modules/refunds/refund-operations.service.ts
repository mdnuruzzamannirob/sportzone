import { refundStatusTimelineAccess } from '../audit/audit.service.js'
import type { refundRecoveryService } from './refund-recovery.service.js'
import { createHash } from 'node:crypto'
import type { Connection, ClientSession } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { refundFundingAccess } from '../payments/payment.service.js'
import type { refundReservationService } from './refund-reservation.service.js'
import type { refundDispatchService } from './refund-dispatch.service.js'
import { refundModel } from './refund.model.js'
import { refundAttemptModel } from './refund-attempt.model.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
import { verifyRefundAttemptPersistence } from './refund-attempt.persistence.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { paginationSchema, pageMeta } from '../../shared/pagination.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const status = z.enum([
  'requested',
  'under_review',
  'approved',
  'processing',
  'completed',
  'failed',
  'rejected',
])
const query = paginationSchema.safeExtend({
  status: status.optional(),
  classification: z.enum(['merchandise', 'payment_correction']).optional(),
  sourceCollectionId: id.optional(),
})
export function refundOperationsService(
  connection: Connection,
  admins: AdminAccountAccess,
  funding: ReturnType<typeof refundFundingAccess>,
  reservation: ReturnType<typeof refundReservationService>,
  dispatch?: ReturnType<typeof refundDispatchService>,
  recovery?: ReturnType<typeof refundRecoveryService>,
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection),
    timeline = refundStatusTimelineAccess(connection)
  async function ready() {
    try {
      await verifyCorrectionPersistence(connection)
      await verifyRefundAttemptPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  function view(row: InstanceType<typeof refunds>) {
    return {
      id: row._id.toHexString(),
      orderId: row.orderId.toHexString(),
      classification: row.classification,
      basis: row.basis,
      ...(row.basisRefId ? { basisRefId: row.basisRefId.toHexString() } : {}),
      ...(row.refundGroupKey ? { refundGroupKey: row.refundGroupKey } : {}),
      sourceCollectionId: row.sourceCollectionId.toHexString(),
      amountPoisha: row.amountPoisha,
      merchandiseAmountPoisha: row.merchandiseAmountPoisha,
      deliveryAmountPoisha: row.deliveryAmountPoisha,
      correctionAmountPoisha: row.correctionAmountPoisha,
      status: row.status,
      capacityStatus: row.capacityStatus,
      ...(row.method ? { method: row.method } : {}),
      ...(row.policyVersion ? { policyVersion: row.policyVersion } : {}),
      ...(row.approvedAt ? { approvedAt: row.approvedAt.toISOString() } : {}),
      ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
      items: row.items.map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        amountPoisha: item.amountPoisha,
      })),
      requestedAt: row.createdAt.toISOString(),
      timeline: [
        ...(row.approvedAt ? [{ status: 'approved', at: row.approvedAt.toISOString() }] : []),
        ...(row.completedAt ? [{ status: 'completed', at: row.completedAt.toISOString() }] : []),
        ...(!['approved', 'completed'].includes(row.status)
          ? [{ status: row.status, at: row.updatedAt.toISOString() }]
          : []),
      ].sort((a, b) => a.at.localeCompare(b.at)),
      timing: {
        status: row.approvedAt
          ? (row.timingSnapshot?.status ?? 'under_review')
          : 'awaiting_approval',
        targetBusinessDays: 7,
        timezone: 'Asia/Dhaka',
        ...(row.policyVersion ? { policyVersion: row.policyVersion } : {}),
        ...(row.timingSnapshot?.calendarVersion
          ? { calendarVersion: row.timingSnapshot.calendarVersion }
          : {}),
        ...(row.timingSnapshot?.targetAt
          ? { targetAt: row.timingSnapshot.targetAt.toISOString() }
          : {}),
      },
    }
  }
  async function historyView(session: ClientSession, row: InstanceType<typeof refunds>) {
    const current = view(row),
      events = await timeline(session, row._id.toHexString())
    const all = [...current.timeline, ...events],
      seen = new Set<string>()
    return {
      ...current,
      timeline: all
        .sort((a, b) => a.at.localeCompare(b.at))
        .filter((e) => {
          const key = `${e.status}:${e.at}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(-40),
    }
  }
  async function detail(session: ClientSession, refundId: string) {
    const row = await refunds.findById(refundId).session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    const facts = await funding.list(session, row.orderId.toHexString(), row.classification)
    const source = facts.sources.find(
      (s) => s.sourceCollectionId === row.sourceCollectionId.toHexString(),
    )
    if (!source) throw new ApiError('SERVICE_UNAVAILABLE')
    const history = await attempts
      .find({ refundId: row._id })
      .sort({ attemptNumber: -1 })
      .limit(50)
      .session(session)
    return {
      ...(await historyView(session, row)),
      sourceCapacity: {
        allocatedPoisha: source.allocatedPoisha,
        heldPoisha: source.heldPoisha,
        completedPoisha: source.completedPoisha,
      },
      orderCapacity: facts.order,
      attempts: history.map((attempt) => ({
        id: attempt._id.toHexString(),
        attemptNumber: attempt.attemptNumber,
        provider: attempt.provider,
        state: attempt.status,
        amountPoisha: attempt.amountPoisha,
        initiatedAt: attempt.initiatedAt.toISOString(),
        ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
        ...(attempt.refundTransId ? { refundTransId: attempt.refundTransId } : {}),
        ...(attempt.refundRefId ? { refundRefId: attempt.refundRefId } : {}),
        ...(attempt.lastCheckedAt ? { lastCheckedAt: attempt.lastCheckedAt.toISOString() } : {}),
      })),
    }
  }
  return {
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(query, raw)
      return admins.owned(
        token,
        async (_actor, session) => {
          await ready()
          const filter = {
            ...(input.status ? { status: input.status } : {}),
            ...(input.classification ? { classification: input.classification } : {}),
            ...(input.sourceCollectionId ? { sourceCollectionId: input.sourceCollectionId } : {}),
          }
          const rows = await refunds
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          const items = []
          for (const row of rows) items.push(await historyView(session, row))
          return {
            items,
            pagination: pageMeta(input, await refunds.countDocuments(filter).session(session)),
          }
        },
        false,
      )
    },
    async detail(token: string | undefined, rawId: unknown) {
      const refundId = parseInput(id, rawId)
      return admins.owned(
        token,
        async (_actor, session) => {
          await ready()
          return detail(session, refundId)
        },
        false,
      )
    },
    async group(token: string | undefined, raw: unknown, key: unknown) {
      await admins.owned(token, async () => ready(), false)
      const group = await reservation.reserve(token, raw, key)
      return admins.owned(
        token,
        async (_actor, session) => {
          const rows = []
          for (const row of group.refunds) rows.push(await detail(session, row.id))
          const states = new Set(rows.map((r) => r.status))
          return {
            refundGroupKey: group.refundGroupKey,
            refunds: rows,
            status: states.size === 1 ? rows[0]?.status : 'processing',
          }
        },
        false,
      )
    },
    async reconcile(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      if (!recovery) throw new ApiError('SERVICE_UNAVAILABLE')
      const input = parseInput(z.strictObject({ reason: z.string().trim().min(1).max(2000) }), raw)
      return recovery.reconcile(
        token,
        parseInput(id, rawId),
        input.reason,
        parseInput(z.string().min(1).max(128), key),
      )
    },
    async confirmManual(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      if (!recovery) throw new ApiError('SERVICE_UNAVAILABLE')
      await recovery.confirmManual(
        token,
        parseInput(id, rawId),
        raw,
        parseInput(z.string().min(1).max(128), key),
      )
      return this.detail(token, rawId)
    },
    async review(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      if (!recovery) throw new ApiError('SERVICE_UNAVAILABLE')
      const input = parseInput(
          z.strictObject({
            decision: z.enum(['approve', 'reject']),
            reason: z.string().trim().min(1).max(2000),
            method: z
              .enum(['gateway', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank'])
              .optional(),
            consentEvidenceRef: z.string().min(1).max(256).optional(),
          }),
          raw,
        ),
        refundId = parseInput(id, rawId),
        commandKey = parseInput(z.string().min(1).max(128), key)
      if (input.decision === 'reject')
        await recovery.reject(token, refundId, input.reason, commandKey)
      else {
        const current = await this.detail(token, refundId)
        if (current.status === 'under_review' && current.classification === 'payment_correction')
          await reservation.reserve(
            token,
            {
              orderId: current.orderId,
              basis: 'payment_correction',
              classification: 'payment_correction',
              correctionCollectionId: current.sourceCollectionId,
              reason: input.reason,
            },
            createHash('sha256').update(`review:${refundId}:${commandKey}`).digest('hex'),
            {
              review: {
                refundId,
                key: commandKey,
                digest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
              },
              ...(input.method ? { method: input.method } : {}),
              ...(input.consentEvidenceRef ? { consentEvidenceRef: input.consentEvidenceRef } : {}),
            },
          )
        else await recovery.approve(token, refundId, input, commandKey)
      }
      return this.detail(token, refundId)
    },
    async payout(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      await admins.owned(token, async () => ready(), false)
      const input = parseInput(
        z.strictObject({
          method: z.enum([
            'gateway',
            'manual_bkash',
            'manual_nagad',
            'manual_rocket',
            'manual_bank',
          ]),
          reason: z.string().trim().min(1).max(2000),
        }),
        raw,
      )
      if (input.method === 'gateway' && !dispatch) throw new ApiError('SERVICE_UNAVAILABLE')
      if (recovery)
        await recovery.prepare(
          token,
          parseInput(id, rawId),
          input,
          parseInput(z.string().min(1).max(128), key),
        )
      else if (input.method !== 'gateway') throw new ApiError('SERVICE_UNAVAILABLE')
      if (input.method === 'gateway') return dispatch?.dispatch(token, rawId, input, key)
      return { attemptId: (await this.detail(token, rawId)).attempts[0]?.id, state: 'submitted' }
    },
  }
}

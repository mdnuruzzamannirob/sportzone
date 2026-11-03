import { createHash } from 'node:crypto'
import type { ClientSession, Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import type { RefundStatusTimeline } from '../audit/audit.public.js'

import type { AdminAccountAccess } from '../auth/auth.public.js'
import type { RefundFundingAccess } from '../payments/payment.public.js'

import type { createRefundReservationService } from './obligations/refund-reservation.service.js'
import { refundAttemptModel } from './payouts/refund-attempt.model.js'
import { verifyRefundAttemptPersistence } from './payouts/refund-attempt.persistence.js'
import type { createRefundDispatchService } from './payouts/refund-dispatch.service.js'
import type { createRefundRecoveryService } from './payouts/refund-recovery.service.js'
import { refundModel } from './refund.model.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
import {
  refundAdminQuery as query,
  refundAdminDetail,
  refundAdminView,
  refundPayoutInput,
  refundReasonInput,
  refundReviewInput,
} from './refund-api.schema.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)

function createRefundOperationsService(
  connection: Connection,
  admins: AdminAccountAccess,
  funding: RefundFundingAccess,
  reservation: ReturnType<typeof createRefundReservationService>,
  moduleAccess: { refundStatusTimelineAccess: RefundStatusTimeline },
  dispatch?: ReturnType<typeof createRefundDispatchService>,
  recovery?: ReturnType<typeof createRefundRecoveryService>,
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection),
    timeline = moduleAccess.refundStatusTimelineAccess
  async function ready() {
    try {
      await verifyCorrectionPersistence(connection)
      await verifyRefundAttemptPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  function view(row: InstanceType<typeof refunds>) {
    return refundAdminView.parse({
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
    })
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
    return refundAdminDetail.parse({
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
    })
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
      const input = parseInput(refundReasonInput, raw)
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
      const input = parseInput(refundReviewInput, raw),
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
      const input = parseInput(refundPayoutInput, raw)
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

export { createRefundOperationsService }

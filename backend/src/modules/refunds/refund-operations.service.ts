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
) {
  const refunds = refundModel(connection),
    attempts = refundAttemptModel(connection)
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
      ...view(row),
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
          return {
            items: rows.map(view),
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
    async payout(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      await admins.owned(token, async () => ready(), false)
      if (!dispatch) throw new ApiError('SERVICE_UNAVAILABLE')
      return dispatch.dispatch(token, rawId, raw, key)
    },
  }
}

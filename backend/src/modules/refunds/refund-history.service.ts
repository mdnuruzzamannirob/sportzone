import type { Connection, ClientSession } from 'mongoose'
import { z } from 'zod'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
} from '../auth/checkout-access.service.js'
import type { complaintOrderAccess, customerOrderHistoryAccess } from '../orders/order.service.js'
import { refundStatusTimelineAccess } from '../audit/audit.service.js'
import { refundModel } from './refund.model.js'
import { refundAttemptModel } from './refund-attempt.model.js'
import { verifyRefundAttemptPersistence } from './refund-attempt.persistence.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta, paginationSchema } from '../../shared/pagination.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const query = paginationSchema.safeExtend({
  status: z
    .enum([
      'requested',
      'under_review',
      'approved',
      'processing',
      'completed',
      'failed',
      'rejected',
    ])
    .optional(),
  classification: z.enum(['merchandise', 'payment_correction']).optional(),
})
export function refundHistoryService(
  connection: Connection,
  scope: ReturnType<typeof orderScopeAccess>,
  order: ReturnType<typeof complaintOrderAccess>,
  customerOrders: ReturnType<typeof customerOrderHistoryAccess>,
) {
  const model = refundModel(connection),
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
  async function view(session: ClientSession, row: InstanceType<typeof model>) {
    const latestAttempt = await attempts
      .findOne({ refundId: row._id })
      .sort({ attemptNumber: -1 })
      .select('status failureCode')
      .session(session)
    const investigationStatus =
      row.status === 'under_review' ||
      (row.status === 'processing' &&
        latestAttempt?.status === 'uncertain' &&
        latestAttempt.failureCode === 'INVESTIGATION_REQUIRED')
        ? 'under_review'
        : 'none'
    const events = [
      { status: 'requested', at: row.createdAt.toISOString() },
      ...(row.approvedAt ? [{ status: 'approved', at: row.approvedAt.toISOString() }] : []),
      ...(row.completedAt ? [{ status: 'completed', at: row.completedAt.toISOString() }] : []),
      ...(!['requested', 'approved', 'completed'].includes(row.status)
        ? [{ status: row.status, at: row.updatedAt.toISOString() }]
        : []),
      ...(await timeline(session, row._id.toHexString())),
    ]
    const seen = new Set<string>()
    // An allowlist deliberately excludes consent, actors, destinations, evidence and provider references.
    return {
      id: row._id.toHexString(),
      orderId: row.orderId.toHexString(),
      sourceCollectionId: row.sourceCollectionId.toHexString(),
      ...(row.refundGroupKey ? { refundGroupKey: row.refundGroupKey } : {}),
      classification: row.classification,
      basis: row.basis,
      amountPoisha: row.amountPoisha,
      ...(row.method ? { method: row.method } : {}),
      status: row.status,
      capacityStatus: row.capacityStatus,
      investigationStatus,
      requestedAt: row.createdAt.toISOString(),
      ...(row.approvedAt ? { approvedAt: row.approvedAt.toISOString() } : {}),
      ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
      items: row.items.map((item) => ({
        orderItemId: item.orderItemId.toHexString(),
        amountPoisha: item.amountPoisha,
      })),
      timing: {
        status: row.approvedAt
          ? (row.timingSnapshot?.status ?? 'under_review')
          : 'awaiting_approval',
        targetBusinessDays: row.timingSnapshot?.targetBusinessDays ?? 7,
        timezone: 'Asia/Dhaka',
        ...(row.policyVersion ? { policyVersion: row.policyVersion } : {}),
        ...(row.timingSnapshot?.calendarVersion
          ? { calendarVersion: row.timingSnapshot.calendarVersion }
          : {}),
        ...(row.timingSnapshot?.targetAt
          ? { targetAt: row.timingSnapshot.targetAt.toISOString() }
          : {}),
      },
      timeline: events
        .sort((a, b) => a.at.localeCompare(b.at))
        .filter((event) => {
          const key = `${event.status}:${event.at}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(-40),
    }
  }
  return {
    async mine(credentials: PaymentInitiationCredentials, raw: unknown) {
      if (!credentials.customerPresent) throw new ApiError('AUTH_REQUIRED')
      const input = parseInput(query, raw)
      return scope.ownedAny(credentials, async (principal, session) => {
        if (principal.kind !== 'customer') throw new ApiError('AUTH_REQUIRED')
        await ready()
        const filter = {
          orderId: { $in: await customerOrders(session, principal.userId) },
          ...(input.status ? { status: input.status } : {}),
          ...(input.classification ? { classification: input.classification } : {}),
        }
        const rows = await model
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((input.page - 1) * input.pageSize)
          .limit(input.pageSize)
          .session(session)
        const items = []
        for (const row of rows) items.push(await view(session, row))
        return {
          items,
          pagination: pageMeta(input, await model.countDocuments(filter).session(session)),
        }
      })
    },
    async list(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const orderId = parseInput(id, rawId)
      return scope.owned(credentials, orderId, async (principal, session) => {
        await order(session, orderId, principal)
        await ready()
        const rows = await model.find({ orderId }).sort({ createdAt: -1, _id: -1 }).session(session)
        const refunds = []
        for (const row of rows) refunds.push(await view(session, row))
        const summary = (classification: 'merchandise' | 'payment_correction') => {
          let heldPoisha = 0,
            completedPoisha = 0
          for (const row of rows.filter((row) => row.classification === classification)) {
            if (row.capacityStatus === 'reserved') heldPoisha += row.amountPoisha
            if (row.capacityStatus === 'completed') completedPoisha += row.amountPoisha
          }
          if (!Number.isSafeInteger(heldPoisha) || !Number.isSafeInteger(completedPoisha))
            throw new ApiError('SERVICE_UNAVAILABLE')
          return { heldPoisha, completedPoisha }
        }
        return {
          refunds,
          merchandiseSummary: summary('merchandise'),
          correctionSummary: summary('payment_correction'),
        }
      })
    },
    async detail(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const refundId = parseInput(id, rawId)
      return scope.ownedAny(credentials, async (principal, session) => {
        await ready()
        const row = await model.findById(refundId).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        await order(session, row.orderId.toHexString(), principal)
        return view(session, row)
      })
    },
  }
}

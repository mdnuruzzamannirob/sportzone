import type { ClientSession } from 'mongoose'
import type { AuditAccess } from '../audit/audit.public.js'

interface RefundRecovery {
  due(
    cursor?: string,
    limit?: number,
    pollMs?: number,
  ): Promise<{ cursor: string; refundId: string }[]>
  scheduled(
    refundId: string,
    fence: (session: ClientSession) => Promise<void>,
  ): Promise<{
    status:
      | 'requested'
      | 'approved'
      | 'under_review'
      | 'processing'
      | 'completed'
      | 'failed'
      | 'rejected'
  }>
  defer(refundId: string, fence: (session: ClientSession) => Promise<void>): Promise<void>
}

type RefundNotifier = (
  session: ClientSession,
  input: {
    refundId: string
    orderId: string
    status: 'approved' | 'processing' | 'completed' | 'failed' | 'rejected'
    operationKey: string
    occurredAt: Date
  },
) => Promise<void>

type RefundReportAccess = (
  session: ClientSession,
  period: { from: Date; to: Date; asOf: Date },
) => Promise<{
  completedRefunds: {
    id: string
    classification: 'merchandise' | 'payment_correction'
    amountPoisha: number
    completedAt: string
  }[]
  pendingRefundLiabilityPoisha: number
}>

type CorrectionObligationFactory = (auditAccess: AuditAccess) => {
  create(session: ClientSession, raw: unknown): Promise<string>
}

type CorrectionMonitor = (
  session: ClientSession,
  paymentId: string,
  offset: number,
  limit: number,
) => Promise<{
  total: number
  items: {
    id: string
    sourceCollectionId: string
    amountPoisha: number
    status:
      | 'under_review'
      | 'processing'
      | 'failed'
      | 'approved'
      | 'rejected'
      | 'completed'
      | 'requested'
    capacityStatus: 'reserved' | 'released' | 'completed' | 'not_reserved'
  }[]
}>

export type {
  CorrectionMonitor,
  CorrectionObligationFactory,
  RefundNotifier,
  RefundRecovery,
  RefundReportAccess,
}

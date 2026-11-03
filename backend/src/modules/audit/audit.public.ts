import type { ClientSession } from 'mongoose'

type AuditWriter = (session: ClientSession, event: unknown) => Promise<void>

type AuditOperationReader = (
  session: ClientSession,
  identity: unknown,
) => Promise<
  | {
      afterDigest?: string | null | undefined
      occurredAt: Date
      beforeDigest?: string
    }
  | undefined
>

interface AuditAccess {
  write: AuditWriter
  replay: AuditWriter
  lookup: AuditOperationReader
}

type PaymentAuditReader = (
  session: ClientSession,
  paymentId: string,
  offset: number,
  limit: number,
) => Promise<{
  total: number
  items: {
    id: string
    action: string
    occurredAt: string
    actorType: 'customer' | 'system' | 'admin' | 'guest_order'
  }[]
}>

type RefundStatusTimeline = (
  session: ClientSession,
  refundId: string,
) => Promise<{ status: string; at: string }[]>

type ReconciliationSchedule = () => Promise<{ paymentId: string; requestedAt: Date }[]>

export type {
  AuditAccess,
  AuditOperationReader,
  AuditWriter,
  PaymentAuditReader,
  ReconciliationSchedule,
  RefundStatusTimeline,
}

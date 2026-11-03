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

export type { AuditAccess, AuditOperationReader, AuditWriter }

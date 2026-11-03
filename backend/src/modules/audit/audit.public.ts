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

export type { AuditWriter, AuditOperationReader }

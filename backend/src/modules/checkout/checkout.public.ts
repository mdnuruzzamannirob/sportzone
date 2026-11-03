import type { ClientSession } from 'mongoose'

interface ReservationExpiry {
  due(
    now: Date,
    limit: number,
    cursor?: string,
  ): Promise<
    {
      cursor: string
      orderId: string
      generation: number
    }[]
  >
  expire(session: ClientSession, orderId: string, generation: number): Promise<boolean>
}

type OrderPolicySnapshotAccess = (
  session: ClientSession,
  input: { orderId: string; quoteId: string; commercialDigest: string },
) => Promise<
  {
    type: 'shipping' | 'cancellation' | 'returns' | 'refunds' | 'privacy' | 'terms' | 'complaints'
    version: string
    effectiveAt: string
  }[]
>

export type { OrderPolicySnapshotAccess, ReservationExpiry }

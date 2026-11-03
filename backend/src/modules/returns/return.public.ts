import type { ClientSession } from 'mongoose'

type RefundClaimSnapshotAccess = (
  session: ClientSession,
  orderId: string,
  claimId: string,
  requested: { orderItemId: string; quantity: number }[],
  expectedType?: 'physical_return' | 'shortage' | undefined,
) => Promise<{ ordinals: number[]; orderItemId: string; quantity: number }[]>

export type { RefundClaimSnapshotAccess }

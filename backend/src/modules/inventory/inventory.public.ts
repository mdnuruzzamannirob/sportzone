import type { ClientSession } from 'mongoose'

type RecoveryReceiptService = (session: ClientSession, raw: unknown) => Promise<void>

type ReturnReceiptService = (session: ClientSession, raw: unknown) => Promise<void>

type InventoryAllocationFactory = (clock?: () => Date) => {
  due(
    now: Date,
    limit: number,
    cursor?: string | undefined,
  ): Promise<{ cursor: string; orderId: string; generation: number }[]>
  available(session: ClientSession, variantId: string): Promise<number>
  latestGeneration(session: ClientSession, orderId: string): Promise<number | undefined>
  generation(
    session: ClientSession,
    orderId: string,
    generation: number,
  ): Promise<InventoryAllocationRecord[]>
  reserve: (
    session: ClientSession,
    input: unknown,
    heldAt: Date,
  ) => Promise<InventoryAllocationRecord>
  commitCod: (session: ClientSession, input: unknown) => Promise<InventoryAllocationRecord>
  commit: (session: ClientSession, input: unknown) => Promise<InventoryAllocationRecord>
  release(
    session: ClientSession,
    input: unknown,
    expectedStatus: 'committed' | 'held',
  ): Promise<InventoryAllocationRecord>
  ship: (session: ClientSession, input: unknown) => Promise<InventoryAllocationRecord>
}

type InventoryAllocationRecord = {
  id: string
  orderId: string
  variantId: string
  quantity: number
  generation: number
  status: 'committed' | 'held' | 'released' | 'shipped'
  heldAt: Date | null | undefined
  expiresAt: Date | null | undefined
  committedAt: Date | null | undefined
  releasedAt: Date | null | undefined
  shippedAt: Date | null | undefined
}

export type {
  InventoryAllocationFactory,
  InventoryAllocationRecord,
  RecoveryReceiptService,
  ReturnReceiptService,
}

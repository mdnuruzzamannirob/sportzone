import type { ClientSession } from 'mongoose'

type RecoveryReceiptService = (session: ClientSession, raw: unknown) => Promise<void>

type ReturnReceiptService = (session: ClientSession, raw: unknown) => Promise<void>

export type { RecoveryReceiptService, ReturnReceiptService }

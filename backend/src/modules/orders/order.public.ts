import type { ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { exceptionResolution } from './delivery-exception.schema.js'

interface DeliveryDispositionInput {
  orderId: string
  exceptionId: string
  shippedAt: Date
  disposition: NonNullable<z.output<typeof exceptionResolution>['disposition']>
}

type DeliveryDispositionVerifier = (
  session: ClientSession,
  input: DeliveryDispositionInput,
) => Promise<unknown>

export type { DeliveryDispositionInput, DeliveryDispositionVerifier }

interface GuestOrderAccess {
  verifyPersistence(): Promise<void>
  lookup(
    session: ClientSession,
    orderNumber: string,
    email: string,
  ): Promise<{ id: string; email: string; revision: number } | null>
  issue(session: ClientSession, orderId: string, expectedRevision: number): Promise<number>
  verify(
    session: ClientSession | undefined,
    orderId: string,
    revision?: number,
    email?: string,
  ): Promise<boolean>
  consume(
    session: ClientSession,
    orderId: string,
    revision: number,
    email: string,
  ): Promise<boolean>
}

export type { GuestOrderAccess }

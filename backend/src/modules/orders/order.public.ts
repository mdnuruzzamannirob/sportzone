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

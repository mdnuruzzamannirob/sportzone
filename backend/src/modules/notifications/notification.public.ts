import type { ClientSession } from 'mongoose'

interface IdentityProofIntent {
  id: string
  challengeId: string
  userId: string
  email: string
}

interface IdentityNotifications {
  verifyIndexes(): Promise<void>
  enqueue(
    input: {
      userId: string
      email: string
      name: string
    },
    session: ClientSession,
  ): Promise<void>
  enqueuePasswordReset(
    input: IdentityProofIntent,
    session: ClientSession,
    kind?: 'customer' | 'admin',
  ): Promise<void>
  enqueueEmailVerification(input: IdentityProofIntent, session: ClientSession): Promise<void>
  enqueueEmailChange(input: IdentityProofIntent, session: ClientSession): Promise<void>
  enqueueGuestAccess(
    input: {
      id: string
      challengeId: string
      orderId: string
      email: string
    },
    session: ClientSession,
  ): Promise<void>
}

type DeliveryOutcome =
  | {
      kind: 'accepted'
      providerMessageId: string
    }
  | {
      kind: 'rejected'
      retryable: boolean
      code: 'PROVIDER_RATE_LIMIT' | 'PROVIDER_REJECTED' | 'PROOF_UNAVAILABLE'
    }
  | {
      kind: 'uncertain'
      code: 'PROVIDER_UNCERTAIN'
    }

type EmailMessage = {
  to: string
  subject: string
  text: string
  idempotencyKey: string
}

type EmailAdapter = {
  send(message: EmailMessage): Promise<DeliveryOutcome>
}

type NotificationIntentsFactory = (clock?: () => Date) => {
  enqueueOrderReceived: (
    rawInput: { orderId: string; userId?: string; email: string; name: string },
    session: ClientSession,
  ) => Promise<void>
  enqueueCommerce: (
    rawInput: {
      orderId: string
      userId?: string
      email: string
      name: string
      eventType:
        | 'order_confirmation'
        | 'order_cancellation'
        | 'shipment_update'
        | 'delivery_completion'
      operationKey: string
      occurredAt: Date
    },
    session: ClientSession,
  ) => Promise<void>
  enqueuePayment: (
    rawInput: {
      event: 'success' | 'failure' | 'pending'
      cause: string
      orderId: string
      userId?: string
      email: string
      name: string
      paymentId: string
      attemptId: string
      intakeId?: string
      orderNumber: string
      amountPoisha: number
    },
    session: ClientSession,
  ) => Promise<void>
}

export type {
  DeliveryOutcome,
  EmailAdapter,
  EmailMessage,
  IdentityNotifications,
  NotificationIntentsFactory,
}

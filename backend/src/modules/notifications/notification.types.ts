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

export type { DeliveryOutcome, EmailMessage, EmailAdapter }

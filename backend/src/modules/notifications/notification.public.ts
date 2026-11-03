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

export type { IdentityNotifications }

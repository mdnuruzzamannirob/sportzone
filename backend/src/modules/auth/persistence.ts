import type { ClientSession, Connection, Types } from 'mongoose'
import { inTransaction } from '../../db/transaction.js'
import type { IdentityModels } from './models.js'

type UserPurpose = 'email_verify' | 'email_change' | 'password_reset'
export class ChallengeUnavailableError extends Error {
  constructor() {
    super('Challenge is unavailable.')
  }
}
// Internal digests only: caller verifies proof provenance and supplies its route-selected role.
// The effect callback is sequential DB-only and may run again on transaction retry.
export async function consumeUserChallenge<T>(
  connection: Connection,
  models: IdentityModels,
  input: {
    secretHash: string
    purpose: UserPurpose
    userId: Types.ObjectId
    role: 'customer' | 'admin'
    maxAttempts: number
  },
  effect: (context: {
    session: ClientSession
    userId: Types.ObjectId
    challengeId: Types.ObjectId
  }) => Promise<T>,
  clock: () => Date = () => new Date(),
) {
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1)
    throw new ChallengeUnavailableError()
  return inTransaction(connection, async (session) => {
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ChallengeUnavailableError()
    const challenge = await models.challenges
      .findOne({
        secretHash: input.secretHash,
        purpose: input.purpose,
        userId: input.userId,
        expiresAt: { $gt: now },
        consumedAt: { $exists: false },
        invalidatedAt: { $exists: false },
        attemptCount: { $lt: input.maxAttempts },
      })
      .select('+scopeRevisionAtIssue')
      .session(session)
    if (!challenge) throw new ChallengeUnavailableError()
    const key = `challengeRevisions.${input.purpose}`
    const changed = await models.users.updateOne(
      {
        _id: input.userId,
        role: input.role,
        status: 'active',
        [key]: challenge.scopeRevisionAtIssue,
      },
      { $inc: { [key]: 1 } },
      { session },
    )
    if (changed.modifiedCount !== 1) throw new ChallengeUnavailableError()
    const consumedAt = clock()
    if (!Number.isFinite(consumedAt.getTime())) throw new ChallengeUnavailableError()
    const consumed = await models.challenges.updateOne(
      {
        _id: challenge._id,
        consumedAt: { $exists: false },
        invalidatedAt: { $exists: false },
        expiresAt: { $gt: consumedAt },
      },
      { $set: { consumedAt }, $unset: { deliveryEnvelope: 1 } },
      { session },
    )
    if (consumed.modifiedCount !== 1) throw new ChallengeUnavailableError()
    return effect({ session, userId: input.userId, challengeId: challenge._id })
  })
}

// Credential lookup primitives, not cookie authentication or permission grants.
export async function findActiveUserSession(
  models: IdentityModels,
  input: {
    tokenHash: string
    kind: 'customer' | 'admin'
    now: Date
  },
) {
  if (!Number.isFinite(input.now.getTime())) return null
  const session = await models.sessions
    .findOne({
      tokenHash: input.tokenHash,
      kind: input.kind,
      expiresAt: { $gt: input.now },
      revokedAt: { $exists: false },
    })
    .select('+securityRevisionAtIssue +csrfSecretHash')
  if (!session?.userId || typeof session.securityRevisionAtIssue !== 'number') return null
  const user = await models.users.exists({
    _id: session.userId,
    role: input.kind,
    status: 'active',
    securityRevision: session.securityRevisionAtIssue,
  })
  return user ? session : null
}

export async function findActiveBrowserContext(
  models: IdentityModels,
  input: {
    contextTokenHash: string
    audience: 'storefront' | 'admin'
    now: Date
  },
) {
  if (!Number.isFinite(input.now.getTime())) return null
  return models.contexts.findOne({
    contextTokenHash: input.contextTokenHash,
    audience: input.audience,
    expiresAt: { $gt: input.now },
    rotatedAt: { $exists: false },
  })
}

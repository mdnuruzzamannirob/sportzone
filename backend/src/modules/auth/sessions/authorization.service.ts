import type { ClientSession } from 'mongoose'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { IdentityModels } from '../auth.model.js'
import type { SessionIdentity, SessionKind } from './session.service.js'

// Service boundary: route guards are never proof that a later mutation is authorized.
export async function authorizeAccount(
  models: IdentityModels,
  identity: SessionIdentity,
  kind: SessionKind,
  transaction: ClientSession,
  now: Date,
  fence = true,
) {
  if (!transaction.inTransaction() || identity.kind !== kind || !Number.isFinite(now.getTime()))
    throw new ApiError('AUTH_REQUIRED')
  const credential = await models.sessions
    .findOne({
      _id: identity.sessionId,
      userId: identity.userId,
      kind,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    })
    .select('+securityRevisionAtIssue')
    .session(transaction)
  if (!credential || typeof credential.securityRevisionAtIssue !== 'number')
    throw new ApiError('AUTH_REQUIRED')
  const user = await models.users
    .findOne({
      _id: identity.userId,
      role: kind,
      status: 'active',
      securityRevision: credential.securityRevisionAtIssue,
    })
    .select('+securityRevision +challengeRevisions')
    .session(transaction)
  if (!user) throw new ApiError('AUTH_REQUIRED')
  if (!fence) return user

  // Real writes serialize with logout and principal changes. Monotonic timestamps
  // prevent a same-clock no-op; neither write extends the credential lifetime.
  const touch = (updatedAt: Date) => new Date(Math.max(now.getTime(), updatedAt.getTime() + 1))
  const credentialWrite = await models.sessions.updateOne(
    {
      _id: credential._id,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    },
    { $set: { updatedAt: touch(credential.updatedAt) } },
    { session: transaction, timestamps: false },
  )
  const updatedAt = touch(user.updatedAt)
  const principalWrite = await models.users.updateOne(
    {
      _id: user._id,
      role: kind,
      status: 'active',
      securityRevision: credential.securityRevisionAtIssue,
    },
    { $set: { updatedAt } },
    { session: transaction, timestamps: false },
  )
  if (credentialWrite.modifiedCount !== 1 || principalWrite.modifiedCount !== 1)
    throw new ApiError('AUTH_REQUIRED')
  user.updatedAt = updatedAt
  return user
}

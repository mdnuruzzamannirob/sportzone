import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ClientSession, Connection, Types } from 'mongoose'
import { type SessionOptions, validateSessionOptions } from '../../../config/security.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { IdentityModels } from '../auth.model.js'
import { findActiveUserSession } from './session.persistence.js'

type SessionKind = 'customer' | 'admin'

const tokenPattern = /^[A-Za-z0-9_-]{43}$/

type SessionIdentity = {
  sessionId: Types.ObjectId
  userId: Types.ObjectId
  kind: SessionKind
  expiresAt: Date
}

type IssuedSession = {
  token: string
  csrfToken: string
  kind: SessionKind
  expiresAt: Date
}

function createSessionService(
  connection: Connection,
  models: IdentityModels,
  settings: SessionOptions,
  clock: () => Date = () => new Date(),
) {
  const options = validateSessionOptions(settings)
  const key = Buffer.from(options.secret, 'hex')
  const kindCheck = (kind: SessionKind) => {
    if (kind !== 'customer' && kind !== 'admin') throw new ApiError('AUTH_REQUIRED')
  }
  const now = () => {
    const value = clock()
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid session clock.')
    return value
  }
  const hash = (kind: SessionKind, purpose: 'session' | 'csrf', value: string, binding = '') =>
    createHmac('sha256', key)
      .update(`sportzone:${purpose}:v1:${kind}:${binding}:${value}`)
      .digest('hex')
  const generate = (kind: SessionKind, issuedAt: Date) => {
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const tokenHash = hash(kind, 'session', token)
    const seconds = kind === 'customer' ? options.customerTtlSeconds : options.adminTtlSeconds
    const expiresAt = new Date(issuedAt.getTime() + seconds * 1000)
    if (!Number.isFinite(expiresAt.getTime())) throw new Error('Invalid session lifetime.')
    return {
      token,
      csrfToken,
      tokenHash,
      csrfSecretHash: hash(kind, 'csrf', csrfToken, tokenHash),
      expiresAt,
    }
  }
  const resolve = async (kind: SessionKind, token: string | undefined) => {
    kindCheck(kind)
    if (!token || !tokenPattern.test(token)) return null
    return findActiveUserSession(models, {
      tokenHash: hash(kind, 'session', token),
      kind,
      now: now(),
    })
  }
  return {
    // Nonsecret, immutable cookie attributes; never derive security from request headers.
    cookiePolicy: Object.freeze({
      secure: new URL(options.apiOrigin).protocol === 'https:',
      sameSite: options.sameSite,
      httpOnly: true as const,
      path: '/' as const,
    }),
    async issue(
      kind: SessionKind,
      userId: Types.ObjectId,
      previousToken?: string,
      transaction?: ClientSession,
    ): Promise<IssuedSession> {
      kindCheck(kind)
      const work = async (session: ClientSession): Promise<IssuedSession> => {
        const user = await models.users
          .findOne({ _id: userId, role: kind, status: 'active' })
          .select('+securityRevision')
          .session(session)
        if (!user) throw new ApiError('AUTH_REQUIRED')
        const issuedAt = now()
        const generated = generate(kind, issuedAt)
        if (previousToken && tokenPattern.test(previousToken))
          await models.sessions.updateOne(
            {
              tokenHash: hash(kind, 'session', previousToken),
              kind,
              userId,
              revokedAt: { $exists: false },
            },
            { $set: { revokedAt: issuedAt } },
            { session },
          )
        await new models.sessions({
          kind,
          userId,
          tokenHash: generated.tokenHash,
          csrfSecretHash: generated.csrfSecretHash,
          securityRevisionAtIssue: user.securityRevision,
          expiresAt: generated.expiresAt,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        }).save({ session })
        return {
          token: generated.token,
          csrfToken: generated.csrfToken,
          kind,
          expiresAt: generated.expiresAt,
        }
      }
      return transaction ? work(transaction) : inTransaction(connection, work)
    },
    async authenticate(kind: SessionKind, token: string | undefined): Promise<SessionIdentity> {
      const found = await resolve(kind, token)
      if (!found?.userId) throw new ApiError('AUTH_REQUIRED')
      return {
        sessionId: found._id,
        userId: found.userId,
        kind,
        expiresAt: found.expiresAt,
      }
    },
    async verifyCsrfMaterial(
      kind: SessionKind,
      token: string | undefined,
      csrfToken: string | undefined,
    ) {
      if (!token || !csrfToken || !tokenPattern.test(csrfToken)) return false
      const found = await resolve(kind, token)
      if (!found?.csrfSecretHash) return false
      const expected = Buffer.from(found.csrfSecretHash, 'hex')
      const supplied = Buffer.from(
        hash(kind, 'csrf', csrfToken, hash(kind, 'session', token)),
        'hex',
      )
      return expected.length === supplied.length && timingSafeEqual(expected, supplied)
    },
    async refreshCsrf(
      kind: SessionKind,
      token: string,
    ): Promise<{
      csrfToken: string
      expiresAt: Date
    }> {
      const found = await resolve(kind, token)
      if (!found?.csrfSecretHash) throw new ApiError('AUTH_REQUIRED')
      const csrfToken = randomBytes(32).toString('base64url')
      const changed = await models.sessions.updateOne(
        {
          _id: found._id,
          kind,
          csrfSecretHash: found.csrfSecretHash,
          expiresAt: { $gt: now() },
          revokedAt: { $exists: false },
        },
        {
          $set: {
            csrfSecretHash: hash(kind, 'csrf', csrfToken, hash(kind, 'session', token)),
          },
        },
      )
      if (changed.modifiedCount !== 1) throw new ApiError('AUTH_REQUIRED')
      return { csrfToken, expiresAt: found.expiresAt }
    },
    async rotate(kind: SessionKind, token: string): Promise<IssuedSession> {
      kindCheck(kind)
      if (!tokenPattern.test(token)) throw new ApiError('AUTH_REQUIRED')
      return inTransaction(connection, async (session) => {
        const issuedAt = now()
        const old = await models.sessions
          .findOne({
            tokenHash: hash(kind, 'session', token),
            kind,
            expiresAt: { $gt: issuedAt },
            revokedAt: { $exists: false },
          })
          .select('+securityRevisionAtIssue')
          .session(session)
        if (!old?.userId || typeof old.securityRevisionAtIssue !== 'number')
          throw new ApiError('AUTH_REQUIRED')
        const user = await models.users
          .exists({
            _id: old.userId,
            role: kind,
            status: 'active',
            securityRevision: old.securityRevisionAtIssue,
          })
          .session(session)
        if (!user) throw new ApiError('AUTH_REQUIRED')
        const generated = generate(kind, issuedAt)
        const changed = await models.sessions.updateOne(
          {
            _id: old._id,
            revokedAt: { $exists: false },
            expiresAt: { $gt: now() },
          },
          { $set: { revokedAt: issuedAt } },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('AUTH_REQUIRED')
        await new models.sessions({
          kind,
          userId: old.userId,
          securityRevisionAtIssue: old.securityRevisionAtIssue,
          tokenHash: generated.tokenHash,
          csrfSecretHash: generated.csrfSecretHash,
          expiresAt: generated.expiresAt,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        }).save({ session })
        return {
          token: generated.token,
          csrfToken: generated.csrfToken,
          kind,
          expiresAt: generated.expiresAt,
        }
      })
    },
    async logout(kind: SessionKind, token: string | undefined) {
      kindCheck(kind)
      if (token && tokenPattern.test(token))
        await models.sessions.updateOne(
          {
            tokenHash: hash(kind, 'session', token),
            kind,
            revokedAt: { $exists: false },
          },
          { $set: { revokedAt: now() } },
        )
      return { revoked: true as const }
    },
    async revokeUser(userId: Types.ObjectId, kind: SessionKind) {
      kindCheck(kind)
      return inTransaction(connection, async (session) => {
        const changed = await models.users.updateOne(
          { _id: userId, role: kind },
          { $inc: { securityRevision: 1 } },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('AUTH_REQUIRED')
        await models.sessions.updateMany(
          { userId, kind, revokedAt: { $exists: false } },
          { $set: { revokedAt: now() } },
          { session },
        )
      })
    },
  }
}

type SessionService = ReturnType<typeof createSessionService>

export { loadSessionOptions } from '../../../config/security.js'
export type { IssuedSession, SessionIdentity, SessionKind, SessionOptions, SessionService }
export { createSessionService, validateSessionOptions }

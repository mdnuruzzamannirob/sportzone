import type { Types, Connection } from 'mongoose'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ConfigurationError } from '../../config/environment.js'
import { inTransaction } from '../../db/transaction.js'
import { ApiError } from '../../shared/errors.js'
import type { IdentityModels } from './models.js'
import { findActiveUserSession } from './persistence.js'

export type SessionKind = 'customer' | 'admin'
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
const ttl = z
  .int()
  .positive()
  .max(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
const optionsSchema = z
  .strictObject({
    secret: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .refine((value) => !/^(.)\1+$/.test(value)),
    customerTtlSeconds: ttl,
    adminTtlSeconds: ttl,
    sameSite: z.enum(['lax', 'strict']),
    appEnvironment: z.enum(['local', 'test', 'staging', 'production']),
    apiOrigin: z.string().refine((value) => {
      try {
        const url = new URL(value)
        return ['https:', 'http:'].includes(url.protocol) && url.origin === value
      } catch {
        return false
      }
    }),
  })
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value.apiOrigin)
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (
        (url.protocol === 'http:' &&
          (!loopback || !['local', 'test'].includes(value.appEnvironment))) ||
        (['staging', 'production'].includes(value.appEnvironment) && loopback)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['apiOrigin'],
          message: 'Secure API origin required',
        })
    } catch {
      /* The field refinement reports malformed origins without values. */
    }
  })
export type SessionOptions = z.infer<typeof optionsSchema>
const fields: Record<string, string> = {
  secret: 'SESSION_SECRET',
  customerTtlSeconds: 'CUSTOMER_SESSION_TTL_SECONDS',
  adminTtlSeconds: 'ADMIN_SESSION_TTL_SECONDS',
  sameSite: 'SESSION_COOKIE_SAME_SITE',
  appEnvironment: 'APP_ENV',
  apiOrigin: 'API_PUBLIC_ORIGIN',
}
function validatedOptions(value: unknown): SessionOptions {
  const parsed = optionsSchema.safeParse(value)
  if (!parsed.success)
    throw new ConfigurationError(
      [
        ...new Set(
          parsed.error.issues.map(
            (issue) => fields[String(issue.path[0])] ?? 'session_configuration',
          ),
        ),
      ].sort(),
    )
  return parsed.data
}
// Activated by the owning identity composition, not by the current health-only runtime.
export function loadSessionOptions(environment: NodeJS.ProcessEnv): SessionOptions {
  const seconds = (value: string | undefined) =>
    value && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
  return validatedOptions({
    secret: environment.SESSION_SECRET,
    customerTtlSeconds: seconds(environment.CUSTOMER_SESSION_TTL_SECONDS),
    adminTtlSeconds: seconds(environment.ADMIN_SESSION_TTL_SECONDS),
    sameSite: environment.SESSION_COOKIE_SAME_SITE,
    appEnvironment: environment.APP_ENV,
    apiOrigin: environment.API_PUBLIC_ORIGIN,
  })
}
export type SessionIdentity = {
  sessionId: Types.ObjectId
  userId: Types.ObjectId
  kind: SessionKind
  expiresAt: Date
}
export type IssuedSession = {
  token: string
  csrfToken: string
  kind: SessionKind
  expiresAt: Date
}
export function createSessionService(
  connection: Connection,
  models: IdentityModels,
  settings: SessionOptions,
  clock: () => Date = () => new Date(),
) {
  const options = validatedOptions(settings)
  const key = Buffer.from(options.secret, 'hex')
  const kindCheck = (kind: SessionKind) => {
    if (kind !== 'customer' && kind !== 'admin') throw new ApiError('AUTH_REQUIRED')
  }
  const now = () => {
    const value = clock()
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid session clock.')
    return value
  }
  const hash = (
    kind: SessionKind,
    purpose: 'session' | 'csrf',
    value: string,
    binding = '',
  ) =>
    createHmac('sha256', key)
      .update(`sportzone:${purpose}:v1:${kind}:${binding}:${value}`)
      .digest('hex')
  const generate = (kind: SessionKind, issuedAt: Date) => {
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const tokenHash = hash(kind, 'session', token)
    const seconds =
      kind === 'customer' ? options.customerTtlSeconds : options.adminTtlSeconds
    const expiresAt = new Date(issuedAt.getTime() + seconds * 1000)
    if (!Number.isFinite(expiresAt.getTime()))
      throw new Error('Invalid session lifetime.')
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
    ): Promise<IssuedSession> {
      kindCheck(kind)
      return inTransaction(connection, async (session) => {
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
      })
    },
    async authenticate(
      kind: SessionKind,
      token: string | undefined,
    ): Promise<SessionIdentity> {
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
export type SessionService = ReturnType<typeof createSessionService>

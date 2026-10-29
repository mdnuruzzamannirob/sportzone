import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import type { IdentityModels } from '../auth.model.js'
import type { SessionOptions } from '../sessions/session.service.js'
import { validateSessionOptions } from '../sessions/session.service.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { proofPattern } from '../verification/proof.crypto.js'
export function guestSessionService(
  connection: Connection,
  models: IdentityModels,
  options: SessionOptions,
  ttlSeconds: number,
  orderExists: (session: ClientSession | undefined, orderId: string) => Promise<boolean>,
  clock: () => Date = () => new Date(),
) {
  const settings = validateSessionOptions(options)
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 604800)
    throw new Error('Invalid guest session lifetime')
  const hash = (purpose: 'session' | 'csrf', value: string, binding = '') =>
    createHmac('sha256', Buffer.from(settings.secret, 'hex'))
      .update(`sportzone:${purpose}:v1:guest_order:${binding}:${value}`)
      .digest('hex')
  async function resolve(session: ClientSession, token: string | undefined, csrf?: string) {
    if (!token || !proofPattern.test(token)) throw new ApiError('GUEST_PROOF_REQUIRED')
    const tokenHash = hash('session', token),
      row = await models.sessions
        .findOne({
          tokenHash,
          kind: 'guest_order',
          expiresAt: { $gt: clock() },
          revokedAt: { $exists: false },
        })
        .select('+csrfSecretHash +tokenHash')
        .session(session)
    if (!row?.orderId || !(await orderExists(session, row.orderId.toHexString())))
      throw new ApiError('GUEST_PROOF_REQUIRED')
    if (
      csrf !== undefined &&
      (!proofPattern.test(csrf) ||
        !timingSafeEqual(
          Buffer.from(hash('csrf', csrf, tokenHash), 'hex'),
          Buffer.from(row.csrfSecretHash, 'hex'),
        ))
    )
      throw new ApiError('CSRF_INVALID')
    const fenced = await models.sessions.updateOne(
      {
        _id: row._id,
        kind: 'guest_order',
        revokedAt: { $exists: false },
        expiresAt: { $gt: clock() },
        csrfSecretHash: row.csrfSecretHash,
      },
      { $set: { lastUsedAt: clock() } },
      { session },
    )
    if (fenced.matchedCount !== 1) throw new ApiError('GUEST_PROOF_REQUIRED')
    return row
  }
  return {
    async issueAfterProof(session: ClientSession, orderId: string, previous?: string) {
      if (!session.inTransaction() || !(await orderExists(session, orderId)))
        throw new ApiError('GUEST_PROOF_REQUIRED')
      if (previous && proofPattern.test(previous))
        await models.sessions.updateOne(
          {
            tokenHash: hash('session', previous),
            kind: 'guest_order',
            revokedAt: { $exists: false },
          },
          { $set: { revokedAt: clock() } },
          { session },
        )
      const token = randomBytes(32).toString('base64url'),
        csrfToken = randomBytes(32).toString('base64url'),
        tokenHash = hash('session', token),
        now = clock(),
        expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
      await new models.sessions({
        kind: 'guest_order',
        tokenHash,
        csrfSecretHash: hash('csrf', csrfToken, tokenHash),
        orderId: new Types.ObjectId(orderId),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      }).save({ session })
      return { token, csrfToken, orderId, expiresAt }
    },
    async owned<T>(
      token: string | undefined,
      orderId: string | undefined,
      work: (scope: { orderId: string; expiresAt: Date }, session: ClientSession) => Promise<T>,
      csrf?: string,
    ) {
      return inTransaction(connection, async (session) => {
        const row = await resolve(session, token, csrf)
        if (!row.orderId || (orderId !== undefined && row.orderId.toHexString() !== orderId))
          throw new ApiError('GUEST_PROOF_REQUIRED')
        return work({ orderId: row.orderId.toHexString(), expiresAt: row.expiresAt }, session)
      })
    },
    async refresh(token: string | undefined) {
      return inTransaction(connection, async (session) => {
        const row = await resolve(session, token),
          csrfToken = randomBytes(32).toString('base64url')
        await models.sessions.updateOne(
          { _id: row._id },
          { $set: { csrfSecretHash: hash('csrf', csrfToken, row.tokenHash) } },
          { session },
        )
        return { csrfToken, expiresAt: row.expiresAt }
      })
    },
    async verify(token: string | undefined, csrf: string | undefined) {
      if (!csrf) return false
      try {
        return await inTransaction(connection, async (session) => {
          await resolve(session, token, csrf)
          return true
        })
      } catch (error) {
        if (
          error instanceof ApiError &&
          ['GUEST_PROOF_REQUIRED', 'CSRF_INVALID'].includes(error.code)
        )
          return false
        throw error
      }
    },
    async logout(token: string | undefined) {
      if (!token || !proofPattern.test(token)) return
      await models.sessions.updateOne(
        { tokenHash: hash('session', token), kind: 'guest_order', revokedAt: { $exists: false } },
        { $set: { revokedAt: clock() } },
        { writeConcern: { w: 'majority' } },
      )
    },
    cookiePolicy: {
      httpOnly: true,
      secure: new URL(settings.apiOrigin).protocol === 'https:',
      sameSite: settings.sameSite,
      path: '/',
    } as const,
  }
}
export type GuestSessions = ReturnType<typeof guestSessionService>
export function readGuestCookie(header: string | undefined) {
  const entries = (header ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith('sz_guest_order_sid='))
  const token = entries.length === 1 ? entries[0]?.slice('sz_guest_order_sid='.length) : undefined
  return token && proofPattern.test(token) ? token : undefined
}

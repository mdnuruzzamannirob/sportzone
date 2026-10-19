import { setTimeout as delay } from 'node:timers/promises'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { RecoveryOptions } from '../../config/recovery.js'
export {
  loadRecoveryOptions,
  type RecoveryOptions,
} from '../../config/recovery.js'
import { inTransaction } from '../../db/transaction.js'
import { parseInput } from '../../middleware/validation.js'
import { ApiError } from '../../shared/errors.js'
import type { RegistrationNotifications } from '../notifications/registration.js'
import type { BrowserSecurity } from './browser-security.js'
import { loginInput } from './customer.js'
import type { IdentityModels } from './models.js'
import { hashPassword, newPasswordPolicy, verifyPassword } from './passwords.js'
import {
  ChallengeUnavailableError,
  consumeUserChallenge,
} from './persistence.js'
import { proofHash, proofPattern } from './proof-envelope.js'
import type { SessionService } from './sessions.js'

const issuance = loginInput.pick({ email: true })
const confirmation = z.strictObject({
  token: z.string().regex(proofPattern),
  newPassword: newPasswordPolicy,
})
const changeInput = z.strictObject({
  currentPassword: loginInput.shape.password,
  newPassword: newPasswordPolicy,
})
export function createRecoveryService(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
  security: BrowserSecurity,
  notifications: RegistrationNotifications,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
) {
  async function invalidate(userId: Types.ObjectId, session: ClientSession) {
    await models.challenges.updateMany(
      {
        userId,
        purpose: 'password_reset',
        consumedAt: { $exists: false },
        invalidatedAt: { $exists: false },
      },
      { $set: { invalidatedAt: clock() }, $unset: { deliveryEnvelope: 1 } },
      { session },
    )
  }
  async function revoke(userId: Types.ObjectId, session: ClientSession) {
    await models.sessions.updateMany(
      { userId, kind: 'customer', revokedAt: { $exists: false } },
      { $set: { revokedAt: clock() } },
      { session },
    )
  }
  return {
    async request(raw: unknown, context: string, csrf: string) {
      const input = parseInput(issuance, raw)
      // Every valid-shaped request consumes a context; no email is sent in the request.
      const started = performance.now()
      const proof = randomBytes(32).toString('base64url')
      const id = new Types.ObjectId(),
        notificationId = new Types.ObjectId()
      try {
        return await security.consumeContext(
          'storefront',
          context,
          csrf,
          async (session) => {
            const user = await models.users
              .findOne({
                emailNormalized: input.email,
                role: 'customer',
                status: 'active',
              })
              .select('+challengeRevisions')
              .session(session)
            if (!user) return { accepted: true as const }
            const previous = await models.challenges
              .findOne({
                userId: user._id,
                purpose: 'password_reset',
                createdAt: {
                  $gt: new Date(
                    clock().getTime() - options.cooldownSeconds * 1000,
                  ),
                },
              })
              .session(session)
            if (previous) return { accepted: true as const }
            const updated = await models.users
              .findOneAndUpdate(
                {
                  _id: user._id,
                  role: 'customer',
                  status: 'active',
                  'challengeRevisions.password_reset':
                    user.challengeRevisions.password_reset,
                },
                { $inc: { 'challengeRevisions.password_reset': 1 } },
                { session, returnDocument: 'after' },
              )
              .select('+challengeRevisions')
            if (!updated) throw new ApiError('STATE_CONFLICT')
            await invalidate(user._id, session)
            const now = clock(),
              expiresAt = new Date(now.getTime() + options.ttlSeconds * 1000)
            const revision = updated.challengeRevisions.password_reset
            const deliveryEnvelope = options.encryption.encrypt(proof, {
              id: id.toHexString(),
              userId: user._id.toHexString(),
              email: input.email,
              expiresAt,
              revision,
            })
            await new models.challenges({
              _id: id,
              purpose: 'password_reset',
              secretHash: proofHash(proof),
              userId: user._id,
              emailNormalized: input.email,
              expiresAt,
              scopeRevisionAtIssue: revision,
              deliveryEnvelope,
              deliveryNotificationId: notificationId,
              createdAt: now,
              updatedAt: now,
            }).save({ session })
            await notifications.enqueuePasswordReset(
              {
                id: notificationId,
                challengeId: id,
                userId: user._id,
                email: input.email,
              },
              session,
            )
            return { accepted: true as const }
          },
        )
      } finally {
        await delay(
          Math.max(0, options.responseFloorMs - (performance.now() - started)),
        )
      }
    },
    async confirm(raw: unknown, context: string, csrf: string) {
      const input = parseInput(confirmation, raw)
      // Same KDF work for valid-shape unknown, expired and consumed tokens.
      const passwordHash = await hashPassword(input.newPassword)
      const hash = proofHash(input.token)
      const candidate = await models.challenges
        .findOne({ secretHash: hash, purpose: 'password_reset' })
        .select('userId emailNormalized')
      if (!candidate?.userId) throw new ApiError('INVALID_REQUEST')
      const candidateUserId = candidate.userId
      try {
        // consumeContext owns the transaction; consumeUserChallenge cannot nest its transaction.
        return await security.consumeContext(
          'storefront',
          context,
          csrf,
          async (session) => {
            return consumeUserChallenge(
              connection,
              models,
              {
                secretHash: hash,
                purpose: 'password_reset',
                userId: candidateUserId,
                role: 'customer',
                maxAttempts: 1,
              },
              async ({ session: transaction, userId }) => {
                const changed = await models.users.updateOne(
                  {
                    _id: userId,
                    role: 'customer',
                    status: 'active',
                    emailNormalized: candidate.emailNormalized,
                  },
                  { $set: { passwordHash }, $inc: { securityRevision: 1 } },
                  { session: transaction },
                )
                if (changed.modifiedCount !== 1)
                  throw new ChallengeUnavailableError()
                await invalidate(userId, transaction)
                await revoke(userId, transaction)
                return { reset: true as const }
              },
              clock,
              session,
            )
          },
        )
      } catch (error) {
        if (error instanceof ChallengeUnavailableError)
          throw new ApiError('INVALID_REQUEST')
        throw error
      }
    },
    async change(raw: unknown, token: string | undefined) {
      const input = parseInput(changeInput, raw)
      const identity = await sessions.authenticate('customer', token)
      const user = await models.users
        .findOne({ _id: identity.userId, role: 'customer', status: 'active' })
        .select('+passwordHash +securityRevision')
      if (
        !(await verifyPassword(input.currentPassword, user?.passwordHash)) ||
        !user
      )
        throw new ApiError('INVALID_CREDENTIALS')
      const passwordHash = await hashPassword(input.newPassword)
      return inTransaction(connection, async (session) => {
        const credential = await models.sessions
          .findOne({
            _id: identity.sessionId,
            userId: user._id,
            kind: 'customer',
            revokedAt: { $exists: false },
            expiresAt: { $gt: clock() },
            securityRevisionAtIssue: user.securityRevision,
          })
          .session(session)
        if (!credential) throw new ApiError('AUTH_REQUIRED')
        // Touch the authenticating credential to serialize with concurrent logout.
        const locked = await models.sessions.updateOne(
          { _id: credential._id, revokedAt: { $exists: false } },
          { $set: { revokedAt: clock() } },
          { session },
        )
        if (locked.modifiedCount !== 1) throw new ApiError('AUTH_REQUIRED')
        const changed = await models.users.updateOne(
          {
            _id: user._id,
            role: 'customer',
            status: 'active',
            securityRevision: user.securityRevision,
            passwordHash: user.passwordHash,
          },
          {
            $set: { passwordHash },
            $inc: {
              securityRevision: 1,
              'challengeRevisions.password_reset': 1,
            },
          },
          { session },
        )
        if (changed.modifiedCount !== 1)
          throw new ApiError('INVALID_CREDENTIALS')
        await invalidate(user._id, session)
        await revoke(user._id, session)
        const issued = await sessions.issue(
          'customer',
          user._id,
          undefined,
          session,
        )
        return { changed: true as const, issued }
      })
    },
  }
}
export type RecoveryService = ReturnType<typeof createRecoveryService>

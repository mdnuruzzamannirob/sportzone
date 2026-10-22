import { authorizeAccount } from '../sessions/authorization.service.js'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { RecoveryOptions } from '../../../config/security.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { RegistrationNotifications } from '../../notifications/notification.service.js'
import { accountDto } from '../credentials/account.dto.js'
import { loginInput } from '../credentials/credentials.service.js'
import type { IdentityModels } from '../auth.model.js'
import { ChallengeUnavailableError, consumeUserChallenge } from '../sessions/session.persistence.js'
import { proofHash, proofPattern } from './proof.crypto.js'
import type { SessionService } from '../sessions/session.service.js'

const requestInput = z.strictObject({ newEmail: loginInput.shape.email })
const confirmInput = z.strictObject({ token: z.string().regex(proofPattern) })
type User = InstanceType<IdentityModels['users']>
export function createEmailChangeService(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
  notifications: RegistrationNotifications,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
) {
  async function owned<T>(
    token: string | undefined,
    work: (user: User, session: ClientSession) => Promise<T>,
  ) {
    const identity = await sessions.authenticate('customer', token)
    return inTransaction(connection, async (session) => {
      const user = await authorizeAccount(models, identity, 'customer', session, clock())
      return work(user, session)
    })
  }
  return {
    async request(raw: unknown, token: string | undefined) {
      const input = parseInput(requestInput, raw),
        started = performance.now()
      const secret = randomBytes(32).toString('base64url'),
        id = new Types.ObjectId(),
        notificationId = new Types.ObjectId()
      try {
        return await owned(token, async (user, session) => {
          if (input.newEmail === user.emailNormalized) throw new ApiError('STATE_CONFLICT')
          const existing = await models.users
            .exists({ emailNormalized: input.newEmail })
            .session(session)
          const recent = await models.challenges
            .exists({
              userId: user._id,
              purpose: 'email_change',
              createdAt: {
                $gt: new Date(clock().getTime() - options.cooldownSeconds * 1000),
              },
            })
            .session(session)
          if (existing || recent) return { verificationSent: true as const }
          const revision = user.challengeRevisions.email_change + 1
          const changed = await models.users.updateOne(
            {
              _id: user._id,
              role: 'customer',
              status: 'active',
              securityRevision: user.securityRevision,
              'challengeRevisions.email_change': user.challengeRevisions.email_change,
            },
            { $inc: { 'challengeRevisions.email_change': 1 } },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          const now = clock(),
            expiresAt = new Date(now.getTime() + options.ttlSeconds * 1000)
          await models.challenges.updateMany(
            {
              userId: user._id,
              purpose: 'email_change',
              consumedAt: { $exists: false },
              invalidatedAt: { $exists: false },
            },
            { $set: { invalidatedAt: now }, $unset: { deliveryEnvelope: 1 } },
            { session },
          )
          const envelope = options.encryption.encrypt(secret, {
            id: id.toHexString(),
            userId: user._id.toHexString(),
            email: user.emailNormalized,
            targetEmail: input.newEmail,
            purpose: 'email_change',
            expiresAt,
            revision,
          })
          await new models.challenges({
            _id: id,
            purpose: 'email_change',
            secretHash: proofHash(secret, 'email_change'),
            userId: user._id,
            emailNormalized: user.emailNormalized,
            targetEmailNormalized: input.newEmail,
            expiresAt,
            scopeRevisionAtIssue: revision,
            deliveryEnvelope: envelope,
            deliveryNotificationId: notificationId,
            createdAt: now,
            updatedAt: now,
          }).save({ session })
          await notifications.enqueueEmailChange(
            {
              id: notificationId,
              userId: user._id,
              challengeId: id,
              email: input.newEmail,
            },
            session,
          )
          return { verificationSent: true as const }
        })
      } finally {
        await delay(Math.max(0, options.responseFloorMs - (performance.now() - started)))
      }
    },
    async confirm(raw: unknown, token: string | undefined) {
      const input = parseInput(confirmInput, raw)
      try {
        return await owned(token, async (user, session) => {
          const challenge = await models.challenges
            .findOne({
              secretHash: proofHash(input.token, 'email_change'),
              purpose: 'email_change',
              userId: user._id,
            })
            .session(session)
          if (
            !challenge?.targetEmailNormalized ||
            challenge.emailNormalized !== user.emailNormalized ||
            challenge.targetEmailNormalized === user.emailNormalized
          )
            throw new ChallengeUnavailableError()
          return consumeUserChallenge(
            connection,
            models,
            {
              secretHash: proofHash(input.token, 'email_change'),
              purpose: 'email_change',
              userId: user._id,
              role: 'customer',
              maxAttempts: 1,
            },
            async ({ session: transaction }) => {
              const changed = await models.users.findOneAndUpdate(
                {
                  _id: user._id,
                  role: 'customer',
                  status: 'active',
                  securityRevision: user.securityRevision,
                  emailNormalized: challenge.emailNormalized,
                },
                {
                  $set: {
                    emailNormalized: challenge.targetEmailNormalized,
                    emailVerifiedAt: clock(),
                  },
                  $inc: {
                    securityRevision: 1,
                    'challengeRevisions.email_verify': 1,
                    'challengeRevisions.password_reset': 1,
                  },
                },
                {
                  session: transaction,
                  returnDocument: 'after',
                  runValidators: true,
                },
              )
              if (!changed) throw new ChallengeUnavailableError()
              await models.challenges.updateMany(
                {
                  userId: user._id,
                  purpose: {
                    $in: ['email_change', 'email_verify', 'password_reset'],
                  },
                  consumedAt: { $exists: false },
                  invalidatedAt: { $exists: false },
                },
                {
                  $set: { invalidatedAt: clock() },
                  $unset: { deliveryEnvelope: 1 },
                },
                { session: transaction },
              )
              await models.sessions.updateMany(
                {
                  userId: user._id,
                  kind: 'customer',
                  revokedAt: { $exists: false },
                },
                { $set: { revokedAt: clock() } },
                { session: transaction },
              )
              return accountDto(changed)
            },
            clock,
            session,
          )
        })
      } catch (error) {
        if (error instanceof ChallengeUnavailableError) throw new ApiError('INVALID_REQUEST')
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
          throw new ApiError('STATE_CONFLICT')
        throw error
      }
    },
  }
}
export type EmailChangeService = ReturnType<typeof createEmailChangeService>

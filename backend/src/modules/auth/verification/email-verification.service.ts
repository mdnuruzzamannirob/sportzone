import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { type Connection, Types } from 'mongoose'
import type { RecoveryOptions } from '../../../config/security.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import type { IdentityNotifications } from '../../notifications/notification.public.js'
import type { IdentityModels } from '../auth.model.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import { ChallengeUnavailableError, consumeUserChallenge } from '../sessions/session.persistence.js'
import {
  emailVerificationConfirmation,
  emailVerificationInput,
} from './email-verification.schema.js'
import { createProofCodec, proofHash } from './proof.crypto.js'

function createEmailVerificationService(
  connection: Connection,
  models: IdentityModels,
  security: BrowserSecurity,
  notifications: Pick<IdentityNotifications, 'enqueueEmailVerification'>,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
) {
  const encryption = createProofCodec(options.encryption)
  return {
    async request(raw: unknown, context: string, csrf: string) {
      const input = parseInput(emailVerificationInput, raw),
        started = performance.now()
      const proof = randomBytes(32).toString('base64url'),
        id = new Types.ObjectId(),
        notificationId = new Types.ObjectId()
      try {
        return await security.consumeContext('storefront', context, csrf, async (session) => {
          const user = await models.users
            .findOne({
              emailNormalized: input.email,
              role: 'customer',
              status: 'active',
              emailVerifiedAt: { $exists: false },
            })
            .select('+challengeRevisions')
            .session(session)
          if (!user) return { accepted: true as const }
          const now = clock()
          if (
            await models.challenges
              .exists({
                userId: user._id,
                purpose: 'email_verify',
                createdAt: { $gt: new Date(now.getTime() - options.cooldownSeconds * 1000) },
              })
              .session(session)
          )
            return { accepted: true as const }
          const revision = user.challengeRevisions.email_verify + 1
          if (!Number.isSafeInteger(revision)) throw new ApiError('SERVICE_UNAVAILABLE')
          const changed = await models.users.updateOne(
            {
              _id: user._id,
              role: 'customer',
              status: 'active',
              emailNormalized: input.email,
              emailVerifiedAt: { $exists: false },
              'challengeRevisions.email_verify': user.challengeRevisions.email_verify,
            },
            { $inc: { 'challengeRevisions.email_verify': 1 } },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await models.challenges.updateMany(
            {
              userId: user._id,
              purpose: 'email_verify',
              consumedAt: { $exists: false },
              invalidatedAt: { $exists: false },
            },
            { $set: { invalidatedAt: now }, $unset: { deliveryEnvelope: 1 } },
            { session },
          )
          const expiresAt = new Date(now.getTime() + options.ttlSeconds * 1000)
          await new models.challenges({
            _id: id,
            purpose: 'email_verify',
            userId: user._id,
            emailNormalized: input.email,
            secretHash: proofHash(proof, 'email_verify'),
            scopeRevisionAtIssue: revision,
            expiresAt,
            deliveryNotificationId: notificationId,
            deliveryEnvelope: encryption.encrypt(proof, {
              id: id.toHexString(),
              userId: user._id.toHexString(),
              email: input.email,
              expiresAt,
              revision,
              purpose: 'email_verify',
            }),
            createdAt: now,
            updatedAt: now,
          }).save({ session })
          await notifications.enqueueEmailVerification(
            {
              id: notificationId.toHexString(),
              challengeId: id.toHexString(),
              userId: user._id.toHexString(),
              email: input.email,
            },
            session,
          )
          return { accepted: true as const }
        })
      } finally {
        await delay(Math.max(0, options.responseFloorMs - (performance.now() - started)))
      }
    },
    async confirm(raw: unknown, context: string, csrf: string) {
      const input = parseInput(emailVerificationConfirmation, raw),
        hash = proofHash(input.token, 'email_verify')
      const candidate = await models.challenges
        .findOne({ secretHash: hash, purpose: 'email_verify' })
        .select('userId emailNormalized')
      if (!candidate?.userId) throw new ApiError('INVALID_REQUEST')
      const userId = candidate.userId
      try {
        return await security.consumeContext('storefront', context, csrf, (session) =>
          consumeUserChallenge(
            connection,
            models,
            { secretHash: hash, purpose: 'email_verify', userId, role: 'customer', maxAttempts: 1 },
            async ({ session: transaction }) => {
              const changed = await models.users.updateOne(
                {
                  _id: userId,
                  role: 'customer',
                  status: 'active',
                  emailNormalized: candidate.emailNormalized,
                  emailVerifiedAt: { $exists: false },
                },
                { $set: { emailVerifiedAt: clock() } },
                { session: transaction },
              )
              if (changed.modifiedCount !== 1) throw new ChallengeUnavailableError()
              return { verified: true as const }
            },
            clock,
            session,
          ),
        )
      } catch (error) {
        if (error instanceof ChallengeUnavailableError) throw new ApiError('INVALID_REQUEST')
        throw error
      }
    },
  }
}

export { createEmailVerificationService }

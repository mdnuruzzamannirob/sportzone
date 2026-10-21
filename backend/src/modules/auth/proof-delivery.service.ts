import type { Types } from 'mongoose'
import type { IdentityModels } from './auth.model.js'
import { proofHash, type ProofEnvelope } from './proof.crypto.js'
import type { RecoveryOptions } from './password-recovery.service.js'

function createDelivery(
  models: IdentityModels,
  options: RecoveryOptions,
  clock: () => Date,
  purpose: 'password_reset' | 'email_change',
  kind: 'customer' | 'admin' = 'customer',
) {
  if (
    new URL(options.storefrontOrigin).protocol !== 'https:' ||
    new URL(options.storefrontOrigin).origin !== options.storefrontOrigin
  )
    throw new Error('Secure proof origin required.')
  return {
    async cleanup(limit: number) {
      const rows = await models.challenges
        .find({
          deliveryEnvelope: { $exists: true },
          $or: [
            { expiresAt: { $lte: clock() } },
            { consumedAt: { $exists: true } },
            { invalidatedAt: { $exists: true } },
          ],
        })
        .select('_id')
        .limit(limit)
      for (const row of rows)
        await models.challenges.updateOne(
          {
            _id: row._id,
            $or: [
              { expiresAt: { $lte: clock() } },
              { consumedAt: { $exists: true } },
              { invalidatedAt: { $exists: true } },
            ],
          },
          { $unset: { deliveryEnvelope: 1 } },
        )
    },
    async message(claim: {
      id: Types.ObjectId
      userId: Types.ObjectId
      challengeId?: Types.ObjectId | null | undefined
      recipient: string
    }) {
      if (!claim.challengeId) throw new Error('Proof delivery unavailable.')
      const challenge = await models.challenges
        .findOne({
          _id: claim.challengeId,
          purpose,
          userId: claim.userId,
          ...(purpose === 'password_reset'
            ? { emailNormalized: claim.recipient }
            : { targetEmailNormalized: claim.recipient }),
          deliveryNotificationId: claim.id,
          expiresAt: { $gt: clock() },
          consumedAt: { $exists: false },
          invalidatedAt: { $exists: false },
          attemptCount: { $lt: 1 },
        })
        .select('+deliveryEnvelope +scopeRevisionAtIssue +secretHash')
      if (!challenge?.deliveryEnvelope || !challenge.userId)
        throw new Error('Proof delivery unavailable.')
      const binding = {
        id: challenge._id.toHexString(),
        userId: challenge.userId.toHexString(),
        email: challenge.emailNormalized,
        expiresAt: challenge.expiresAt,
        revision: challenge.scopeRevisionAtIssue,
        ...(kind === 'admin' ? { audience: 'admin' as const } : {}),
        ...(purpose === 'email_change'
          ? { purpose, targetEmail: claim.recipient }
          : {}),
      }
      const envelope: ProofEnvelope = {
        algorithm: 'AES-256-GCM',
        keyVersion: challenge.deliveryEnvelope.keyVersion,
        nonce: Buffer.from(challenge.deliveryEnvelope.nonce),
        ciphertext: Buffer.from(challenge.deliveryEnvelope.ciphertext),
        authTag: Buffer.from(challenge.deliveryEnvelope.authTag),
      }
      const proof = options.encryption.decrypt(envelope, binding)
      if (
        proofHash(
          proof,
          kind === 'admin' ? 'admin_password_reset' : purpose,
        ) !== challenge.secretHash
      )
        throw new Error('Proof delivery unavailable.')
      const eligible = await models.users.exists({
        _id: claim.userId,
        role: kind,
        status: 'active',
        emailNormalized: challenge.emailNormalized,
        [`challengeRevisions.${purpose}`]: challenge.scopeRevisionAtIssue,
      })
      if (!eligible || challenge.expiresAt <= clock())
        throw new Error('Proof delivery unavailable.')
      // Fragment keeps the proof out of HTTP request targets and referrer headers in the later UI.
      return {
        to: claim.recipient,
        subject:
          purpose === 'password_reset'
            ? 'Reset your SportZone password'
            : 'Verify your new SportZone email',
        text: `${purpose === 'password_reset' ? 'Reset your password' : 'Verify your new email'} using this single-use link:\n${options.storefrontOrigin}${purpose === 'password_reset' ? '/reset-password' : '/account/email-change'}#token=${proof}\nThis link expires at ${challenge.expiresAt.toISOString()}. If you did not request it, ignore this email.`,
      }
    },
  }
}
export const createResetDelivery = (
  models: IdentityModels,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
) => createDelivery(models, options, clock, 'password_reset')
export const createEmailChangeDelivery = (
  models: IdentityModels,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
) => createDelivery(models, options, clock, 'email_change')
export type ResetDelivery = ReturnType<typeof createResetDelivery>

export const createAdminResetDelivery = (
  models: IdentityModels,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
) => createDelivery(models, options, clock, 'password_reset', 'admin')

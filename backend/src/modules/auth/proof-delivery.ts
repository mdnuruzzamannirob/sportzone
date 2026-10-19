import type { Types } from 'mongoose'
import type { IdentityModels } from './models.js'
import { proofHash, type ProofEnvelope } from './proof-envelope.js'
import type { RecoveryOptions } from './recovery.js'

export function createResetDelivery(
  models: IdentityModels,
  options: RecoveryOptions,
  clock: () => Date = () => new Date(),
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
          purpose: 'password_reset',
          userId: claim.userId,
          emailNormalized: claim.recipient,
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
      }
      const envelope: ProofEnvelope = {
        algorithm: 'AES-256-GCM',
        keyVersion: challenge.deliveryEnvelope.keyVersion,
        nonce: Buffer.from(challenge.deliveryEnvelope.nonce),
        ciphertext: Buffer.from(challenge.deliveryEnvelope.ciphertext),
        authTag: Buffer.from(challenge.deliveryEnvelope.authTag),
      }
      const proof = options.encryption.decrypt(envelope, binding)
      if (proofHash(proof) !== challenge.secretHash)
        throw new Error('Proof delivery unavailable.')
      const eligible = await models.users.exists({
        _id: claim.userId,
        role: 'customer',
        status: 'active',
        emailNormalized: claim.recipient,
        'challengeRevisions.password_reset': challenge.scopeRevisionAtIssue,
      })
      if (!eligible || challenge.expiresAt <= clock())
        throw new Error('Proof delivery unavailable.')
      // Fragment keeps the proof out of HTTP request targets and referrer headers in the later UI.
      return {
        to: claim.recipient,
        subject: 'Reset your SportZone password',
        text: `Reset your password using this single-use link:\n${options.storefrontOrigin}/reset-password#token=${proof}\nThis link expires at ${challenge.expiresAt.toISOString()}. If you did not request it, ignore this email.`,
      }
    },
  }
}
export type ResetDelivery = ReturnType<typeof createResetDelivery>

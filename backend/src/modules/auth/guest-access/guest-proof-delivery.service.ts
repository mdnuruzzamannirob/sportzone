import type { Types } from 'mongoose'
import type { IdentityModels } from '../auth.model.js'
import type { GuestAccessOptions } from '../../../config/security.js'
import type { guestOrderAccess } from '../../orders/order.service.js'
import { proofHash, type ProofEnvelope } from '../verification/proof.crypto.js'
export function guestProofDelivery(
  models: IdentityModels,
  orders: ReturnType<typeof guestOrderAccess>,
  options: GuestAccessOptions,
  clock: () => Date = () => new Date(),
) {
  if (
    new URL(options.storefrontOrigin).protocol !== 'https:' ||
    new URL(options.storefrontOrigin).origin !== options.storefrontOrigin
  )
    throw new Error('Secure guest proof origin required')
  return {
    async cleanup(limit: number) {
      const rows = await models.challenges
        .find({
          purpose: 'guest_order_access',
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
      orderId?: Types.ObjectId | null | undefined
      challengeId?: Types.ObjectId | null | undefined
      recipient: string
    }) {
      if (!claim.orderId || !claim.challengeId) throw new Error('Guest proof delivery unavailable')
      const challenge = await models.challenges
        .findOne({
          _id: claim.challengeId,
          purpose: 'guest_order_access',
          orderId: claim.orderId,
          emailNormalized: claim.recipient,
          deliveryNotificationId: claim.id,
          expiresAt: { $gt: clock() },
          consumedAt: { $exists: false },
          invalidatedAt: { $exists: false },
          attemptCount: { $lt: 1 },
        })
        .select('+deliveryEnvelope +scopeRevisionAtIssue +secretHash')
      if (!challenge?.deliveryEnvelope || !challenge.orderId)
        throw new Error('Guest proof delivery unavailable')
      const envelope: ProofEnvelope = {
        algorithm: 'AES-256-GCM',
        keyVersion: challenge.deliveryEnvelope.keyVersion,
        nonce: Buffer.from(challenge.deliveryEnvelope.nonce),
        ciphertext: Buffer.from(challenge.deliveryEnvelope.ciphertext),
        authTag: Buffer.from(challenge.deliveryEnvelope.authTag),
      }
      const proof = options.encryption.decrypt(envelope, {
        id: challenge._id.toHexString(),
        purpose: 'guest_order_access',
        orderId: challenge.orderId.toHexString(),
        email: challenge.emailNormalized,
        expiresAt: challenge.expiresAt,
        revision: challenge.scopeRevisionAtIssue,
      })
      if (
        proofHash(proof, 'guest_order_access') !== challenge.secretHash ||
        !(await orders.verify(
          undefined,
          challenge.orderId.toHexString(),
          challenge.scopeRevisionAtIssue,
          challenge.emailNormalized,
        )) ||
        challenge.expiresAt <= clock()
      )
        throw new Error('Guest proof delivery unavailable')
      return {
        to: claim.recipient,
        subject: 'Access your SportZone order',
        text: `Use this single-use link to access your order:\n${options.storefrontOrigin}/guest-access#token=${proof}\nThis link expires at ${challenge.expiresAt.toISOString()}. If you did not request it, ignore this email.`,
      }
    },
  }
}
export type GuestProofDelivery = ReturnType<typeof guestProofDelivery>

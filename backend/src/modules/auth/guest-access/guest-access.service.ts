import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Types } from 'mongoose'
import type { GuestAccessOptions } from '../../../config/security.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import type { IdentityNotifications } from '../../notifications/notification.public.js'
import type { GuestOrderAccess } from '../../orders/order.public.js'
import type { IdentityModels } from '../auth.model.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import { createProofCodec, proofHash } from '../verification/proof.crypto.js'
import { guestChallengeInput, guestExchangeInput } from './guest-access.schema.js'
import type { GuestSessions } from './guest-session.service.js'

function createGuestAccessService(
  models: IdentityModels,
  security: BrowserSecurity,
  sessions: GuestSessions,
  orders: Pick<GuestOrderAccess, 'verifyPersistence' | 'lookup' | 'issue' | 'consume'>,
  notifications: Pick<IdentityNotifications, 'verifyIndexes' | 'enqueueGuestAccess'>,
  options: GuestAccessOptions,
  clock: () => Date = () => new Date(),
) {
  const encryption = createProofCodec(options.encryption)
  return {
    async request(raw: unknown, context: string, csrf: string) {
      const input = parseInput(guestChallengeInput, raw),
        started = performance.now(),
        proof = randomBytes(32).toString('base64url')
      try {
        await orders.verifyPersistence()
        await notifications.verifyIndexes()
        return await security.consumeContext('storefront', context, csrf, async (session) => {
          const order = await orders.lookup(session, input.orderNumber, input.email)
          if (!order) return { accepted: true as const }
          const orderId = new Types.ObjectId(order.id)
          const previous = await models.challenges
            .exists({
              purpose: 'guest_order_access',
              orderId,
              createdAt: { $gt: new Date(clock().getTime() - options.cooldownSeconds * 1000) },
            })
            .session(session)
          if (previous) return { accepted: true as const }
          const revision = await orders.issue(session, order.id, order.revision),
            now = clock(),
            expiresAt = new Date(now.getTime() + options.ttlSeconds * 1000),
            id = new Types.ObjectId(),
            notificationId = new Types.ObjectId()
          await models.challenges.updateMany(
            {
              purpose: 'guest_order_access',
              orderId,
              consumedAt: { $exists: false },
              invalidatedAt: { $exists: false },
            },
            { $set: { invalidatedAt: now }, $unset: { deliveryEnvelope: 1 } },
            { session },
          )
          await new models.challenges({
            _id: id,
            purpose: 'guest_order_access',
            secretHash: proofHash(proof, 'guest_order_access'),
            orderId,
            emailNormalized: order.email,
            expiresAt,
            scopeRevisionAtIssue: revision,
            deliveryNotificationId: notificationId,
            createdAt: now,
            updatedAt: now,
            deliveryEnvelope: encryption.encrypt(proof, {
              id: id.toHexString(),
              purpose: 'guest_order_access',
              orderId: order.id,
              email: order.email,
              expiresAt,
              revision,
            }),
          }).save({ session })
          await notifications.enqueueGuestAccess(
            {
              id: notificationId.toHexString(),
              challengeId: id.toHexString(),
              orderId: order.id,
              email: order.email,
            },
            session,
          )
          return { accepted: true as const }
        })
      } finally {
        await delay(Math.max(0, options.responseFloorMs - (performance.now() - started)))
      }
    },
    async exchange(raw: unknown, context: string, csrf: string, previous?: string) {
      const input = parseInput(guestExchangeInput, raw)
      return security.consumeContext('storefront', context, csrf, async (session) => {
        const row = await models.challenges
          .findOne({
            purpose: 'guest_order_access',
            secretHash: proofHash(input.challengeToken, 'guest_order_access'),
            expiresAt: { $gt: clock() },
            consumedAt: { $exists: false },
            invalidatedAt: { $exists: false },
            attemptCount: { $lt: 1 },
          })
          .select('+secretHash +scopeRevisionAtIssue')
          .session(session)
        if (
          !row?.orderId ||
          !(await orders.consume(
            session,
            row.orderId.toHexString(),
            row.scopeRevisionAtIssue,
            row.emailNormalized,
          ))
        )
          throw new ApiError('GUEST_PROOF_REQUIRED')
        const consumed = await models.challenges.updateOne(
          {
            _id: row._id,
            consumedAt: { $exists: false },
            invalidatedAt: { $exists: false },
            expiresAt: { $gt: clock() },
          },
          {
            $set: { consumedAt: clock() },
            $unset: { deliveryEnvelope: 1 },
            $inc: { attemptCount: 1 },
          },
          { session },
        )
        if (consumed.modifiedCount !== 1) throw new ApiError('GUEST_PROOF_REQUIRED')
        return sessions.issueAfterProof(session, row.orderId.toHexString(), previous)
      })
    },
  }
}

export { createGuestAccessService }

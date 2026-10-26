import { Types, type ClientSession, type Connection } from 'mongoose'
import type { z } from 'zod'
import type {
  CheckoutCredentials,
  CheckoutPrincipal,
  checkoutAccess,
} from '../auth/checkout-access.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { orderCreationProof } from '../orders/order.schema.js'
import { checkoutSubmitInput } from './checkout.schema.js'
import {
  checkoutIntentScope,
  checkoutKeyHash,
  checkoutSubmissionFingerprint,
  checkoutOrderOutcome,
} from './checkout-intent.schema.js'
import { checkoutIntentModel } from './checkout-intent.model.js'
import { verifyCheckoutIntentPersistence } from './checkout-intent.persistence.js'
import { checkoutQuoteModel } from './checkout-quote.model.js'
import { verifyCheckoutQuotePersistence } from './checkout-quote.persistence.js'
import type { checkoutQuoteService } from './checkout-quote.service.js'
export type CheckoutCompletion = {
  // Must create the order AND required allocation/payment/notification state in this transaction.
  // No provider calls. No production completion adapter is enabled by this foundation.
  complete(
    session: ClientSession,
    proof: z.output<typeof orderCreationProof>,
    operationKey: string,
  ): Promise<void>
  // Authoritative current order projection, with order/intent/owner checks inside the order owner.
  read(
    session: ClientSession,
    principal: CheckoutPrincipal,
    orderId: string,
    intentId: string,
  ): Promise<unknown>
}
export function checkoutIntentService(
  connection: Connection,
  access: ReturnType<typeof checkoutAccess>,
  quotes: Pick<ReturnType<typeof checkoutQuoteService>, 'revalidate'>,
  completion: CheckoutCompletion,
  clock: () => Date = () => new Date(),
) {
  const intents = checkoutIntentModel(connection),
    quoteModel = checkoutQuoteModel(connection)
  return {
    async submit(credentials: CheckoutCredentials, raw: unknown, key: unknown) {
      const input = parseInput(checkoutSubmitInput, raw),
        idempotencyKeyHash = checkoutKeyHash(key),
        requestFingerprint = checkoutSubmissionFingerprint(input)
      // A duplicate index race aborts its transaction. Re-enter authorization in a fresh transaction
      // to observe the winner; never continue a failed session or retry an external effect.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await access.owned(credentials, async (principal, session) => {
            if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
            const scope = parseInput(checkoutIntentScope, {
              scopeType: principal.scopeType,
              scopeKeyHash: principal.scopeKeyHash,
            })
            try {
              await verifyCheckoutIntentPersistence(connection)
            } catch {
              throw new ApiError('SERVICE_UNAVAILABLE')
            }
            const existing = await intents
              .findOne({ ...scope, idempotencyKeyHash })
              .session(session)
            if (existing) {
              if (existing.requestFingerprint !== requestFingerprint)
                throw new ApiError('IDEMPOTENCY_CONFLICT')
              if (
                !existing.orderId ||
                !existing.resultSnapshot ||
                !existing.orderId.equals(existing.resultSnapshot.orderId) ||
                existing.status === 'preparing'
              )
                throw new ApiError('STATE_CONFLICT')
              // Expired response windows still return the current resource, never reuse the key.
              const result = parseInput(
                checkoutOrderOutcome,
                await completion.read(
                  session,
                  principal,
                  existing.orderId.toHexString(),
                  existing._id.toHexString(),
                ),
              )
              if (result.id !== existing.orderId.toHexString()) throw new ApiError('STATE_CONFLICT')
              return result
            }
            try {
              await verifyCheckoutQuotePersistence(connection)
            } catch {
              throw new ApiError('SERVICE_UNAVAILABLE')
            }
            // Another key cannot expose/rebind the order attached to this quote.
            if (await intents.exists({ quoteId: input.quoteId }).session(session))
              throw new ApiError('STATE_CONFLICT')
            const checked = await quotes.revalidate(principal, input, session),
              intentId = new Types.ObjectId(),
              orderId = new Types.ObjectId(),
              acceptedAt = clock()
            const [intent] = await intents.create(
              [
                {
                  _id: intentId,
                  ...scope,
                  idempotencyKeyHash,
                  requestFingerprint,
                  quoteId: input.quoteId,
                  status: 'preparing',
                },
              ],
              { session },
            )
            if (!intent || checked.quoteId !== input.quoteId) throw new ApiError('STATE_CONFLICT')
            const consumed = await quoteModel.updateOne(
              {
                _id: input.quoteId,
                ...scope,
                status: 'open',
                expiresAt: { $gt: acceptedAt },
                commercialDigest: checked.commercialDigest,
              },
              {
                $set: {
                  status: 'consumed',
                  checkoutIntentId: intentId,
                  orderId,
                  consumedAt: acceptedAt,
                },
                $inc: { revision: 1 },
              },
              { session },
            )
            if (consumed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
            await completion.complete(
              session,
              {
                orderId: orderId.toHexString(),
                checkoutIntentId: intentId.toHexString(),
                quoteId: input.quoteId,
                userId: principal.profile?.id ?? null,
                acceptedAt: acceptedAt.toISOString(),
                commercialDigest: checked.commercialDigest,
                snapshot: checked.snapshot,
                ...(input.notes ? { notes: input.notes } : {}),
              },
              `checkout:${intentId.toHexString()}`,
            )
            const result = parseInput(
              checkoutOrderOutcome,
              await completion.read(
                session,
                principal,
                orderId.toHexString(),
                intentId.toHexString(),
              ),
            )
            if (result.id !== orderId.toHexString()) throw new ApiError('STATE_CONFLICT')
            const recorded = await intents.updateOne(
              { _id: intentId, status: 'preparing' },
              {
                $set: { status: 'order_created', orderId, resultSnapshot: { orderId } },
              },
              { session, runValidators: true },
            )
            if (recorded.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
            return result
          })
        } catch (error) {
          const duplicate =
            typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
          if (duplicate && attempt === 0) continue
          if (duplicate) throw new ApiError('STATE_CONFLICT')
          throw error
        }
      }
      throw new ApiError('STATE_CONFLICT')
    },
  }
}

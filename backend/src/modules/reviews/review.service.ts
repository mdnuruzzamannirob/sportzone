import { createHash, randomUUID } from 'node:crypto'
import { Types, type ClientSession, type Connection, type HydratedDocument } from 'mongoose'
import type { CustomerAccountAccess } from '../auth/customer-account.service.js'
import type { productReviewAccess } from '../catalog/products/product.service.js'
import { inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { reviewModel, type ReviewRecord } from './review.model.js'
import { verifyReviewPersistence } from './review.persistence.js'
import {
  purchaseProof,
  reviewCreate,
  reviewEdit,
  reviewId,
  reviewModeration,
  moderationKey,
  moderationReceipt,
} from './review.schema.js'

export type ReviewAudit = {
  actorType: 'customer' | 'admin'
  actorId: string
  action: string
  targetType: 'review'
  targetId: string
  operationKey: string
  occurredAt: Date
  beforeDigest?: string
  afterDigest: string
  reason?: string
}
type Dependencies = {
  accounts: CustomerAccountAccess
  catalog: ReturnType<typeof productReviewAccess>
  audit(session: ClientSession, event: ReviewAudit): Promise<void>
  // Trusted owning purchase capability must check delivered eligibility and fence its
  // durable evidence in this session. No adapter means no verified review creation.
  eligibility?(
    session: ClientSession,
    selection: { userId: string; productId: string; qualifyingOrderItemId: string },
  ): Promise<unknown>
  moderator?(token: string | undefined, session: ClientSession): Promise<string>
  moderationReceipt?(
    session: ClientSession,
    identity: { actorId: string; reviewId: string; operationKey: string },
  ): Promise<unknown>
}
const digest = (row: HydratedDocument<ReviewRecord>) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        rating: row.rating,
        comment: row.comment,
        status: row.status,
        isActive: row.isActive,
      }),
    )
    .digest('hex')
const dto = (row: HydratedDocument<ReviewRecord>) => ({
  id: row._id.toHexString(),
  productId: row.productId.toHexString(),
  rating: row.rating,
  comment: row.comment,
  status: row.status,
  verifiedPurchase: true,
})
export function createReviewService(
  connection: Connection,
  dependencies: Dependencies,
  clock: () => Date = () => new Date(),
) {
  const reviews = reviewModel(connection)
  async function verify() {
    try {
      await verifyReviewPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  const now = () => {
    const value = clock()
    if (!Number.isFinite(value.getTime())) throw new ApiError('STATE_CONFLICT')
    return value
  }
  async function summary(session: ClientSession, productId: string) {
    const [row] = await reviews
      .aggregate<{ count: number; average: number }>([
        {
          $match: { productId: new Types.ObjectId(productId), isActive: true, status: 'approved' },
        },
        { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
      ])
      .session(session)
    await dependencies.catalog.saveSummary(session, productId, {
      count: row?.count ?? 0,
      average: row?.average ?? 0,
    })
  }
  async function record(
    session: ClientSession,
    row: HydratedDocument<ReviewRecord>,
    actorType: 'customer' | 'admin',
    actorId: string,
    action: string,
    before?: string,
    reason?: string,
    operationKey: string = randomUUID(),
  ) {
    await dependencies.audit(session, {
      actorType,
      actorId,
      action,
      targetType: 'review',
      targetId: row._id.toHexString(),
      operationKey,
      occurredAt: now(),
      ...(before ? { beforeDigest: before } : {}),
      afterDigest: digest(row),
      ...(reason ? { reason } : {}),
    })
  }
  return {
    async create(token: string | undefined, productId: string, raw: unknown) {
      const product = parseInput(reviewId, productId),
        input = parseInput(reviewCreate, raw)
      return dependencies.accounts.owned(token, async (user, { transaction }) => {
        await verify()
        const selection = {
          userId: user.id,
          productId: product,
          qualifyingOrderItemId: input.qualifyingOrderItemId,
        }
        const evidence = dependencies.eligibility
          ? await dependencies.eligibility(transaction, selection)
          : null
        const parsed = purchaseProof.safeParse(evidence)
        if (
          !parsed.success ||
          parsed.data.userId !== selection.userId ||
          parsed.data.productId !== product ||
          parsed.data.qualifyingOrderItemId !== input.qualifyingOrderItemId
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        await dependencies.catalog.lock(transaction, product)
        if (
          await reviews
            .exists({
              userId: new Types.ObjectId(user.id),
              productId: new Types.ObjectId(product),
              isActive: true,
            })
            .session(transaction)
        )
          throw new ApiError('STATE_CONFLICT')
        const [row] = await reviews.create(
          [
            {
              userId: new Types.ObjectId(user.id),
              productId: new Types.ObjectId(product),
              orderId: new Types.ObjectId(parsed.data.orderId),
              qualifyingOrderItemId: new Types.ObjectId(input.qualifyingOrderItemId),
              rating: input.rating,
              comment: input.comment,
              status: 'pending',
              isActive: true,
            },
          ],
          { session: transaction },
        )
        if (!row) throw new ApiError('STATE_CONFLICT')
        await record(transaction, row, 'customer', user.id, 'review.create')
        return dto(row)
      })
    },
    async readOwn(token: string | undefined, id: string) {
      const parsed = parseInput(reviewId, id)
      return dependencies.accounts.owned(
        token,
        async (user, { transaction }) => {
          await verify()
          const row = await reviews
            .findOne({ _id: new Types.ObjectId(parsed), userId: new Types.ObjectId(user.id) })
            .session(transaction)
          if (!row) throw new ApiError('NOT_FOUND')
          return dto(row)
        },
        false,
      )
    },
    async edit(token: string | undefined, id: string, raw: unknown) {
      const parsed = parseInput(reviewId, id),
        input = parseInput(reviewEdit, raw)
      return dependencies.accounts.owned(token, async (user, { transaction }) => {
        await verify()
        const row = await reviews
          .findOne({
            _id: new Types.ObjectId(parsed),
            userId: new Types.ObjectId(user.id),
            isActive: true,
          })
          .session(transaction)
        if (!row) throw new ApiError('NOT_FOUND')
        if (
          (input.rating === undefined || input.rating === row.rating) &&
          (input.comment === undefined || input.comment === row.comment)
        )
          return dto(row)
        const before = digest(row)
        await dependencies.catalog.lock(transaction, row.productId.toHexString())
        if (input.rating !== undefined) row.rating = input.rating
        if (input.comment !== undefined) row.comment = input.comment
        row.status = 'pending'
        row.set('moderatedAt', undefined)
        row.set('moderationReason', undefined)
        await row.save({ session: transaction })
        await summary(transaction, row.productId.toHexString())
        await record(transaction, row, 'customer', user.id, 'review.edit', before)
        return dto(row)
      })
    },
    async moderate(token: string | undefined, id: string, raw: unknown, operationKey: string) {
      const parsed = parseInput(reviewId, id),
        input = parseInput(reviewModeration, raw),
        moderator = dependencies.moderator
      const key = parseInput(moderationKey, operationKey),
        receiptAccess = dependencies.moderationReceipt
      if (!moderator || !receiptAccess) throw new ApiError('FORBIDDEN')
      return inTransaction(connection, async (transaction) => {
        await verify()
        const actor = parseInput(reviewId, await moderator(token, transaction))
        const cause = createHash('sha256')
          .update(JSON.stringify({ actorId: actor, reviewId: parsed, key }))
          .digest('hex')
        const row = await reviews
          .findOne({ _id: new Types.ObjectId(parsed), isActive: true })
          .session(transaction)
        if (!row) throw new ApiError('NOT_FOUND')
        const existing = await receiptAccess(transaction, {
          actorId: actor,
          reviewId: parsed,
          operationKey: cause,
        })
        if (existing !== null && existing !== undefined) {
          const receipt = parseInput(moderationReceipt, existing)
          if (
            receipt.actorId !== actor ||
            receipt.targetId !== parsed ||
            receipt.operationKey !== cause ||
            receipt.action !== `review.${input.decision}` ||
            receipt.reason !== input.reason
          )
            throw new ApiError('STATE_CONFLICT')
          return dto(row) // An old approval retry must never approve later authored edits.
        }
        await dependencies.catalog.lock(transaction, row.productId.toHexString())
        const status =
          input.decision === 'approve'
            ? 'approved'
            : input.decision === 'reject'
              ? 'rejected'
              : 'hidden'
        const before = digest(row)
        row.status = status
        row.moderationReason = input.reason
        row.moderatedAt = now()
        await row.save({ session: transaction })
        await summary(transaction, row.productId.toHexString())
        await record(
          transaction,
          row,
          'admin',
          actor,
          `review.${input.decision}`,
          before,
          input.reason,
          cause,
        )
        return dto(row)
      })
    },
  }
}

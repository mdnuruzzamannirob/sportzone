import {
  adminReviewView,
  reviewId,
  reviewAdminQuery as adminQuery,
  reviewView,
  purchaseProof,
  reviewCreate,
  reviewEdit,
  reviewModeration,
  moderationKey,
  moderationReceipt,
} from './review.schema.js'
import { Types, type ClientSession, type Connection, type HydratedDocument } from 'mongoose'
import type { CustomerAccountAccess, AdminAccountAccess } from '../auth/auth.public.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paginationSchema, pageMeta } from '../../shared/pagination.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { inTransaction } from '../../shared/database/transaction.js'
import { reviewModel, type ReviewRecord } from './review.model.js'
import { verifyReviewPersistence } from './review.persistence.js'
import { createHash, randomUUID } from 'node:crypto'
import type { productReviewAccess } from '../catalog/products/product.service.js'

const empty = paginationSchema

// Explicit projection: customer/order/identity/moderation details never enter public views.
function publicView(row: {
  _id: Types.ObjectId
  productId: Types.ObjectId
  rating: number
  comment: string
  status: string
  createdAt: Date
}) {
  return reviewView.parse({
    id: row._id.toHexString(),
    productId: row.productId.toHexString(),
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    verifiedPurchase: true as const,
  })
}

function createReviewQueryService(
  connection: Connection,
  customers: CustomerAccountAccess,
  admins: AdminAccountAccess,
  publicVisibility?: (session: ClientSession, productId: string) => Promise<boolean>,
) {
  const reviews = reviewModel(connection)
  return {
    async publicList(rawId: unknown, raw: unknown) {
      const productId = parseInput(reviewId, rawId),
        query = parseInput(empty, raw)
      if (!publicVisibility) throw new ApiError('SERVICE_UNAVAILABLE')
      return inTransaction(connection, async (session) => {
        if (!(await publicVisibility(session, productId))) throw new ApiError('NOT_FOUND')
        await verifyReviewPersistence(connection)
        const filter = {
          productId: new Types.ObjectId(productId),
          status: 'approved' as const,
          isActive: true,
        }
        const rows = await reviews
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .session(session)
        return {
          items: rows.map(publicView),
          pagination: pageMeta(query, await reviews.countDocuments(filter).session(session)),
        }
      })
    },
    async ownList(token: string | undefined, raw: unknown) {
      const query = parseInput(empty, raw)
      return customers.owned(
        token,
        async (profile, { transaction }) => {
          await verifyReviewPersistence(connection)
          const filter = { userId: new Types.ObjectId(profile.id), isActive: true }
          const rows = await reviews
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((query.page - 1) * query.pageSize)
            .limit(query.pageSize)
            .session(transaction)
          return {
            items: rows.map(publicView),
            pagination: pageMeta(query, await reviews.countDocuments(filter).session(transaction)),
          }
        },
        false,
      )
    },
    async adminList(token: string | undefined, raw: unknown) {
      const query = parseInput(adminQuery, raw)
      return admins.owned(
        token,
        async (_actorId, session) => {
          await verifyReviewPersistence(connection)
          const filter = {
            isActive: true,
            ...(query.status ? { status: query.status } : {}),
            ...(query.productId ? { productId: new Types.ObjectId(query.productId) } : {}),
          }
          const rows = await reviews
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((query.page - 1) * query.pageSize)
            .limit(query.pageSize)
            .session(session)
          return {
            items: rows.map((row) =>
              adminReviewView.parse({
                ...publicView(row),
                userId: row.userId.toHexString(),
                orderId: row.orderId.toHexString(),
                ...(row.moderationReason ? { moderationReason: row.moderationReason } : {}),
                ...(row.moderatedAt ? { moderatedAt: row.moderatedAt.toISOString() } : {}),
              }),
            ),
            pagination: pageMeta(query, await reviews.countDocuments(filter).session(session)),
          }
        },
        false,
      )
    },
  }
}

type ReviewAudit = {
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
    selection: {
      userId: string
      productId: string
      qualifyingOrderItemId: string
    },
  ): Promise<unknown>
  moderator?(token: string | undefined, session: ClientSession): Promise<string>
  moderationReceipt?(
    session: ClientSession,
    identity: {
      actorId: string
      reviewId: string
      operationKey: string
    },
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

const dto = (row: HydratedDocument<ReviewRecord>) =>
  reviewView.parse({
    id: row._id.toHexString(),
    productId: row.productId.toHexString(),
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    verifiedPurchase: true,
  })

function createReviewService(
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
      .aggregate<{
        count: number
        average: number
      }>([
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

export { createReviewQueryService, createReviewService }
export type { ReviewAudit }

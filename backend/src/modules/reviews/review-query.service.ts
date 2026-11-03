import { adminReviewView } from './review.schema.js'
import { Types, type ClientSession, type Connection } from 'mongoose'
import type { CustomerAccountAccess } from '../auth/auth.public.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paginationSchema, pageMeta } from '../../shared/pagination.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { inTransaction } from '../../shared/database/transaction.js'
import { reviewId, reviewAdminQuery as adminQuery, reviewView } from './review.schema.js'
import { reviewModel } from './review.model.js'
import { verifyReviewPersistence } from './review.persistence.js'

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
export function reviewQueryService(
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

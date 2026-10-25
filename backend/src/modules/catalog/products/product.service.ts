import type { ClientSession, Connection, Types } from 'mongoose'
import { ApiError } from '../../../shared/errors/app-error.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import type { categoryService } from '../categories/category.service.js'
import { productModels } from './product.model.js'
import { attributeSignature, productInput, variantBatch } from './product.schema.js'

export function productService(
  connection: Connection,
  categories: Pick<ReturnType<typeof categoryService>, 'guardAncestry'>,
) {
  const models = productModels(connection)
  return {
    // Internal aggregate creation, not an alternate HTTP DTO. HTTP adapters remain P04-005.
    async create(product: unknown, variants: unknown) {
      const parsed = productInput.safeParse(product)
      const batch = variantBatch.safeParse(variants)
      if (!parsed.success || !batch.success) throw new ApiError('VALIDATION_FAILED')
      const data = parsed.data
      if (data.status === 'active' && !batch.data.some((variant) => variant.status === 'active'))
        throw new ApiError('STATE_CONFLICT')
      return inTransaction(connection, async (session) => {
        for (const categoryId of data.categoryIds) {
          await categories.guardAncestry(categoryId, session, undefined, data.status === 'active')
        }
        const saved = await new models.products(data).save({ session })
        const savedVariants = []
        for (const variant of batch.data) {
          const { sku, ...details } = variant
          savedVariants.push(
            await new models.variants({
              ...details,
              skuNormalized: sku,
              productId: saved._id,
              attributeSignature: attributeSignature(variant.attributes),
            }).save({ session }),
          )
        }
        return { product: saved, variants: savedVariants }
      })
    },
    async hasCategoryReferences(categoryId: Types.ObjectId, session: ClientSession) {
      return Boolean(await models.products.exists({ categoryIds: categoryId }).session(session))
    },
  }
}

// Narrow rating-only capability. Reviews never import or write catalog persistence directly.
export function productReviewAccess(connection: Connection) {
  const products = productModels(connection).products
  return {
    async lock(session: ClientSession, id: string) {
      if (!session.inTransaction() || !/^[a-f0-9]{24}$/.test(id))
        throw new ApiError('STATE_CONFLICT')
      const row = await products.findOneAndUpdate(
        { _id: id, revision: { $gte: 0, $lt: Number.MAX_SAFE_INTEGER } },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('NOT_FOUND')
    },
    async saveSummary(
      session: ClientSession,
      id: string,
      value: { count: number; average: number },
    ) {
      if (
        !session.inTransaction() ||
        !Number.isSafeInteger(value.count) ||
        value.count < 0 ||
        !Number.isFinite(value.average) ||
        value.average < 0 ||
        value.average > 5 ||
        (value.count === 0 ? value.average !== 0 : value.average < 1)
      )
        throw new ApiError('STATE_CONFLICT')
      const result = await products.updateOne(
        { _id: id },
        { $set: { ratingSummary: { approvedCount: value.count, average: value.average } } },
        { session, runValidators: true },
      )
      if (result.matchedCount !== 1) throw new ApiError('NOT_FOUND')
    },
  }
}

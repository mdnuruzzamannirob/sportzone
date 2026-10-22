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

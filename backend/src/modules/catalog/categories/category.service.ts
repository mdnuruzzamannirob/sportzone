import { verifyDeclaredIndexes } from '../../../shared/database/indexes.js'
import type { Types, ClientSession, Connection } from 'mongoose'
import { id, createInput, patchInput, parse } from './category.schema.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import { categoryModel, type Category } from './category.model.js'

export function categoryService(connection: Connection) {
  const model = categoryModel(connection)
  // Touching ancestry creates write conflicts with concurrent reparent/deactivate/delete.
  // Product association writers must use this capability in their own transaction too.
  async function guardAncestry(
    categoryId: Types.ObjectId,
    session: ClientSession,
    forbidden?: Types.ObjectId,
    requireActive = false,
  ) {
    const visited = new Set<string>()
    let current: Types.ObjectId | undefined = categoryId
    while (current) {
      if (current.equals(forbidden) || visited.has(current.toHexString()))
        throw new ApiError('STATE_CONFLICT')
      visited.add(current.toHexString())
      const category: Category | null = await model.findById(current).session(session).lean()
      if (!category) throw new ApiError('NOT_FOUND')
      if (requireActive && category.status !== 'active') throw new ApiError('STATE_CONFLICT')
      if (
        !Number.isSafeInteger(category.revision) ||
        category.revision < 0 ||
        category.revision >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      const changed = await model.updateOne(
        { _id: current, revision: { $gte: 0, $lt: Number.MAX_SAFE_INTEGER } },
        { $inc: { revision: 1 } },
        { session },
      )
      if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      current = category.parentId ?? undefined
    }
  }
  return {
    guardAncestry,
    verify: () => verifyDeclaredIndexes(model),
    async create(
      input: unknown,
      transaction?: ClientSession,
      image?: { publicId: string; url: string; alt: string },
      categoryId?: Types.ObjectId,
    ) {
      const data = parse(createInput, input)
      const apply = async (session: ClientSession) => {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        if (data.parentId) await guardAncestry(data.parentId, session)
        const category = await new model({
          ...data,
          ...(categoryId ? { _id: categoryId } : {}),
          ...(image ? { image } : {}),
          parentId: data.parentId ?? undefined,
        }).save({ session })
        return category
      }
      return transaction ? apply(transaction) : inTransaction(connection, apply)
    },
    async patch(
      categoryId: string,
      revision: number,
      input: unknown,
      transaction?: ClientSession,
      image?: { publicId: string; url: string; alt: string } | null,
    ) {
      const key = parse(id, categoryId)
      const data = parse(patchInput, input)
      const apply = async (session: ClientSession) => {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        if (data.parentId) await guardAncestry(data.parentId, session, key)
        const { parentId, ...metadata } = data
        const category = await model.findOneAndUpdate(
          { _id: key, revision, $expr: { $lt: ['$revision', Number.MAX_SAFE_INTEGER] } },
          {
            $set: { ...metadata, ...(parentId ? { parentId } : {}), ...(image ? { image } : {}) },
            ...(parentId === null || image === null
              ? {
                  $unset: {
                    ...(parentId === null ? { parentId: 1 } : {}),
                    ...(image === null ? { image: 1 } : {}),
                  },
                }
              : {}),
            $inc: { revision: 1 },
          },
          { session, returnDocument: 'after', runValidators: true },
        )
        if (!category) throw new ApiError('STATE_CONFLICT')
        return category
      }
      return transaction ? apply(transaction) : inTransaction(connection, apply)
    },
    async remove(
      categoryId: string,
      revision: number,
      hasProductReferences: (id: Types.ObjectId, session: ClientSession) => Promise<boolean>,
    ) {
      const key = parse(id, categoryId)
      return inTransaction(connection, async (session) => {
        const category = await model.findOneAndUpdate(
          { _id: key, revision },
          { $inc: { revision: 1 } },
          { session },
        )
        if (!category) throw new ApiError('STATE_CONFLICT')
        if (
          category.image ||
          (await model.exists({ parentId: key }).session(session)) ||
          (await hasProductReferences(key, session))
        ) {
          throw new ApiError('STATE_CONFLICT')
        }
        await model.deleteOne({ _id: key }, { session })
      })
    },
    async publicCategories() {
      const categories = await model.find().sort({ sortOrder: 1, slug: 1 }).lean()
      const byId = new Map(categories.map((category) => [category._id.toHexString(), category]))
      return categories.filter((category) => {
        const visited = new Set<string>()
        let current: typeof category | undefined = category
        while (current) {
          const key = current._id.toHexString()
          if (current.status !== 'active' || visited.has(key)) return false
          visited.add(key)
          if (!current.parentId) return true
          current = byId.get(current.parentId.toHexString())
        }
        return false
      })
    },
  }
}

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
      await model.updateOne({ _id: current }, { $inc: { revision: 1 } }, { session })
      current = category.parentId ?? undefined
    }
  }
  return {
    guardAncestry,
    async create(input: unknown) {
      const data = parse(createInput, input)
      return inTransaction(connection, async (session) => {
        if (data.parentId) await guardAncestry(data.parentId, session)
        const category = await new model({
          ...data,
          parentId: data.parentId ?? undefined,
        }).save({ session })
        return category
      })
    },
    async patch(categoryId: string, revision: number, input: unknown) {
      const key = parse(id, categoryId)
      const data = parse(patchInput, input)
      return inTransaction(connection, async (session) => {
        if (data.parentId) await guardAncestry(data.parentId, session, key)
        const { parentId, ...metadata } = data
        const category = await model.findOneAndUpdate(
          { _id: key, revision },
          {
            $set: { ...metadata, ...(parentId ? { parentId } : {}) },
            ...(parentId === null ? { $unset: { parentId: 1 } } : {}),
            $inc: { revision: 1 },
          },
          { session, returnDocument: 'after', runValidators: true },
        )
        if (!category) throw new ApiError('STATE_CONFLICT')
        return category
      })
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

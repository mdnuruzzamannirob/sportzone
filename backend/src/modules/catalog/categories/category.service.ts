import { verifyDeclaredIndexes } from '../../../shared/database/indexes.js'
import { Types, type ClientSession, type Connection } from 'mongoose'
import {
  id,
  createInput,
  patchInput,
  parse,
  adminCategory,
  categoryCreate,
  categoryPatch,
  categoryDeactivate,
  categoryParams,
  categoryListQuery,
} from './category.schema.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import { categoryModel, type Category } from './category.model.js'
import { createHash, randomUUID } from 'node:crypto'
import { parseInput } from '../../../shared/middleware/validate.js'
import { pageMeta } from '../../../shared/pagination.js'
import { parseRevision } from '../../../shared/preconditions.js'
import type { AdminAccountAccess } from '../../auth/auth.public.js'
import type { MediaService } from '../../media/media.service.js'

function createCategoryService(connection: Connection) {
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
      image?: {
        publicId: string
        url: string
        alt: string
      },
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
      image?: {
        publicId: string
        url: string
        alt: string
      } | null,
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

function createCategoryAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  media?: Pick<MediaService, 'changePublicReference'>,
) {
  const model = categoryModel(connection),
    categories = createCategoryService(connection)
  type Category = ReturnType<typeof model.hydrate>
  function view(row: Category) {
    return parseInput(adminCategory, {
      id: row._id.toHexString(),
      name: row.name,
      slug: row.slug,
      ...(row.parentId ? { parentId: row.parentId.toHexString() } : {}),
      status: row.status,
      sortOrder: row.sortOrder,
      revision: row.revision,
      ...(row.image
        ? { image: { publicId: row.image.publicId, url: row.image.url, alt: row.image.alt } }
        : {}),
    })
  }
  async function verify() {
    try {
      await categories.verify()
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  const digest = (raw: unknown) => createHash('sha256').update(JSON.stringify(raw)).digest('hex')
  async function write(
    token: string | undefined,
    raw: unknown,
    categoryId?: string,
    match?: string,
    reason?: string,
  ) {
    const cause = randomUUID(),
      revision = parseRevision(match)
    if (categoryId) {
      parseInput(categoryParams, { categoryId })
      if (revision === undefined) throw new ApiError('PRECONDITION_REQUIRED')
      if (!Number.isSafeInteger(revision)) throw new ApiError('PRECONDITION_FAILED')
    }
    const input = categoryId ? parseInput(categoryPatch, raw) : parseInput(categoryCreate, raw)
    try {
      return await access.owned(token, async (actorId, session) => {
        await verify()
        const current = categoryId ? await model.findById(categoryId).session(session) : null
        if (categoryId && !current) throw new ApiError('NOT_FOUND')
        if (current && current.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        if (current && current.revision >= Number.MAX_SAFE_INTEGER)
          throw new ApiError('STATE_CONFLICT')
        const before = current ? view(current) : undefined
        const targetId = current?._id ?? new Types.ObjectId(),
          { image, ...metadata } = input
        let saved: Category | undefined
        const mutate = async (
          resolved?: {
            publicId: string
            url: string
            alt: string
          } | null,
        ) => {
          saved = current
            ? await categories.patch(
                targetId.toHexString(),
                current.revision,
                metadata,
                session,
                resolved,
              )
            : await categories.create(metadata, session, resolved ?? undefined, targetId)
        }
        if (image !== undefined && (image !== null || current?.image)) {
          if (!media) throw new ApiError('SERVICE_UNAVAILABLE')
          const fallback = [...(input.name ?? current?.name ?? '')].slice(0, 120).join('')
          await media.changePublicReference(
            token,
            current?.image?.publicId,
            image ? { ...image, alt: image.alt || fallback } : null,
            { targetType: 'category', targetId, slot: 'image' },
            session,
            mutate,
          )
        } else await mutate(image)
        if (!saved) throw new ApiError('STATE_CONFLICT')
        const result = view(saved)
        await audit(session, {
          actorType: 'admin',
          actorId,
          action: reason
            ? 'category.deactivate'
            : categoryId
              ? 'category.update'
              : 'category.create',
          targetType: 'category',
          targetId: result.id,
          operationKey: cause,
          occurredAt: new Date(),
          ...(before ? { beforeDigest: digest(before) } : {}),
          afterDigest: digest(result),
          ...(reason ? { reason } : {}),
        })
        return result
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  return {
    create: (token: string | undefined, raw: unknown) => write(token, raw),
    patch: (token: string | undefined, id: string, raw: unknown, match?: string) =>
      write(token, raw, id, match),
    deactivate(token: string | undefined, id: string, raw: unknown, match?: string) {
      const input = parseInput(categoryDeactivate, raw)
      return write(token, { status: 'inactive' }, id, match, input.reason)
    },
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(categoryListQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const filter = input.status ? { status: input.status } : {}
          const total = await model.countDocuments(filter).session(session)
          const rows = await model
            .find(filter)
            .sort({ sortOrder: 1, _id: 1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return { data: rows.map(view), page: pageMeta(input, total) }
        },
        false,
      )
    },
  }
}

export { createCategoryAdminService, createCategoryService }

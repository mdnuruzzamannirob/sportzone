import { createHash, randomUUID } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import { pageMeta } from '../../../shared/pagination.js'
import { parseRevision } from '../../../shared/preconditions.js'
import type { AdminAccountAccess } from '../../auth/admin-account.service.js'
import type { MediaService } from '../../media/media.service.js'
import { categoryModel } from './category.model.js'
import { categoryService } from './category.service.js'
import {
  adminCategory,
  categoryCreate,
  categoryPatch,
  categoryDeactivate,
  categoryParams,
  categoryListQuery,
} from './category-admin.schema.js'

export function categoryAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  media?: Pick<MediaService, 'changePublicReference'>,
) {
  const model = categoryModel(connection),
    categories = categoryService(connection)
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
        const mutate = async (resolved?: { publicId: string; url: string; alt: string } | null) => {
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

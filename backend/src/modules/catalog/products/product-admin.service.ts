import { createHash, randomUUID } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import { pageMeta } from '../../../shared/pagination.js'
import { parseRevision } from '../../../shared/preconditions.js'
import type { AdminAccountAccess } from '../../auth/admin-account.service.js'
import type { MediaService } from '../../media/media.service.js'
import { categoryService } from '../categories/category.service.js'
import { productModels } from './product.model.js'
import { productService } from './product.service.js'
import { verifyProductPersistence } from './product.persistence.js'
import {
  productCreate,
  productPatch,
  productDeactivate,
  productParams,
  productListQuery,
  adminProduct,
  adminProductDetail,
} from './product-admin.schema.js'
import {
  variantInput,
  variantPatch,
  variantParams,
  variantDeactivate,
  variantBatch,
  attributeSignature,
  adminVariant,
} from '../variants/variant.schema.js'

export function productAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  media?: Pick<MediaService, 'changePublicReference'>,
) {
  const models = productModels(connection),
    categories = categoryService(connection),
    products = productService(connection, categories)
  type Product = ReturnType<typeof models.products.hydrate>
  type Variant = ReturnType<typeof models.variants.hydrate>
  const hash = (raw: unknown) => createHash('sha256').update(JSON.stringify(raw)).digest('hex')
  function expected(raw: string | undefined) {
    const v = parseRevision(raw)
    if (v === undefined) throw new ApiError('PRECONDITION_REQUIRED')
    if (!Number.isSafeInteger(v)) throw new ApiError('PRECONDITION_FAILED')
    return v
  }
  async function verify() {
    try {
      await verifyProductPersistence(connection)
      await categories.verify()
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  function view(row: Product) {
    return parseInput(adminProduct, {
      id: row._id.toHexString(),
      name: row.name,
      slug: row.slug,
      description: row.description,
      categoryIds: row.categoryIds.map(String),
      images: row.images.map((i) => ({ publicId: i.publicId, url: i.url, alt: i.alt })),
      status: row.status,
      featured: row.featured,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })
  }
  function variantConfig(row: Variant) {
    return {
      sku: row.skuNormalized,
      attributes: Object.fromEntries(row.attributes ?? []),
      regularPricePoisha: row.regularPricePoisha,
      ...(row.salePricePoisha != null ? { salePricePoisha: row.salePricePoisha } : {}),
      status: row.status,
    }
  }
  function variantView(row: Variant) {
    return parseInput(adminVariant, {
      id: row._id.toHexString(),
      productId: row.productId.toHexString(),
      ...variantConfig(row),
      revision: row.revision,
      stock: {
        physical: row.stock.physical,
        reserved: row.stock.reserved,
        committed: row.stock.committed,
        available: row.stock.physical - row.stock.reserved - row.stock.committed,
      },
      ...(row.lowStockThreshold != null ? { lowStockThreshold: row.lowStockThreshold } : {}),
    })
  }
  async function record(
    session: ClientSession,
    actorId: string,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
    cause: string,
    reason?: string,
  ) {
    await audit(session, {
      actorType: 'admin',
      actorId,
      action,
      targetType: action.startsWith('variant.') ? 'variant' : 'product',
      targetId: id,
      operationKey: cause,
      occurredAt: new Date(),
      ...(before ? { beforeDigest: hash(before) } : {}),
      afterDigest: hash(after),
      ...(reason ? { reason } : {}),
    })
  }
  async function gallery(
    token: string | undefined,
    id: Types.ObjectId,
    previous: readonly { publicId: string; url: string; alt: string; position: number }[],
    incoming: { publicId: string; url: string; alt?: string | undefined }[] | undefined,
    name: string,
    session: ClientSession,
  ) {
    if (incoming === undefined)
      return previous.map((i) => ({
        publicId: i.publicId,
        url: i.url,
        alt: i.alt,
        position: i.position,
      }))
    if ((incoming.length || previous.length) && !media) throw new ApiError('SERVICE_UNAVAILABLE')
    const result: { publicId: string; url: string; alt: string; position: number }[] = []
    const ordered = [...previous].sort((a, b) => a.position - b.position)
    // Detach the old gallery first so reordering a fully shared asset does not need
    // a temporary 41st reference. The outer transaction keeps targets/ledger atomic.
    for (const [i, old] of ordered.entries()) {
      if (!media) throw new ApiError('SERVICE_UNAVAILABLE')
      await media.changePublicReference(
        token,
        old.publicId,
        null,
        { targetType: 'product', targetId: id, slot: `image:${i}` },
        session,
        async () => {},
      )
    }
    for (const [i, next] of incoming.entries()) {
      if (!media) throw new ApiError('SERVICE_UNAVAILABLE')
      await media.changePublicReference(
        token,
        undefined,
        { ...next, alt: next.alt || name },
        { targetType: 'product', targetId: id, slot: `image:${i}` },
        session,
        async (resolved) => {
          if (resolved) result.push({ ...resolved, position: i })
        },
      )
    }
    return result
  }
  async function writeProduct(
    token: string | undefined,
    raw: unknown,
    id?: string,
    match?: string,
    reason?: string,
  ) {
    const cause = randomUUID(),
      revision = id ? expected(match) : undefined
    if (id) parseInput(productParams, { productId: id })
    const input = id ? parseInput(productPatch, raw) : parseInput(productCreate, raw)
    try {
      return await access.owned(token, async (actorId, session) => {
        await verify()
        const current = id ? await models.products.findById(id).session(session) : null
        if (id && !current) throw new ApiError('NOT_FOUND')
        if (current && current.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        if (current && current.revision >= Number.MAX_SAFE_INTEGER)
          throw new ApiError('STATE_CONFLICT')
        const before = current ? view(current) : undefined,
          targetId = current?._id ?? new Types.ObjectId()
        const images = input.images
        const resolved = await gallery(
          token,
          targetId,
          current?.images ?? [],
          images,
          input.name ?? current?.name ?? '',
          session,
        )
        let saved: Product
        if (!current) {
          const creation = parseInput(productCreate, raw),
            { variants, images: _images, ...fields } = creation
          saved = (await products.create(fields, variants, session, targetId, resolved)).product
        } else {
          // variants are accepted only at creation; PATCH cannot change SKU identities or stock.
          const changes = parseInput(productPatch, raw),
            { images: _images, ...fields } = changes
          current.set(fields)
          if (images !== undefined) current.set('images', resolved)
          for (const categoryId of current.categoryIds)
            await categories.guardAncestry(
              categoryId,
              session,
              undefined,
              current.status === 'active',
            )
          if (
            current.status === 'active' &&
            !(await models.variants
              .exists({ productId: current._id, status: 'active' })
              .session(session))
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          current.revision += 1
          saved = await current.save({ session })
        }
        const result = view(saved)
        await record(
          session,
          actorId,
          reason ? 'product.deactivate' : id ? 'product.update' : 'product.create',
          result.id,
          before,
          result,
          cause,
          reason,
        )
        return result
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  async function writeVariant(
    token: string | undefined,
    raw: unknown,
    id: string,
    match?: string,
    create = false,
    reason?: string,
  ) {
    parseInput(
      create ? productParams : variantParams,
      create ? { productId: id } : { variantId: id },
    )
    const revision = create ? undefined : expected(match),
      cause = randomUUID()
    if (create) parseInput(variantInput, raw)
    else parseInput(variantPatch, raw)
    try {
      return await access.owned(token, async (actorId, session) => {
        await verify()
        const existing = create ? null : await models.variants.findById(id).session(session)
        if (!create && !existing) throw new ApiError('NOT_FOUND')
        if (existing && existing.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        if (existing && existing.revision >= Number.MAX_SAFE_INTEGER)
          throw new ApiError('STATE_CONFLICT')
        const product = await models.products
          .findById(create ? id : existing?.productId)
          .session(session)
        if (!product) throw new ApiError('NOT_FOUND')
        if (product.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
        const fenced = await models.products.updateOne(
          { _id: product._id, revision: product.revision },
          { $inc: { revision: 1 } },
          { session },
        )
        if (fenced.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        const before = existing ? variantView(existing) : undefined
        let saved: Variant
        if (create) {
          const creation = parseInput(variantInput, raw)
          const siblings = await models.variants
            .find({ productId: product._id })
            .limit(101)
            .session(session)
          parseInput(variantBatch, [...siblings.map(variantConfig), creation])
          const { sku, ...details } = creation
          saved = new models.variants({
            ...details,
            skuNormalized: sku,
            productId: product._id,
            attributeSignature: attributeSignature(creation.attributes),
          })
        } else {
          if (!existing) throw new ApiError('NOT_FOUND')
          const changes = parseInput(variantPatch, raw)
          const { salePricePoisha, lowStockThreshold, ...fields } = changes
          existing.set(fields)
          if (salePricePoisha !== undefined)
            existing.set('salePricePoisha', salePricePoisha === null ? undefined : salePricePoisha)
          if (lowStockThreshold !== undefined)
            existing.set(
              'lowStockThreshold',
              lowStockThreshold === null ? undefined : lowStockThreshold,
            )
          saved = existing
        }
        if (saved.salePricePoisha != null && saved.salePricePoisha > saved.regularPricePoisha)
          throw new ApiError('VALIDATION_FAILED')
        if (product.status === 'active') {
          if (
            saved.status !== 'active' &&
            !(await models.variants
              .exists({ productId: product._id, status: 'active', _id: { $ne: saved._id } })
              .session(session))
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          // Preserve threshold-only and administrative price edits even when ancestry is hidden;
          // newly enabled purchasability must revalidate active category assignments.
          if (
            (create && saved.status === 'active') ||
            (existing?.status !== before?.status && saved.status === 'active')
          )
            for (const categoryId of product.categoryIds)
              await categories.guardAncestry(categoryId, session, undefined, true)
        }
        if (existing) saved.revision += 1
        await saved.save({ session })
        const result = variantView(saved)
        await record(
          session,
          actorId,
          reason ? 'variant.deactivate' : create ? 'variant.create' : 'variant.update',
          result.id,
          before,
          result,
          cause,
          reason,
        )
        return result
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  return {
    create: (token: string | undefined, raw: unknown) => writeProduct(token, raw),
    patch: (token: string | undefined, id: string, raw: unknown, match?: string) =>
      writeProduct(token, raw, id, match),
    deactivate(token: string | undefined, id: string, raw: unknown, match?: string) {
      const input = parseInput(productDeactivate, raw)
      return writeProduct(token, { status: 'inactive' }, id, match, input.reason)
    },
    createVariant: (token: string | undefined, id: string, raw: unknown) =>
      writeVariant(token, raw, id, undefined, true),
    patchVariant: (token: string | undefined, id: string, raw: unknown, match?: string) =>
      writeVariant(token, raw, id, match),
    deactivateVariant(token: string | undefined, id: string, raw: unknown, match?: string) {
      const input = parseInput(variantDeactivate, raw)
      return writeVariant(token, { status: 'inactive' }, id, match, false, input.reason)
    },
    async detail(token: string | undefined, id: string) {
      parseInput(productParams, { productId: id })
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const row = await models.products.findById(id).session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          const variants = await models.variants
            .find({ productId: row._id })
            .sort({ skuNormalized: 1, _id: 1 })
            .limit(101)
            .session(session)
          return parseInput(adminProductDetail, {
            ...view(row),
            variants: variants.map(variantView),
          })
        },
        false,
      )
    },
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(productListQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const q = input.q?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const filter = {
            ...(input.status ? { status: input.status } : {}),
            ...(q
              ? {
                  $or: [
                    { name: { $regex: q, $options: 'i' } },
                    { slug: { $regex: q, $options: 'i' } },
                  ],
                }
              : {}),
          }
          const total = await models.products.countDocuments(filter).session(session)
          const rows = await models.products
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
            .maxTimeMS(3000)
          return { data: rows.map(view), page: pageMeta(input, total) }
        },
        false,
      )
    },
  }
}

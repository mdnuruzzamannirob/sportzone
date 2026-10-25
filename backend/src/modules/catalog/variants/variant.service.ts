import { verifyProductPersistence } from '../products/product.persistence.js'
import type { ClientSession, Connection, Types } from 'mongoose'
import { ApiError } from '../../../shared/errors/app-error.js'
import { productModels } from '../products/product.model.js'

export type StockCounters = {
  physical: number
  reserved: number
  committed: number
}
const fields = ['physical', 'reserved', 'committed'] as const
// Catalog owns the model; inventory receives only counter operations within a caller transaction.
export function variantStockAccess(connection: Connection) {
  const model = productModels(connection).variants
  return {
    async read(id: Types.ObjectId, session?: ClientSession): Promise<StockCounters | null> {
      const row = await model
        .findById(id)
        .select('stock')
        .session(session ?? null)
        .lean()
      return row
        ? {
            physical: row.stock.physical,
            reserved: row.stock.reserved,
            committed: row.stock.committed,
          }
        : null
    },
    async change(
      id: Types.ObjectId,
      delta: StockCounters,
      session: ClientSession,
    ): Promise<StockCounters | null> {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      if (!fields.every((field) => Number.isSafeInteger(delta[field])))
        throw new ApiError('VALIDATION_FAILED')
      const next = (field: (typeof fields)[number]) => ({
        $add: [`$stock.${field}`, delta[field]],
      })
      const bounded = fields.flatMap((field) => [
        { $gte: [`$stock.${field}`, 0] },
        { $eq: [{ $mod: [`$stock.${field}`, 1] }, 0] },
        { $lte: [`$stock.${field}`, Number.MAX_SAFE_INTEGER] },
        { $gte: [next(field), 0] },
        { $lte: [next(field), Number.MAX_SAFE_INTEGER] },
      ])
      const row = await model
        .findOneAndUpdate(
          {
            _id: id,
            revision: { $gte: 0, $lt: Number.MAX_SAFE_INTEGER },
            $expr: {
              $and: [
                ...bounded,
                { $eq: [{ $mod: ['$revision', 1] }, 0] },
                {
                  $lte: ['$stock.reserved', { $subtract: ['$stock.physical', '$stock.committed'] }],
                },
                {
                  $lte: [next('reserved'), { $subtract: [next('physical'), next('committed')] }],
                },
              ],
            },
          },
          [
            {
              $set: {
                'stock.physical': next('physical'),
                'stock.reserved': next('reserved'),
                'stock.committed': next('committed'),
                revision: { $add: ['$revision', 1] },
              },
            },
          ],
          { session, returnDocument: 'after', updatePipeline: true },
        )
        .select('stock')
        .lean()
      return row
        ? {
            physical: row.stock.physical,
            reserved: row.stock.reserved,
            committed: row.stock.committed,
          }
        : null
    },
  }
}

// Admin inventory receives detached projections and a threshold-only CAS capability.
export function variantInventoryAccess(connection: Connection) {
  const { variants } = productModels(connection)
  return {
    verify: () => verifyProductPersistence(connection),
    async list(
      session: ClientSession,
      input: {
        q?: string | undefined
        lowStock?: boolean | undefined
        offset: number
        limit: number
      },
      threshold: number,
    ) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const search = input.q?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return variants
        .aggregate<unknown>([
          {
            $lookup: {
              from: 'products',
              localField: 'productId',
              foreignField: '_id',
              as: 'product',
            },
          },
          {
            $set: {
              available: {
                $subtract: [
                  { $subtract: ['$stock.physical', '$stock.reserved'] },
                  '$stock.committed',
                ],
              },
              effectiveLowStockThreshold: { $ifNull: ['$lowStockThreshold', threshold] },
            },
          },
          ...(search
            ? [
                {
                  $match: {
                    $or: [
                      { skuNormalized: { $regex: search, $options: 'i' } },
                      { 'product.name': { $regex: search, $options: 'i' } },
                    ],
                  },
                },
              ]
            : []),
          ...(input.lowStock !== undefined
            ? [
                {
                  $match: {
                    $expr: input.lowStock
                      ? { $lte: ['$available', '$effectiveLowStockThreshold'] }
                      : { $gt: ['$available', '$effectiveLowStockThreshold'] },
                  },
                },
              ]
            : []),
          {
            $facet: {
              variants: [
                { $sort: { skuNormalized: 1, _id: 1 } },
                { $skip: input.offset },
                { $limit: input.limit },
                {
                  $project: {
                    _id: 0,
                    variantId: { $toString: '$_id' },
                    productId: { $toString: '$productId' },
                    sku: '$skuNormalized',
                    status: 1,
                    revision: 1,
                    stock: {
                      physical: '$stock.physical',
                      reserved: '$stock.reserved',
                      committed: '$stock.committed',
                      available: '$available',
                    },
                    lowStockThreshold: 1,
                    effectiveLowStockThreshold: 1,
                  },
                },
              ],
              totals: [
                {
                  $group: {
                    _id: null,
                    totalItems: { $sum: 1 },
                    physical: { $sum: '$stock.physical' },
                    reserved: { $sum: '$stock.reserved' },
                    committed: { $sum: '$stock.committed' },
                    available: { $sum: '$available' },
                  },
                },
                { $project: { _id: 0 } },
              ],
            },
          },
        ])
        .session(session)
    },
    async threshold(
      session: ClientSession,
      id: Types.ObjectId,
      expected: number,
      value: number | null,
    ) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const current = await variants.findById(id).session(session)
      if (!current) throw new ApiError('NOT_FOUND')
      if (current.revision !== expected) throw new ApiError('PRECONDITION_FAILED')
      if (current.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
      const before = current.lowStockThreshold
      const row = await variants.findOneAndUpdate(
        { _id: id, revision: expected },
        {
          ...(value === null
            ? { $unset: { lowStockThreshold: '' } }
            : { $set: { lowStockThreshold: value } }),
          $inc: { revision: 1 },
        },
        { session, returnDocument: 'after', runValidators: true },
      )
      if (!row) throw new ApiError('PRECONDITION_FAILED')
      return {
        before,
        variant: {
          id: row._id.toHexString(),
          productId: row.productId.toHexString(),
          sku: row.skuNormalized,
          attributes: Object.fromEntries(row.attributes ?? []),
          regularPricePoisha: row.regularPricePoisha,
          ...(row.salePricePoisha != null ? { salePricePoisha: row.salePricePoisha } : {}),
          status: row.status,
          revision: row.revision,
          stock: {
            physical: row.stock.physical,
            reserved: row.stock.reserved,
            committed: row.stock.committed,
            available: row.stock.physical - row.stock.reserved - row.stock.committed,
          },
          ...(row.lowStockThreshold != null ? { lowStockThreshold: row.lowStockThreshold } : {}),
        },
      }
    },
  }
}

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

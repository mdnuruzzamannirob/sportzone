import { Types, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { CustomerAccountAccess } from '../auth/customer-account.service.js'
import type { catalogService } from '../catalog/catalog.service.js'
import { wishlistModel } from './wishlist.model.js'
import { verifyWishlistPersistence } from './wishlist.persistence.js'
import { wishlistParams, wishlistResponse } from './wishlist.schema.js'

export function wishlistService(
  connection: Connection,
  access: CustomerAccountAccess,
  catalog: Pick<ReturnType<typeof catalogService>, 'wishlistProducts'>,
) {
  const lists = wishlistModel(connection)
  return {
    read(token: string | undefined) {
      return access.owned(
        token,
        async (user, { transaction }) => {
          try {
            await verifyWishlistPersistence(connection)
          } catch {
            throw new ApiError('SERVICE_UNAVAILABLE')
          }
          const row = await lists
            .findOne({ userId: new Types.ObjectId(user.id) })
            .session(transaction)
            .lean()
          const ids = row?.productIds.map((id) => id.toHexString()) ?? []
          const cards = await catalog.wishlistProducts(ids, transaction)
          return parseInput(wishlistResponse, {
            products: ids.map((id) => cards.get(id) ?? { id, availability: 'unavailable' }),
          })
        },
        false,
      )
    },
    set(token: string | undefined, productId: string, saved: boolean) {
      const id = parseInput(wishlistParams, { productId }).productId
      return access.owned(token, async (user, { transaction }) => {
        try {
          await verifyWishlistPersistence(connection)
        } catch {
          throw new ApiError('SERVICE_UNAVAILABLE')
        }
        const userId = new Types.ObjectId(user.id)
        let row = await lists.findOne({ userId }).session(transaction)
        const index = row?.productIds.findIndex((value) => value.toHexString() === id) ?? -1
        if (saved) {
          // An already saved inactive item stays identifiable; retries never add another entry.
          if (index >= 0) return { saved: true }
          if ((row?.productIds.length ?? 0) >= 200) throw new ApiError('BUSINESS_RULE_VIOLATION')
          if (!(await catalog.wishlistProducts([id], transaction)).has(id))
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          if (!row) row = new lists({ userId, productIds: [] })
          row.productIds.push(new Types.ObjectId(id))
          await row.save({ session: transaction })
        } else if (row && index >= 0) {
          row.productIds.splice(index, 1)
          await row.save({ session: transaction })
        }
        return { saved }
      })
    },
  }
}

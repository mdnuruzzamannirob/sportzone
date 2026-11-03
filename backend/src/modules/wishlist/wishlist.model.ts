import { type Connection, type InferSchemaType, Schema } from 'mongoose'
import { mutableSchemaOptions } from '../../shared/database/schema.js'

type WishlistRecord = InferSchemaType<typeof schema>

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    productIds: {
      type: [Schema.Types.ObjectId],
      default: [],
      validate: (
        ids: {
          toString(): string
        }[],
      ) => ids.length <= 200 && new Set(ids.map((id) => id.toString())).size === ids.length,
    },
  },
  mutableSchemaOptions,
)

schema.index({ userId: 1 }, { unique: true, name: 'wishlist_user_unique' })

function wishlistModel(connection: Connection) {
  return connection.models.Wishlist
    ? connection.model<WishlistRecord>('Wishlist')
    : connection.model<WishlistRecord>('Wishlist', schema, 'wishlists')
}

export type { WishlistRecord }
export { wishlistModel }

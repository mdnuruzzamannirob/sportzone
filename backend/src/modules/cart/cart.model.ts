import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'

const line = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, required: true },
    quantity: { ...integerField(1), required: true, max: 50 },
    addedAt: { type: Date, required: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
)
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    items: {
      type: [line],
      default: [],
      validate: (items: { variantId: { toString(): string } }[]) =>
        items.length <= 100 &&
        new Set(items.map((i) => i.variantId.toString())).size === items.length,
    },
    revision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
schema.index({ userId: 1 }, { unique: true, name: 'cart_user_unique' })
export type CartRecord = InferSchemaType<typeof schema>
export function cartModel(connection: Connection) {
  return connection.models.Cart
    ? connection.model<CartRecord>('Cart')
    : connection.model<CartRecord>('Cart', schema, 'carts')
}

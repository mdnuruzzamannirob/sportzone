import { z } from 'zod'
import { productCard } from '../catalog/catalog.schema.js'

export const wishlistParams = z.strictObject({ productId: z.string().regex(/^[a-f0-9]{24}$/) })
export const wishlistResponse = z.strictObject({
  products: z
    .array(
      z.union([
        productCard,
        z.strictObject({
          id: z.string().regex(/^[a-f0-9]{24}$/),
          availability: z.literal('unavailable'),
        }),
      ]),
    )
    .max(200),
})
export const wishlistSaved = z.strictObject({ saved: z.boolean() })

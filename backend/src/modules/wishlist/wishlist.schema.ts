import { z } from 'zod'
import type { ProductCardSchema } from '../catalog/catalog.public.js'

type WishlistResponseSchema = ReturnType<typeof createWishlistSchemas>['wishlistResponse']

const wishlistParams = z.strictObject({ productId: z.string().regex(/^[a-f0-9]{24}$/) })

const wishlistSaved = z.strictObject({ saved: z.boolean() })

function createWishlistSchemas({ productCard }: { productCard: ProductCardSchema }) {
  const wishlistResponse = z.strictObject({
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
  return { wishlistResponse }
}

export type { WishlistResponseSchema }
export { createWishlistSchemas, wishlistParams, wishlistSaved }

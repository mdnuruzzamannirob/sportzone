import { z } from 'zod'
import { productCard } from '../catalog/catalog.schema.js'

export const variantParams = z.strictObject({ variantId: z.string().regex(/^[a-f0-9]{24}$/) })
export const cartQuantity = z.strictObject({ quantity: z.int().min(1).max(50) })
export const cartResponse = z.strictObject({
  items: z
    .array(
      z.strictObject({
        variantId: z.string().regex(/^[a-f0-9]{24}$/),
        quantity: z.int().min(1).max(50),
        product: productCard.nullable(),
        estimatedUnitPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
        availability: z.enum(['available', 'unavailable']),
      }),
    )
    .max(100),
  estimatedSubtotalPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  revision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})

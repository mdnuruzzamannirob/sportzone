import { z } from 'zod'
import type { ProductCardSchema } from '../catalog/catalog.public.js'

type CartMergeResponseSchema = ReturnType<typeof createCartSchemas>['cartMergeResponse']

type CartResponseSchema = ReturnType<typeof createCartSchemas>['cartResponse']

const variantParams = z.strictObject({ variantId: z.string().regex(/^[a-f0-9]{24}$/) })

const cartQuantity = z.strictObject({ quantity: z.int().min(1).max(50) })

const cartMerge = z.strictObject({
  items: z
    .array(
      z.strictObject({
        variantId: variantParams.shape.variantId,
        quantity: cartQuantity.shape.quantity,
      }),
    )
    .max(100),
})

function createCartSchemas({ productCard }: { productCard: ProductCardSchema }) {
  const cartResponse = z.strictObject({
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

  const cartMergeResponse = cartResponse.extend({
    errors: z
      .array(
        z.strictObject({
          variantId: variantParams.shape.variantId,
          code: z.literal('BUSINESS_RULE_VIOLATION'),
        }),
      )
      .max(100),
  })
  return { cartMergeResponse, cartResponse }
}

export type { CartMergeResponseSchema, CartResponseSchema }
export { cartMerge, cartQuantity, createCartSchemas, variantParams }

import { z } from 'zod'
import { productCard } from '../catalog/catalog.schema.js'

const variantParams = z.strictObject({ variantId: z.string().regex(/^[a-f0-9]{24}$/) })

const cartQuantity = z.strictObject({ quantity: z.int().min(1).max(50) })

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

export { variantParams, cartQuantity, cartResponse, cartMerge, cartMergeResponse }

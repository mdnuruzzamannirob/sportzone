import { z } from 'zod'
import { paginationSchema } from '../../../shared/pagination.js'
import { money, text } from '../catalog.schema.js'
import { adminVariant, variantBatch } from '../variants/variant.schema.js'
import { description, slug } from './product.schema.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
export const productParams = z.strictObject({ productId: id })
const image = z.strictObject({
  publicId: z.string().regex(/^sportzone\/[a-f0-9]{24}$/),
  url: z
    .url()
    .max(2000)
    .refine((v) => {
      const u = new URL(v)
      return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
    }),
  alt: z
    .string()
    .trim()
    .refine((v) => [...v].length <= 120)
    .meta({ maxLength: 120 })
    .optional(),
})
const images = z
  .array(image)
  .max(12)
  .refine((v) => new Set(v.map((i) => i.publicId)).size === v.length)
const categories = z
  .array(id)
  .min(1)
  .max(30)
  .refine((v) => new Set(v).size === v.length)
const keywords = z
  .array(text(120).transform((v) => v.toLowerCase()))
  .max(30)
  .transform((v) => [...new Set(v)])
const fields = {
  name: text(120),
  slug,
  description,
  categoryIds: categories,
  images: images.optional(),
  keywords: keywords.optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  featured: z.boolean().optional(),
}
export const productCreate = z.strictObject({
  ...fields,
  variants: variantBatch,
})
export const productPatch = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0)
export const productDeactivate = z.strictObject({ reason: z.string().trim().min(1).max(2000) })
export const productListQuery = paginationSchema.safeExtend({
  q: text(120).optional(),
  status: fields.status,
})
export const adminProduct = z.strictObject({
  id,
  name: fields.name,
  slug,
  description,
  categoryIds: categories,
  images,
  status: z.enum(['draft', 'active', 'inactive']),
  featured: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revision: money,
})
export const adminProductDetail = adminProduct.extend({
  variants: z.array(adminVariant).min(1).max(100),
})

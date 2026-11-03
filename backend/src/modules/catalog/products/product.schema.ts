import { Types } from 'mongoose'
import { z } from 'zod'
import { paginationSchema } from '../../../shared/pagination.js'
import { boundedText as text } from '../../../shared/validation.js'
import { money } from '../catalog.schema.js'
import { adminVariant, variantBatch } from './variant.schema.js'

const catalogId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))

const slug = text(160)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))

const description = text(2000).refine(
  (value) =>
    !/<[^>]*>/.test(value) &&
    [...value].every((char) => char.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(char)),
)

const productInput = z.strictObject({
  name: text(120),
  slug: slug,
  // Plain text only. Render as text, never unescaped HTML, in future API consumers.
  description: description,
  categoryIds: z
    .array(catalogId)
    .min(1)
    .max(30)
    .refine((values) => new Set(values.map((value) => value.toHexString())).size === values.length),
  // Media attachment is enabled only through the media ledger in P04-003/P04-005.
  images: z.array(z.never()).max(0).default([]),
  keywords: z
    .array(text(120).transform((value) => value.toLowerCase()))
    .max(30)
    .default([])
    .transform((values) => [...new Set(values)]),
  status: z.enum(['draft', 'active', 'inactive']).default('draft'),
  featured: z.boolean().default(false),
})

const id = z.string().regex(/^[a-f0-9]{24}$/)

const productParams = z.strictObject({ productId: id })

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
  slug: slug,
  description: description,
  categoryIds: categories,
  images: images.optional(),
  keywords: keywords.optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  featured: z.boolean().optional(),
}

const productCreate = z.strictObject({
  ...fields,
  variants: variantBatch,
})

const productPatch = z
  .strictObject(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0)

const productDeactivate = z.strictObject({ reason: z.string().trim().min(1).max(2000) })

const productListQuery = paginationSchema.safeExtend({
  q: text(120).optional(),
  status: fields.status,
})

const adminProduct = z.strictObject({
  id,
  name: fields.name,
  slug: slug,
  description: description,
  categoryIds: categories,
  images,
  status: z.enum(['draft', 'active', 'inactive']),
  featured: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revision: money,
})

const adminProductDetail = adminProduct.extend({
  variants: z.array(adminVariant).min(1).max(100),
})

export { money } from '../catalog.schema.js'
export {
  attributeSignature,
  attributes,
  sku,
  variantBatch,
  variantInput,
} from './variant.schema.js'
export {
  adminProduct,
  adminProductDetail,
  catalogId,
  description,
  productCreate,
  productDeactivate,
  productInput,
  productListQuery,
  productParams,
  productPatch,
  slug,
}

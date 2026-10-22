import { Types } from 'mongoose'
import { z } from 'zod'
import { text } from '../catalog.schema.js'
export { money } from '../catalog.schema.js'
export {
  attributeSignature,
  attributes,
  sku,
  variantInput,
  variantBatch,
} from '../variants/variant.schema.js'

export const catalogId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))
export const slug = text(160)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
export const description = text(2000).refine(
  (value) =>
    !/<[^>]*>/.test(value) &&
    [...value].every((char) => char.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(char)),
)
export const productInput = z.strictObject({
  name: text(120),
  slug,
  // Plain text only. Render as text, never unescaped HTML, in future API consumers.
  description,
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

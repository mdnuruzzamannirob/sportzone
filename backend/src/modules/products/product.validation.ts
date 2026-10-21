import { Types } from 'mongoose'
import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
export const catalogId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))
export const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const slug = text(160)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
export const sku = text(64)
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .max(64)
      .regex(/^[A-Z0-9]+(?:[._-][A-Z0-9]+)*$/),
  )
const optionText = (max: number) =>
  text(max)
    .transform((value) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '))
    .pipe(text(max))
export const attributes = z
  .unknown()
  .superRefine((input, context) => {
    // Check raw keys before Zod's record parser discards __proto__.
    if (
      input &&
      typeof input === 'object' &&
      Object.keys(input).some((key) =>
        ['__proto__', 'constructor', 'prototype'].includes(
          key.trim().normalize('NFKC').toLowerCase(),
        ),
      )
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid variant attributes' })
    }
  })
  .pipe(z.record(z.string(), z.string()))
  .transform((input, context) => {
    const entries: [string, string][] = []
    const seen = new Set<string>()
    for (const [key, value] of Object.entries(input)) {
      const name = optionText(64).safeParse(key)
      const option = optionText(120).safeParse(value)
      if (
        !name.success ||
        !option.success ||
        /[.$]/.test(name.data) ||
        [...name.data, ...option.data].some((char) => char.charCodeAt(0) < 32) ||
        ['__proto__', 'constructor', 'prototype'].includes(name.data) ||
        seen.has(name.data)
      ) {
        context.addIssue({ code: 'custom', message: 'Invalid variant attributes' })
        return z.NEVER
      }
      seen.add(name.data)
      entries.push([name.data, option.data])
    }
    if (entries.length > 30) {
      context.addIssue({ code: 'custom', message: 'Too many attributes' })
      return z.NEVER
    }
    return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  })
export function attributeSignature(options: Record<string, string>) {
  const entries = Object.entries(options).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.length ? JSON.stringify(entries) : 'default'
}
export const variantInput = z
  .strictObject({
    sku,
    attributes,
    regularPricePoisha: money,
    salePricePoisha: money.optional(),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .refine(
    (value) =>
      value.salePricePoisha === undefined || value.salePricePoisha <= value.regularPricePoisha,
    { message: 'Sale exceeds regular price' },
  )
export const variantBatch = z
  .array(variantInput)
  .min(1)
  .max(100)
  .superRefine((variants, context) => {
    const keys = JSON.stringify(Object.keys(variants[0]?.attributes ?? {}))
    const signatures = variants.map((value) => attributeSignature(value.attributes))
    if (
      new Set(signatures).size !== variants.length ||
      new Set(variants.map((value) => value.sku)).size !== variants.length ||
      variants.some((value) => JSON.stringify(Object.keys(value.attributes)) !== keys)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate or inconsistent variant combinations',
      })
    }
  })
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

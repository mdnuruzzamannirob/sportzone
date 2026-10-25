import { variantStockView as stockView } from '../catalog/variants/variant.schema.js'
export { variantStockView as stockView } from '../catalog/variants/variant.schema.js'
import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const integer = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const inventoryParams = z.strictObject({ variantId: id })
export const inventoryQuery = paginationSchema.safeExtend({
  q: z.string().trim().min(1).max(120).optional(),
  lowStock: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})
export const movementQuery = paginationSchema
  .safeExtend({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() })
  .refine((v) => !v.from || !v.to || v.from < v.to)
export const adjustmentBody = z.strictObject({
  deltaPhysical: z
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .refine((v) => v !== 0),
  reason: z
    .string()
    .trim()
    .min(1)
    .refine((v) => [...v].length <= 2000)
    .meta({ maxLength: 2000 }),
})
export const operationKey = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (v) => v === v.trim() && [...v].every((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127),
  )
const inventoryRow = z.strictObject({
  variantId: id,
  productId: id,
  sku: z.string(),
  status: z.enum(['active', 'inactive']),
  revision: integer,
  stock: stockView,
  lowStockThreshold: integer.optional(),
  effectiveLowStockThreshold: integer,
})
export const inventoryList = z.strictObject({
  variants: z.array(inventoryRow).max(100),
  physical: integer,
  reserved: integer,
  committed: integer,
  available: integer,
})
export const inventoryFacet = z
  .array(
    z.strictObject({
      variants: z.array(inventoryRow).max(100),
      totals: z
        .array(
          z.strictObject({
            totalItems: integer,
            physical: integer,
            reserved: integer,
            committed: integer,
            available: integer,
          }),
        )
        .max(1),
    }),
  )
  .length(1)
export const movementView = z.strictObject({
  id,
  variantId: id,
  type: z.enum([
    'opening',
    'adjustment',
    'reserve',
    'release_hold',
    'commit_hold',
    'commit_cod',
    'release_commit',
    'dispatch',
    'return_receipt',
  ]),
  deltaPhysical: z.int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  deltaReserved: z.int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  deltaCommitted: z.int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  occurredAt: z.iso.datetime(),
  reason: z.string(),
  actor: z.strictObject({ type: z.enum(['system', 'admin']), id: id.optional() }),
})
export const adjustmentResult = z.strictObject({ stock: stockView, movementId: id })

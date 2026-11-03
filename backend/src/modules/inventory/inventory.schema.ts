import { variantStockView as stockView } from '../catalog/products/variant.schema.js'
import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
import { Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import type { StockCounters } from '../catalog/products/variant.service.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)

const integer = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const inventoryParams = z.strictObject({ variantId: id })

const inventoryQuery = paginationSchema.safeExtend({
  q: z.string().trim().min(1).max(120).optional(),
  lowStock: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

const movementQuery = paginationSchema
  .safeExtend({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() })
  .refine((v) => !v.from || !v.to || v.from < v.to)

const adjustmentBody = z.strictObject({
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

const operationKey = z
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

const inventoryList = z.strictObject({
  variants: z.array(inventoryRow).max(100),
  physical: integer,
  reserved: integer,
  committed: integer,
  available: integer,
})

const inventoryFacet = z
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

const movementView = z.strictObject({
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

const adjustmentResult = z.strictObject({ stock: stockView, movementId: id })

const objectId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .transform((value) => new Types.ObjectId(value))

const reason = z
  .string()
  .trim()
  .min(1)
  .refine((value) => [...value].length <= 2000)

const inventoryOperationKey = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value === value.trim() &&
      [...value].every(
        (character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
      ),
  )

const allocationInput = z.strictObject({
  variantId: objectId,
  orderId: objectId,
  quantity: z.int().min(1).max(50),
  generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  operationKey: inventoryOperationKey,
  reason,
})

const adjustmentInput = z.strictObject({
  variantId: objectId,
  actorId: objectId,
  operationKey: inventoryOperationKey,
  deltaPhysical: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .refine((value) => value !== 0),
  reason,
})

function stockSnapshot({ physical, reserved, committed }: StockCounters) {
  if (
    ![physical, reserved, committed].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    reserved > physical - committed
  )
    throw new ApiError('STATE_CONFLICT')
  return { physical, reserved, committed, available: physical - reserved - committed }
}

export { variantStockView as stockView } from '../catalog/products/variant.schema.js'
export {
  inventoryParams,
  inventoryQuery,
  movementQuery,
  adjustmentBody,
  operationKey,
  inventoryList,
  inventoryFacet,
  movementView,
  adjustmentResult,
  stockSnapshot,
  objectId,
  allocationInput,
  adjustmentInput,
}

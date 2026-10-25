import { expect, it } from 'vitest'
import {
  adjustmentBody,
  inventoryQuery,
  movementQuery,
  operationKey,
  stockView,
  thresholdPatch,
} from '../../src/modules/inventory/inventory-admin.schema.js'
it('preserves physically meaningful separated stock and rejects inconsistent availability', () => {
  expect(
    stockView.safeParse({ physical: 10, reserved: 2, committed: 3, available: 5 }).success,
  ).toBe(true)
  expect(
    stockView.safeParse({ physical: 10, reserved: 2, committed: 3, available: 10 }).success,
  ).toBe(false)
  expect(
    stockView.safeParse({ physical: 1, reserved: 2, committed: 0, available: 0 }).success,
  ).toBe(false)
})
it('bounds nonzero safe physical deltas without accepting reserved/committed fields', () => {
  for (const deltaPhysical of [-Number.MAX_SAFE_INTEGER, -1, 1, Number.MAX_SAFE_INTEGER])
    expect(adjustmentBody.safeParse({ deltaPhysical, reason: 'Counted' }).success).toBe(true)
  for (const deltaPhysical of [0, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
    expect(adjustmentBody.safeParse({ deltaPhysical, reason: 'Counted' }).success).toBe(false)
  expect(
    adjustmentBody.safeParse({ deltaPhysical: 1, reason: 'Counted', reserved: 0 }).success,
  ).toBe(false)
})
it('requires bounded visible replay keys and meaningful Unicode reasons', () => {
  for (const key of ['', ' key', 'x'.repeat(129), 'a\nkey', 'a\u007fb'])
    expect(operationKey.safeParse(key).success).toBe(false)
  expect(adjustmentBody.safeParse({ deltaPhysical: 1, reason: '😀'.repeat(2000) }).success).toBe(
    true,
  )
  expect(adjustmentBody.safeParse({ deltaPhysical: 1, reason: '😀'.repeat(2001) }).success).toBe(
    false,
  )
})
it('distinguishes an explicit zero threshold from null fallback and rejects ownership fields', () => {
  expect(thresholdPatch.parse({ lowStockThreshold: 0 })).toEqual({ lowStockThreshold: 0 })
  expect(thresholdPatch.parse({ lowStockThreshold: null })).toEqual({ lowStockThreshold: null })
  expect(thresholdPatch.safeParse({}).success).toBe(false)
  expect(thresholdPatch.safeParse({ lowStockThreshold: 1, actorId: 'foreign' }).success).toBe(false)
})
it('requires canonical boolean filters and bounded stable pagination', () => {
  expect(inventoryQuery.parse({ lowStock: 'false' }).lowStock).toBe(false)
  for (const query of [
    { lowStock: '1' },
    { pageSize: '101' },
    { q: ' ' },
    { page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' },
  ])
    expect(inventoryQuery.safeParse(query).success).toBe(false)
})
it('requires valid ordered UTC history windows', () => {
  expect(
    movementQuery.safeParse({ from: '2026-10-25T01:00:00Z', to: '2026-10-25T00:00:00Z' }).success,
  ).toBe(false)
  expect(movementQuery.safeParse({ from: 'invalid' }).success).toBe(false)
})

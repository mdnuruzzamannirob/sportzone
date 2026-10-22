import { describe, expect, it } from 'vitest'
import { stockSnapshot, adjustmentInput } from '../../src/modules/inventory/inventory.schema.js'

describe('inventory counter invariants', () => {
  it.each([
    [0, 0, 0, 0],
    [10, 3, 4, 3],
    [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER, 0],
  ])(
    'derives available from physical=%s, reserved=%s, committed=%s',
    (physical, reserved, committed, available) => {
      expect(stockSnapshot({ physical, reserved, committed })).toEqual({
        physical,
        reserved,
        committed,
        available,
      })
    },
  )
  it.each([
    [-1, 0, 0],
    [1, 2, 0],
    [1, 0, 2],
    [2, 1, 2],
    [NaN, 0, 0],
    [Infinity, 0, 0],
    [1.1, 0, 0],
    [Number.MAX_SAFE_INTEGER + 1, 0, 0],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1],
  ])('rejects corrupt or unsafe counters %s/%s/%s', (physical, reserved, committed) => {
    expect(() => stockSnapshot({ physical, reserved, committed })).toThrow()
  })
  it('refuses missing counter fields at a runtime boundary', () => {
    expect(() => Reflect.apply(stockSnapshot, undefined, [{}])).toThrow()
  })
  const command = {
    variantId: '535a00000000000000000001',
    operationKey: 'count-1',
    deltaPhysical: 1,
    reason: 'Inspected stock count',
    actorId: '535a00000000000000000002',
  }
  it('validates a bounded internal adjustment command without accepting counter overwrites', () => {
    expect(adjustmentInput.safeParse(command).success).toBe(true)
    for (const change of [
      { deltaPhysical: 0 },
      { deltaPhysical: '1' },
      { deltaPhysical: 0.5 },
      { deltaPhysical: Number.MAX_SAFE_INTEGER + 1 },
      { operationKey: '' },
      { operationKey: 'a'.repeat(129) },
      { reason: ' ' },
      { reason: 'x'.repeat(2001) },
      { actorId: 'invalid' },
      { variantId: 'invalid' },
      { stock: { physical: 100 } },
      { deltaReserved: 1 },
      { actorType: 'system' },
    ])
      expect(adjustmentInput.safeParse({ ...command, ...change }).success).toBe(false)
  })
})

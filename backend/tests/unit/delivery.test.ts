import { expect, it } from 'vitest'
import {
  chargeInput,
  chargeSupersede,
  zonePatch,
  coverageKey,
  chargeQuery,
} from '../../src/modules/delivery/delivery.schema.js'
const input = {
  zoneId: 'a'.repeat(24),
  coverageKey: 'dhaka:synthetic',
  amountPoisha: 7500,
  effectiveFrom: '2026-10-26T00:00:00Z',
}
it('normalizes bounded district/area keys and admits a district wildcard only in the area slot', () => {
  expect(coverageKey.parse(' DHAKA:SYNTHETIC ')).toBe('dhaka:synthetic')
  expect(coverageKey.parse('dhaka:*')).toBe('dhaka:*')
  for (const value of [
    '*:area',
    'dhaka:area:extra',
    'dhaka:',
    ':area',
    'dhaka:bad/path',
    'dhaka:two words',
    'dhaka:area?query',
  ])
    expect(coverageKey.safeParse(value).success).toBe(false)
})
it('rejects unsafe money, invalid intervals and client-assigned version or status', () => {
  expect(chargeInput.safeParse({ ...input, amountPoisha: 0 }).success).toBe(true)
  for (const patch of [
    { amountPoisha: -1 },
    { amountPoisha: 1.2 },
    { amountPoisha: Number.MAX_SAFE_INTEGER + 1 },
    { amountPoisha: '7500' },
    { status: 'active' },
    { ruleVersion: 2 },
    { effectiveTo: input.effectiveFrom },
    { effectiveTo: '2026-10-25T00:00:00Z' },
  ])
    expect(chargeInput.safeParse({ ...input, ...patch }).success).toBe(false)
})
it('binds supersession to the replacement start and prohibits protected zone edits', () => {
  expect(
    chargeSupersede.safeParse({
      effectiveAt: input.effectiveFrom,
      reason: 'Synthetic',
      replacement: input,
    }).success,
  ).toBe(true)
  expect(
    chargeSupersede.safeParse({
      effectiveAt: '2026-10-27T00:00:00Z',
      reason: 'Synthetic',
      replacement: input,
    }).success,
  ).toBe(false)
  for (const patch of [
    {},
    { revision: 1 },
    { coverageRevision: 2 },
    { status: 'deleted' },
    { name: '' },
  ])
    expect(zonePatch.safeParse(patch).success).toBe(false)
  for (const query of [{ pageSize: '101' }, { status: 'deleted' }, { zoneId: 'bad' }])
    expect(chargeQuery.safeParse(query).success).toBe(false)
})

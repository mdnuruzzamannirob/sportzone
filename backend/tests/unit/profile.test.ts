import { describe, expect, it } from 'vitest'
import {
  addressId,
  addressInput,
  addressPatch,
  bangladeshPhone,
  deletionInput,
  profilePatch,
} from '../../src/modules/customers/customer.schema.js'
describe('profile and Bangladesh contact contracts', () => {
  it.each([
    ['01700000000', '+8801700000000'],
    ['+8801700000000', '+8801700000000'],
    ['01700-000000', '+8801700000000'],
    ['027111234', '+88027111234'],
  ])('normalizes %s to canonical Bangladesh phone', (input, expected) => {
    expect(bangladeshPhone.parse(input)).toBe(expected)
  })
  it.each([
    '',
    '+12025550123',
    '000',
    '01700',
    'call 01700000000',
    '+8801700000000 ext 123',
    'x'.repeat(65),
  ])('rejects invalid/non-Bangladesh phone %s', (input) => {
    expect(bangladeshPhone.safeParse(input).success).toBe(false)
  })
  it.each([
    {},
    { name: '' },
    { name: 'x'.repeat(121) },
    { role: 'admin' },
    { email: 'synthetic@example.test' },
    { phone: null },
    { status: 'active' },
  ])('rejects forbidden profile patch %j', (input) => {
    expect(profilePatch.safeParse(input).success).toBe(false)
  })
  it('allows bounded explicit profile fields and preserves absence', () => {
    expect(profilePatch.parse({ name: ' Synthetic ', phone: '01700000000' })).toEqual({
      name: 'Synthetic',
      phone: '+8801700000000',
    })
    expect(profilePatch.parse({ name: 'Synthetic' })).not.toHaveProperty('phone')
  })
  it('rejects injected address/pricing/ownership fields, empty patch and unsupported removal semantics', () => {
    const input = {
      recipient: 'Synthetic',
      phone: '01700000000',
      districtKey: 'synthetic',
      areaKey: 'served',
      street: 'Synthetic fixture',
    }
    expect(addressInput.parse(input).phone).toBe('+8801700000000')
    for (const change of [
      { id: 'a'.repeat(24) },
      { isDefault: true },
      { zoneId: 'a'.repeat(24) },
      { deliveryCharge: 1 },
      { userId: 'a'.repeat(24) },
      { districtKey: 'a:b' },
      { areaKey: '*' },
    ])
      expect(addressInput.safeParse({ ...input, ...change }).success).toBe(false)
    expect(addressPatch.safeParse({}).success).toBe(false)
    expect(addressPatch.safeParse({ addressLine2: null }).success).toBe(false)
    expect(addressPatch.parse({ isDefault: false })).toEqual({
      isDefault: false,
    })
    expect(addressId.safeParse('invalid').success).toBe(false)
  })
  it('accepts only bounded deletion intake, never status/verification/request identity', () => {
    expect(deletionInput.parse({ reason: ' Synthetic ' })).toEqual({
      reason: 'Synthetic',
    })
    expect(deletionInput.parse({})).toEqual({})
    for (const input of [
      { reason: '' },
      { reason: 'x'.repeat(2001) },
      { status: 'approved' },
      { verifiedAt: new Date().toISOString() },
      { userId: 'a'.repeat(24) },
      { requestId: 'a'.repeat(24) },
    ])
      expect(deletionInput.safeParse(input).success).toBe(false)
  })
})

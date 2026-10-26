import { expect, it } from 'vitest'
import {
  checkoutKeyHash,
  checkoutSubmissionFingerprint,
  checkoutIntentScope,
} from '../../src/modules/checkout/checkout-intent.schema.js'
const input = {
  items: [
    { variantId: 'b'.repeat(24), quantity: 1 },
    { variantId: 'a'.repeat(24), quantity: 2 },
  ],
  recipient: {
    recipient: 'Synthetic',
    phone: '+8801700000000',
    districtKey: 'dhaka',
    areaKey: 'test',
    street: 'Synthetic street',
  },
  email: ' Synthetic@Example.test ',
  method: 'cod',
  quoteId: 'c'.repeat(24),
  acceptedTermsVersion: 'terms1',
  acceptedPolicyVersionIds: ['terms1', 'shipping1'],
  notes: ' Note ',
}
it('canonicalizes validated submission ordering, whitespace and normalized contact fields', () => {
  expect(checkoutSubmissionFingerprint(input)).toBe(
    checkoutSubmissionFingerprint({
      ...input,
      items: [...input.items].reverse(),
      acceptedPolicyVersionIds: [...input.acceptedPolicyVersionIds].reverse(),
      email: 'synthetic@example.test',
      notes: 'Note',
    }),
  )
  expect(input.items[0]?.variantId).toBe('b'.repeat(24))
})
it('binds every submitted command including quote, consent, method, recipient and notes', () => {
  for (const change of [
    { quoteId: 'd'.repeat(24) },
    { acceptedTermsVersion: 'terms2' },
    { acceptedPolicyVersionIds: ['terms2'] },
    { notes: 'Different' },
    { method: 'bkash' },
    { recipient: { ...input.recipient, street: 'Different street' } },
    { items: [{ variantId: 'a'.repeat(24), quantity: 1 }] },
  ])
    expect(checkoutSubmissionFingerprint({ ...input, ...change })).not.toBe(
      checkoutSubmissionFingerprint(input),
    )
})
it('hashes bounded opaque keys without trimming, raw key storage or weak identity fallbacks', () => {
  expect(checkoutKeyHash('synthetic-key')).toMatch(/^[a-f0-9]{64}$/)
  expect(checkoutKeyHash('Synthetic-key')).not.toBe(checkoutKeyHash('synthetic-key'))
  for (const key of [undefined, '', ' leading', 'line\nbreak', 'x'.repeat(129), 1])
    expect(() => checkoutKeyHash(key)).toThrow()
  expect(checkoutKeyHash('x'.repeat(128))).toHaveLength(64)
  expect(
    checkoutIntentScope.safeParse({
      scopeType: 'guest_context',
      scopeKeyHash: 'buyer@example.test',
    }).success,
  ).toBe(false)
})

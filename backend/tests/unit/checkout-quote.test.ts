import { expect, it } from 'vitest'
import {
  checkoutQuoteInput,
  checkoutSubmitInput,
} from '../../src/modules/checkout/checkout.schema.js'
import { checkoutOptions, loadCheckoutOptions } from '../../src/config/checkout.js'
const valid = {
  items: [{ variantId: 'a'.repeat(24), quantity: 1 }],
  recipient: {
    recipient: 'Synthetic',
    phone: '+8801700000000',
    districtKey: 'dhaka',
    areaKey: 'synthetic',
    street: 'Synthetic street',
  },
  email: ' Synthetic@Example.test ',
  method: 'cod',
}
it('normalizes customer-supplied contact and coupon fields without accepting client financial authority', () => {
  expect(checkoutQuoteInput.parse({ ...valid, couponCode: ' synthetic ' })).toMatchObject({
    email: 'synthetic@example.test',
    couponCode: 'SYNTHETIC',
  })
  for (const extra of [
    { total: 1 },
    { unitPrice: 0 },
    { discount: 0 },
    { deliveryCharge: 0 },
    { userId: 'a'.repeat(24) },
    { role: 'admin' },
  ])
    expect(checkoutQuoteInput.safeParse({ ...valid, ...extra }).success).toBe(false)
})
it('bounds distinct lines and quantities, requires exactly one recipient source and rejects malformed consent', () => {
  for (const extra of [
    { items: [] },
    { items: [valid.items[0], valid.items[0]] },
    { items: [{ ...valid.items[0], quantity: 51 }] },
    { savedAddressId: 'a'.repeat(24) },
    { recipient: undefined },
    { recipient: { ...valid.recipient, phone: 'invalid' } },
  ])
    expect(checkoutQuoteInput.safeParse({ ...valid, ...extra }).success).toBe(false)
  expect(
    checkoutSubmitInput.safeParse({
      ...valid,
      quoteId: 'a'.repeat(24),
      acceptedTermsVersion: 'synthetic',
      acceptedPolicyVersionIds: ['synthetic', 'synthetic'],
    }).success,
  ).toBe(false)
})
it('requires an explicit bounded lifetime and distinct applicable policy types including terms', () => {
  expect(checkoutOptions.parse({ quoteTtlSeconds: 300, requiredPolicyTypes: ['terms'] })).toEqual({
    quoteTtlSeconds: 300,
    requiredPolicyTypes: ['terms'],
  })
  for (const extra of [
    { quoteTtlSeconds: 0 },
    { quoteTtlSeconds: 86401 },
    { quoteTtlSeconds: 1.5 },
    { requiredPolicyTypes: [] },
    { requiredPolicyTypes: ['shipping'] },
    { requiredPolicyTypes: ['terms', 'terms'] },
  ])
    expect(
      checkoutOptions.safeParse({ quoteTtlSeconds: 300, requiredPolicyTypes: ['terms'], ...extra })
        .success,
    ).toBe(false)
})
it('keeps quote activation explicit and configuration failures value-free', async () => {
  expect(await loadCheckoutOptions({})).toBeUndefined()
  expect(await loadCheckoutOptions({ CHECKOUT_QUOTES_ENABLED: 'false' })).toBeUndefined()
  const env = {
    CHECKOUT_QUOTES_ENABLED: 'true',
    CUSTOMER_AUTH_ENABLED: 'true',
    CHECKOUT_QUOTE_TTL_SECONDS: '300',
    CHECKOUT_REQUIRED_POLICY_TYPES: 'terms,shipping',
  }
  expect(await loadCheckoutOptions(env)).toMatchObject({
    quoteTtlSeconds: 300,
    requiredPolicyTypes: ['terms', 'shipping'],
  })
  for (const extra of [
    { CUSTOMER_AUTH_ENABLED: 'false' },
    { CHECKOUT_QUOTES_ENABLED: 'TRUE' },
    { CHECKOUT_QUOTE_TTL_SECONDS: '' },
    { CHECKOUT_QUOTE_TTL_SECONDS: '01' },
    { CHECKOUT_REQUIRED_POLICY_TYPES: 'unknown' },
  ])
    await expect(loadCheckoutOptions({ ...env, ...extra })).rejects.toMatchObject({
      fields: ['checkout_quote_configuration'],
      message: 'Invalid backend configuration.',
    })
})

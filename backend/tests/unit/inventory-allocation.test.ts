import { expect, it } from 'vitest'
import { allocationInput } from '../../src/modules/inventory/inventory.schema.js'
const valid = {
  variantId: '535a00000000000000000001',
  orderId: '535a00000000000000000002',
  quantity: 1,
  generation: 1,
  operationKey: 'order:hold:1',
  reason: 'Checkout hold',
}
it('normalizes the bounded internal command and retains explicit generation identity', () => {
  expect(allocationInput.parse({ ...valid, reason: ' Checkout hold ' })).toMatchObject({
    quantity: 1,
    generation: 1,
    reason: 'Checkout hold',
  })
})
it.each([
  { quantity: 0 },
  { quantity: 51 },
  { quantity: 1.5 },
  { generation: 0 },
  { generation: Number.MAX_SAFE_INTEGER + 1 },
  { orderId: 'bad' },
  { operationKey: ' bad' },
  { operationKey: 'bad\nkey' },
  { operationKey: 'x'.repeat(129) },
  { reason: ' ' },
  { actorId: 'forged' },
  { expiresAt: new Date() },
])('rejects invalid command %j', (patch) => {
  expect(allocationInput.safeParse({ ...valid, ...patch }).success).toBe(false)
})

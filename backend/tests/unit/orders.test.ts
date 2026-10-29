import { expect, it } from 'vitest'
import { buildOrderSnapshot } from '../../src/modules/orders/order-snapshot.service.js'
import {
  assertFulfillmentTransition,
  orderCreationProof,
  orderCreateCommand,
} from '../../src/modules/orders/order.schema.js'
import { checkoutCommercialDigest } from '../../src/modules/checkout/checkout-consent.service.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
it('copies immutable commercial facts and allocates integer unit refund entitlements deterministically', () => {
  const proof = syntheticOrderProof(),
    order = buildOrderSnapshot(proof, orderTestTime)
  expect(order.items[0]).toMatchObject({
    id: proof.snapshot.items[0]?.id,
    quantity: 3,
    regularUnitPoisha: 1000,
    effectiveUnitPoisha: 800,
    couponAllocatedPoisha: 500,
    netMerchandisePoisha: 1900,
    unitRefundBasePoisha: 633,
    unitRefundRemainderQty: 1,
  })
  expect(order.pricingSnapshot.finalTotalPoisha).toBe(2000)
  expect(order.customerSnapshot.phone).toBe('+8801800000000')
  expect(order.deliverySnapshot.phone).toBe('+8801700000000')
  expect(order.termsSnapshot.commercialDigest).toBe(proof.commercialDigest)
})
it('does not manufacture a confirmation timestamp or target deadline at placement', () => {
  const order = buildOrderSnapshot(syntheticOrderProof(), orderTestTime)
  expect(order.deliveryCommitment.status).toBe('awaiting_start')
  expect(order.deliveryCommitment).not.toHaveProperty('targetDeadlineAt')
  expect(order.deliveryCommitment).not.toHaveProperty('startEventAt')
  expect(order.deliveryCommitment).not.toHaveProperty('effectiveDeadlineAt')
  expect(order.deliveryCommitment.legalDeadlineAt?.toISOString()).toBe('2026-11-02T00:00:01.000Z')
})
it('rejects a mismatched consent digest and independently rejects recalculated monetary contradictions', () => {
  const badHash = syntheticOrderProof()
  badHash.commercialDigest = 'a'.repeat(64)
  expect(() => buildOrderSnapshot(badHash, orderTestTime)).toThrow()
  const badMoney = syntheticOrderProof()
  badMoney.snapshot.pricing.finalTotalPoisha++
  badMoney.commercialDigest = checkoutCommercialDigest(badMoney.snapshot)
  expect(() => buildOrderSnapshot(badMoney, orderTestTime)).toThrow()
  const badLine = syntheticOrderProof(),
    line = badLine.snapshot.items[0]
  if (!line) throw new Error('Synthetic line missing')
  line.couponAllocatedPoisha--
  badLine.commercialDigest = checkoutCommercialDigest(badLine.snapshot)
  expect(() => buildOrderSnapshot(badLine, orderTestTime)).toThrow()
})
it('rejects future consent, missing terms, duplicate methods and an unavailable selected method', () => {
  for (const change of [
    (p: ReturnType<typeof syntheticOrderProof>) => {
      p.acceptedAt = '2026-10-27T00:00:00Z'
    },
    (p: ReturnType<typeof syntheticOrderProof>) => {
      p.snapshot.policyVersions[0] = {
        type: 'privacy',
        version: 'synthetic',
        effectiveAt: '2026-01-01T00:00:00Z',
      }
    },
    (p: ReturnType<typeof syntheticOrderProof>) => {
      p.snapshot.availableMethods = Array.from({ length: 4 }, () => ({
        channel: 'cod' as const,
        active: true,
        eligible: true,
      }))
    },
    (p: ReturnType<typeof syntheticOrderProof>) => {
      p.snapshot.availableMethods = p.snapshot.availableMethods.map((m) => ({
        ...m,
        eligible: false,
      }))
    },
  ]) {
    const proof = syntheticOrderProof()
    change(proof)
    proof.commercialDigest = checkoutCommercialDigest(proof.snapshot)
    expect(() => buildOrderSnapshot(proof, orderTestTime)).toThrow()
  }
})
it('requires explicit null-or-customer ownership and rejects client lifecycle injection into the primitive', () => {
  const proof = syntheticOrderProof()
  expect(orderCreationProof.safeParse({ ...proof, userId: undefined }).success).toBe(false)
  expect(orderCreationProof.safeParse({ ...proof, paymentStatus: 'paid' }).success).toBe(false)
  expect(
    orderCreateCommand.safeParse({
      orderId: proof.orderId,
      checkoutIntentId: proof.checkoutIntentId,
      operationKey: 'synthetic',
      fulfillmentStatus: 'confirmed',
    }).success,
  ).toBe(false)
})
it('keeps zero-net units and no-coupon orders internally consistent', () => {
  const zero = buildOrderSnapshot(syntheticOrderProof({ couponValue: 2400 }), orderTestTime)
  expect(zero.items[0]).toMatchObject({
    netMerchandisePoisha: 0,
    unitRefundBasePoisha: 0,
    unitRefundRemainderQty: 0,
  })
  expect(zero.pricingSnapshot.finalTotalPoisha).toBe(100)
  const ordinary = buildOrderSnapshot(syntheticOrderProof({ noCoupon: true }), orderTestTime)
  expect(ordinary.couponSnapshot).toBeUndefined()
  expect(ordinary.items[0]?.netMerchandisePoisha).toBe(2400)
})
it('accepts only the approved fulfillment graph and keeps paid/failed out of fulfillment states', () => {
  const states = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
  ] as const
  const allowed = new Set([
    'pending:confirmed',
    'pending:cancelled',
    'confirmed:processing',
    'confirmed:cancelled',
    'processing:shipped',
    'processing:cancelled',
    'shipped:delivered',
  ])
  for (const from of states)
    for (const to of states) {
      if (allowed.has(`${from}:${to}`))
        expect(assertFulfillmentTransition({ from, to })).toMatchObject({ from, to })
      else expect(() => assertFulfillmentTransition({ from, to })).toThrow()
    }
  expect(
    assertFulfillmentTransition({ from: 'shipped', to: 'cancelled', path: 'final_non_delivery' }),
  ).toMatchObject({ path: 'final_non_delivery' })
  expect(() =>
    assertFulfillmentTransition({ from: 'pending', to: 'cancelled', path: 'final_non_delivery' }),
  ).toThrow()
  expect(() => assertFulfillmentTransition({ from: 'pending', to: 'paid' })).toThrow()
  expect(
    buildOrderSnapshot(syntheticOrderProof({ online: true }), orderTestTime).paymentMethod,
  ).toBe('online')
})

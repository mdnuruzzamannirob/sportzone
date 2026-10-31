import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import {
  calculateCorrectionRefund,
  calculateMerchandiseRefund,
} from '../../src/modules/refunds/refund-calculation.service.js'
import { refundAttemptFact } from '../../src/modules/refunds/refund-attempt.schema.js'
const id = () => new Types.ObjectId().toHexString()
const orderItemId = id()
const capacity = (allocatedPoisha = 1000, heldPoisha = 0, completedPoisha = 0) => ({
  allocatedPoisha,
  heldPoisha,
  completedPoisha,
})
const make = () => ({
  lines: [
    {
      orderItemId,
      quantity: 1,
      units: [
        {
          ordinal: 3,
          netEntitlementPoisha: 33,
          refundHeldPoisha: 0,
          refundCompletedPoisha: 0,
          eligible: true,
        },
        {
          ordinal: 1,
          netEntitlementPoisha: 34,
          refundHeldPoisha: 0,
          refundCompletedPoisha: 0,
          eligible: true,
        },
        {
          ordinal: 2,
          netEntitlementPoisha: 34,
          refundHeldPoisha: 0,
          refundCompletedPoisha: 0,
          eligible: true,
        },
      ],
    },
  ],
  source: capacity(),
  order: capacity(),
  delivery: {
    snapshotChargePoisha: 50,
    heldPoisha: 0,
    completedPoisha: 0,
    requestedPoisha: 0,
    approvedByPolicy: false,
  },
})
function getLine(input: ReturnType<typeof make>) {
  const line = input.lines[0]
  if (!line) throw new Error('Fixture line missing')
  return line
}
function getUnit(input: ReturnType<typeof make>, index: number) {
  const unit = getLine(input).units[index]
  if (!unit) throw new Error('Fixture unit missing')
  return unit
}
describe('private refund advisory calculation', () => {
  it.each([
    [1, 34],
    [2, 68],
    [3, 101],
  ])('uses original ordinal net amounts for %i units', (quantity, expected) => {
    const input = make()
    getLine(input).quantity = quantity
    const result = calculateMerchandiseRefund(input)
    expect(result.status).toBe('advisory')
    if (result.status === 'advisory') expect(result.merchandiseAmountPoisha).toBe(expected)
  })
  it('subtracts held/completed amounts and excludes ineligible units', () => {
    const input = make(),
      line = getLine(input)
    getUnit(input, 1).refundHeldPoisha = 10
    getUnit(input, 1).refundCompletedPoisha = 4
    getUnit(input, 2).eligible = false
    line.quantity = 2
    const result = calculateMerchandiseRefund(input)
    expect(result).toMatchObject({
      status: 'advisory',
      merchandiseAmountPoisha: 53,
      items: [
        {
          unitAmounts: [
            { ordinal: 1, amountPoisha: 20 },
            { ordinal: 3, amountPoisha: 33 },
          ],
        },
      ],
    })
  })
  it('does not offer a monetary refund for uncollected COD', () => {
    const input = make()
    input.source = capacity(0)
    input.order = capacity(0)
    expect(calculateMerchandiseRefund(input)).toEqual({
      status: 'insufficient_collected_balance',
      sourceAvailablePoisha: 0,
      orderAvailablePoisha: 0,
    })
  })
  it('honors both source and order caps including held and completed commitments', () => {
    const input = make()
    input.source = capacity(100, 40, 30)
    expect(calculateMerchandiseRefund(input)).toMatchObject({
      status: 'insufficient_collected_balance',
      sourceAvailablePoisha: 30,
    })
    input.source = capacity(100)
    input.order = capacity(100, 50, 20)
    expect(calculateMerchandiseRefund(input)).toMatchObject({
      status: 'insufficient_collected_balance',
      orderAvailablePoisha: 30,
    })
  })
  it('requires approved delivery policy and enforces snapshot charge net of commitments', () => {
    const input = make()
    input.delivery.requestedPoisha = 20
    expect(() => calculateMerchandiseRefund(input)).toThrow()
    input.delivery.approvedByPolicy = true
    input.delivery.heldPoisha = 20
    input.delivery.completedPoisha = 15
    expect(() => calculateMerchandiseRefund(input)).toThrow()
    input.delivery.requestedPoisha = 15
    expect(calculateMerchandiseRefund(input)).toMatchObject({
      status: 'advisory',
      amountPoisha: 49,
      deliveryAmountPoisha: 15,
    })
  })
  it('rejects invalid balances, duplicates, fractional amounts, overflows and client price additions', () => {
    const input = make()
    getUnit(input, 0).refundHeldPoisha = 34
    expect(() => calculateMerchandiseRefund(input)).toThrow()
    const duplicate = make()
    getUnit(duplicate, 0).ordinal = 1
    expect(() => calculateMerchandiseRefund(duplicate)).toThrow()
    expect(() => calculateMerchandiseRefund({ ...make(), catalogPrice: 1 })).toThrow()
    expect(() => calculateMerchandiseRefund({ ...make(), source: capacity(0.5) })).toThrow()
    expect(() =>
      calculateMerchandiseRefund({
        ...make(),
        source: capacity(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1),
      }),
    ).toThrow()
  })
  it('keeps corrections on their own capacity and never consumes merchandise quantities', () => {
    expect(
      calculateCorrectionRefund({
        source: capacity(50, 10, 5),
        order: capacity(100, 20, 0),
        requestedPoisha: 35,
      }),
    ).toMatchObject({ status: 'advisory', correctionAmountPoisha: 35 })
    expect(
      calculateCorrectionRefund({
        source: capacity(50, 10, 5),
        order: capacity(100),
        requestedPoisha: 36,
      }),
    ).toMatchObject({ status: 'insufficient_collected_balance' })
    expect(() =>
      calculateCorrectionRefund({
        source: capacity(50),
        order: capacity(50),
        requestedPoisha: 1,
        units: [],
      }),
    ).toThrow()
  })
})
describe('transient payout attempt facts', () => {
  const initiatedAt = new Date('2026-10-31T00:00:00Z')
  const gateway = () => ({
    refundId: id(),
    attemptNumber: 1,
    idempotencyKey: 'synthetic-key',
    provider: 'sslcommerz',
    originalBankTranId: 'synthetic-bank',
    refundTransId: 'merchant-id',
    amountPoisha: 100,
    initiatedAt,
    status: 'submitted',
  })
  it('keeps provider acceptance and uncertain outcomes distinct from confirmed payouts', () => {
    expect(refundAttemptFact.parse(gateway()).status).toBe('submitted')
    expect(refundAttemptFact.parse({ ...gateway(), status: 'uncertain' }).status).toBe('uncertain')
    expect(
      refundAttemptFact.safeParse({ ...gateway(), status: 'confirmed', confirmedAt: initiatedAt })
        .success,
    ).toBe(false)
    expect(
      refundAttemptFact.safeParse({
        ...gateway(),
        status: 'confirmed',
        confirmedAt: initiatedAt,
        refundRefId: 'provider-id',
      }).success,
    ).toBe(true)
  })
  it('requires bound manual confirmation evidence and a monotonic clock', () => {
    const manual = {
      refundId: id(),
      attemptNumber: 1,
      idempotencyKey: 'key',
      provider: 'manual',
      amountPoisha: 1,
      initiatedAt,
      status: 'confirmed',
      confirmedAt: initiatedAt,
    }
    expect(refundAttemptFact.safeParse(manual).success).toBe(false)
    const manualEvidence = {
      destinationMasked: '***123',
      transferReference: 'synthetic-transfer',
      evidenceDigest: 'a'.repeat(64),
      confirmedBy: id(),
      confirmedAt: initiatedAt,
    }
    expect(refundAttemptFact.safeParse({ ...manual, manualEvidence }).success).toBe(true)
    expect(
      refundAttemptFact.safeParse({ ...manual, manualEvidence, confirmedAt: new Date(0) }).success,
    ).toBe(false)
    expect(
      refundAttemptFact.safeParse({ ...manual, manualEvidence, status: 'uncertain' }).success,
    ).toBe(false)
  })
  it('requires original and bounded merchant gateway references, rejects wrong-provider evidence', () => {
    expect(
      refundAttemptFact.safeParse({ ...gateway(), refundTransId: 'a'.repeat(31) }).success,
    ).toBe(false)
    expect(refundAttemptFact.safeParse({ ...gateway(), originalBankTranId: '' }).success).toBe(
      false,
    )
    expect(refundAttemptFact.safeParse({ ...gateway(), provider: 'manual' }).success).toBe(false)
  })
})

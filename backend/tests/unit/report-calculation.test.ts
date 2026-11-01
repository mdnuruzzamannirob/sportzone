import { describe, expect, it } from 'vitest'
import { calculateFinancialReport } from '../../src/modules/reports/report-calculation.service.js'

const order = (id: string, cancelled = false) => ({
  id,
  cancelled,
  regularSubtotalPoisha: 1000,
  productDiscountPoisha: 100,
  couponDiscountPoisha: 200,
  deliveryChargePoisha: 50,
  finalTotalPoisha: 750,
})
const a = 'a'.repeat(24),
  b = 'b'.repeat(24),
  c = 'c'.repeat(24)
describe('private financial report arithmetic', () => {
  it('separates order sales, collected cash, outstanding COD and completed refund classes', () => {
    expect(
      calculateFinancialReport({
        orders: [order(a), order(b, true)],
        codBalances: [{ id: c, expectedPoisha: 1000, verifiedCollectedPoisha: 250 }],
        collections: [{ id: c, amountPoisha: 300 }],
        completedRefunds: [
          { id: a, classification: 'merchandise', amountPoisha: 100 },
          { id: b, classification: 'payment_correction', amountPoisha: 250 },
        ],
      }),
    ).toEqual({
      grossMerchandiseValuePoisha: 1000,
      productDiscountPoisha: 100,
      couponDiscountPoisha: 200,
      netAcceptedOrderSalesPoisha: 750,
      outstandingCodPoisha: 750,
      paidCollectionsPoisha: 300,
      completedMerchandiseRefundsPoisha: 100,
      completedCorrectionRefundsPoisha: 250,
      netLinkedCashFlowPoisha: -50,
    })
  })
  it('rejects duplicate receipts and inconsistent snapshots rather than inflating totals', () => {
    expect(() =>
      calculateFinancialReport({
        orders: [order(a), order(a)],
        codBalances: [],
        collections: [],
        completedRefunds: [],
      }),
    ).toThrow()
    expect(() =>
      calculateFinancialReport({
        orders: [],
        codBalances: [],
        collections: [
          { id: a, amountPoisha: 1 },
          { id: a, amountPoisha: 1 },
        ],
        completedRefunds: [],
      }),
    ).toThrow()
    expect(() =>
      calculateFinancialReport({
        orders: [{ ...order(a), finalTotalPoisha: 751 }],
        codBalances: [],
        collections: [],
        completedRefunds: [],
      }),
    ).toThrow()
    expect(() =>
      calculateFinancialReport({
        orders: [],
        codBalances: [],
        collections: [
          { id: a, amountPoisha: Number.MAX_SAFE_INTEGER },
          { id: b, amountPoisha: 1 },
        ],
        completedRefunds: [],
      }),
    ).toThrow()
  })
})

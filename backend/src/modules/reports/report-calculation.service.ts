import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'

const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const input = z.strictObject({
  orders: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-f0-9]{24}$/),
        cancelled: z.boolean(),
        regularSubtotalPoisha: money,
        productDiscountPoisha: money,
        couponDiscountPoisha: money,
        deliveryChargePoisha: money,
        finalTotalPoisha: money,
      }),
    )
    .max(5000),
  codBalances: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-f0-9]{24}$/),
        expectedPoisha: money,
        verifiedCollectedPoisha: money,
      }),
    )
    .max(5000),
  collections: z
    .array(z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/), amountPoisha: money }))
    .max(5000),
  completedRefunds: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-f0-9]{24}$/),
        classification: z.enum(['merchandise', 'payment_correction']),
        amountPoisha: money,
      }),
    )
    .max(5000),
})
const safe = (amount: bigint) => {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < -BigInt(Number.MAX_SAFE_INTEGER))
    throw new ApiError('STATE_CONFLICT')
  return Number(amount)
}
// Pure, non-authoritative arithmetic. Caller must supply deduplicated verified period/cutoff facts.
export function calculateFinancialReport(raw: unknown) {
  const facts = parseInput(input, raw)
  for (const rows of [facts.orders, facts.codBalances, facts.collections, facts.completedRefunds])
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new ApiError('STATE_CONFLICT')
  let gross = 0n,
    product = 0n,
    coupon = 0n,
    sales = 0n,
    outstanding = 0n
  for (const row of facts.orders) {
    const regular = BigInt(row.regularSubtotalPoisha),
      productDiscount = BigInt(row.productDiscountPoisha),
      couponDiscount = BigInt(row.couponDiscountPoisha),
      delivery = BigInt(row.deliveryChargePoisha),
      final = BigInt(row.finalTotalPoisha)
    if (
      productDiscount > regular ||
      couponDiscount > regular - productDiscount ||
      final !== regular - productDiscount - couponDiscount + delivery
    )
      throw new ApiError('STATE_CONFLICT')
    if (row.cancelled) continue
    gross += regular
    product += productDiscount
    coupon += couponDiscount
    sales += final
  }
  for (const balance of facts.codBalances)
    if (balance.verifiedCollectedPoisha < balance.expectedPoisha)
      outstanding += BigInt(balance.expectedPoisha) - BigInt(balance.verifiedCollectedPoisha)
  const collected = facts.collections.reduce((sum, row) => sum + BigInt(row.amountPoisha), 0n)
  const merchandise = facts.completedRefunds
    .filter((r) => r.classification === 'merchandise')
    .reduce((sum, row) => sum + BigInt(row.amountPoisha), 0n)
  const correction = facts.completedRefunds
    .filter((r) => r.classification === 'payment_correction')
    .reduce((sum, row) => sum + BigInt(row.amountPoisha), 0n)
  return {
    grossMerchandiseValuePoisha: safe(gross),
    productDiscountPoisha: safe(product),
    couponDiscountPoisha: safe(coupon),
    netAcceptedOrderSalesPoisha: safe(sales),
    outstandingCodPoisha: safe(outstanding),
    paidCollectionsPoisha: safe(collected),
    completedMerchandiseRefundsPoisha: safe(merchandise),
    completedCorrectionRefundsPoisha: safe(correction),
    netLinkedCashFlowPoisha: safe(collected - merchandise - correction),
  }
}

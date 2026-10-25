import type { ClientSession } from 'mongoose'
import type { catalogService } from '../catalog/catalog.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pricingInput, pricingRequest } from './pricing.schema.js'

const maximum = BigInt(Number.MAX_SAFE_INTEGER)
function amount(value: bigint) {
  if (value < 0n || value > maximum) throw new ApiError('BUSINESS_RULE_VIOLATION')
  return Number(value)
}
// Exact arithmetic only. Caller supplies server-owned line IDs and approved coupon scope/terms;
// this calculator does not establish eligibility, consume quota or authorize a checkout.
export function calculatePricing(raw: unknown) {
  const input = parseInput(pricingInput, raw)
  const lines = input.items.map((item) => {
    const regular = BigInt(item.regularUnitPoisha) * BigInt(item.quantity)
    const sale = BigInt(item.effectiveUnitPoisha) * BigInt(item.quantity)
    return {
      item,
      regular,
      sale,
      eligible: item.couponEligible ? sale : 0n,
      discount: 0n,
      remainder: 0n,
    }
  })
  const regularSubtotal = lines.reduce((sum, line) => sum + line.regular, 0n)
  const saleSubtotal = lines.reduce((sum, line) => sum + line.sale, 0n)
  const eligible = lines.reduce((sum, line) => sum + line.eligible, 0n)
  if (input.coupon && eligible === 0n) throw new ApiError('BUSINESS_RULE_VIOLATION')
  let discount = 0n
  if (input.coupon) {
    const value = BigInt(input.coupon.value)
    discount = input.coupon.type === 'fixed' ? value : (eligible * value + 5000n) / 10000n
    if (discount > eligible) discount = eligible
  }
  if (discount > 0n) {
    for (const line of lines) {
      line.discount = (discount * line.eligible) / eligible
      line.remainder = (discount * line.eligible) % eligible
    }
    let remaining = discount - lines.reduce((sum, line) => sum + line.discount, 0n)
    const ranked = lines
      .filter((line) => line.eligible > 0n)
      .sort((a, b) =>
        a.remainder === b.remainder
          ? a.item.id < b.item.id
            ? -1
            : a.item.id > b.item.id
              ? 1
              : 0
          : a.remainder > b.remainder
            ? -1
            : 1,
      )
    for (const line of ranked) {
      if (remaining === 0n) break
      line.discount += 1n
      remaining -= 1n
    }
    if (remaining !== 0n) throw new ApiError('STATE_CONFLICT')
  }
  const delivery = BigInt(input.deliveryChargePoisha)
  const result = {
    items: lines.map(({ item, regular, sale, discount: allocated }) => ({
      ...item,
      regularLinePoisha: amount(regular),
      productDiscountPoisha: amount(regular - sale),
      saleLinePoisha: amount(sale),
      couponAllocatedPoisha: amount(allocated),
      netMerchandisePoisha: amount(sale - allocated),
    })),
    regularSubtotalPoisha: amount(regularSubtotal),
    productDiscountPoisha: amount(regularSubtotal - saleSubtotal),
    saleSubtotalPoisha: amount(saleSubtotal),
    couponEligibleSubtotalPoisha: amount(eligible),
    couponDiscountPoisha: amount(discount),
    deliveryChargePoisha: amount(delivery),
    finalTotalPoisha: amount(saleSubtotal - discount + delivery),
  }
  // Reconcile using exact integers even at the safe-number boundary.
  if (
    lines.reduce((sum, line) => sum + line.discount, 0n) !== discount ||
    lines.reduce((sum, line) => sum + line.sale - line.discount, delivery) !==
      BigInt(result.finalTotalPoisha)
  )
    throw new ApiError('STATE_CONFLICT')
  return result
}

export function createPricingService(
  catalog: Pick<ReturnType<typeof catalogService>, 'cartSelections'>,
) {
  return {
    async quote(raw: unknown, session?: ClientSession) {
      const input = parseInput(pricingRequest, raw)
      const selections = await catalog.cartSelections(
        input.items.map((item) => item.variantId),
        session,
      )
      const items = input.items.map((item) => {
        const selected = selections.get(item.variantId)
        if (!selected) throw new ApiError('BUSINESS_RULE_VIOLATION')
        return {
          ...item,
          regularUnitPoisha: selected.product.regularPricePoisha,
          effectiveUnitPoisha: selected.estimatedUnitPoisha,
        }
      })
      return calculatePricing({ ...input, items })
    },
  }
}

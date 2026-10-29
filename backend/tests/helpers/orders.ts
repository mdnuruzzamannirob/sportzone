import { Types } from 'mongoose'
import { calculatePricing } from '../../src/modules/promotions/pricing.service.js'
import { checkoutCommercialSnapshot } from '../../src/modules/checkout/checkout.schema.js'
import { checkoutCommercialDigest } from '../../src/modules/checkout/checkout-consent.service.js'
import { deliveryDeadlineRule } from '../../src/modules/orders/delivery-deadline.schema.js'
import { deliveryDeadlineDigest } from '../../src/modules/orders/delivery-deadline.service.js'
import { orderCreationProof } from '../../src/modules/orders/order.schema.js'
export const orderTestTime = new Date('2026-10-26T00:00:01Z')
export function syntheticOrderProof(
  options: {
    userId?: string | null
    online?: boolean
    couponValue?: number
    noCoupon?: boolean
  } = {},
) {
  const id = () => new Types.ObjectId().toHexString(),
    variantId = id(),
    itemId = id()
  const rule = deliveryDeadlineRule.parse({
    version: 'synthetic-v1',
    timezone: 'Asia/Dhaka',
    effectiveFrom: '2026-01-01T00:00:00Z',
    target: { startEvent: 'confirmedAt', calendarDays: 14 },
    legalCaps: [{ ruleRef: 'synthetic-cap', startEvent: 'placedAt', calendarDays: 7 }],
  })
  const couponValue = options.couponValue ?? 500
  const priced = calculatePricing({
    items: [
      {
        id: itemId,
        variantId,
        quantity: 3,
        couponEligible: !options.noCoupon,
        regularUnitPoisha: 1000,
        effectiveUnitPoisha: 800,
      },
    ],
    deliveryChargePoisha: 100,
    ...(!options.noCoupon ? { coupon: { type: 'fixed', value: couponValue } } : {}),
  })
  const { items, couponEligibleSubtotalPoisha, ...totals } = priced
  const method = options.online ? 'bkash' : 'cod'
  const snapshot = checkoutCommercialSnapshot.parse({
    draft: {
      items: [{ variantId, quantity: 3 }],
      recipient: {
        recipient: 'Synthetic recipient',
        phone: '+8801700000000',
        districtKey: 'dhaka',
        areaKey: 'synthetic',
        street: 'Synthetic street',
      },
      customer: {
        name: 'Synthetic buyer',
        email: 'synthetic@example.test',
        phone: '+8801800000000',
      },
      ...(!options.noCoupon ? { couponCode: 'SYNTHETIC' } : {}),
      method,
    },
    items: items.map(({ saleLinePoisha, ...line }) => {
      void saleLinePoisha
      return {
        ...line,
        productId: id(),
        productName: 'Synthetic product',
        sku: 'SYNTHETIC-SKU',
        variantAttributes: { size: 'm' },
      }
    }),
    pricing: { ...totals, currency: 'BDT' },
    delivery: {
      zoneId: id(),
      chargeRuleId: id(),
      coverageKey: 'dhaka:synthetic',
      amountPoisha: 100,
      ruleVersion: 1,
    },
    ...(!options.noCoupon
      ? {
          coupon: {
            couponId: id(),
            code: 'SYNTHETIC',
            type: 'fixed',
            value: couponValue,
            termsVersion: 1,
            eligibleSubtotalPoisha: couponEligibleSubtotalPoisha,
            discountPoisha: totals.couponDiscountPoisha,
          },
        }
      : {}),
    deadlineBasis: {
      rule,
      review: {
        evidenceRef: 'synthetic:test-only',
        approvedAt: '2026-01-01T00:00:00Z',
        approvedBy: 'Synthetic reviewer',
        ruleDigest: deliveryDeadlineDigest(rule),
      },
      capturedAt: '2026-10-25T00:00:00Z',
    },
    deliveryDeadline: {
      status: 'awaiting_start',
      startEvent: 'confirmedAt',
      ruleVersion: rule.version,
    },
    availableMethods: ['cod', 'bkash', 'nagad', 'rocket'].map((channel) => ({
      channel,
      active: channel === method,
      eligible: channel === method,
    })),
    policyVersions: [
      { type: 'terms', version: 'synthetic-terms', effectiveAt: '2026-01-01T00:00:00Z' },
    ],
  })
  return orderCreationProof.parse({
    orderId: id(),
    checkoutIntentId: id(),
    quoteId: id(),
    userId: options.userId ?? null,
    acceptedAt: '2026-10-26T00:00:00Z',
    commercialDigest: checkoutCommercialDigest(snapshot),
    snapshot,
    notes: 'Synthetic note',
  })
}

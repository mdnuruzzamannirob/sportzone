'use client'

import { Card } from '../ui/index'
import { useId } from 'react'
import { formatBdt } from '../../lib/format-bdt'

// Presentation input: adapt the API quote or immutable order pricing snapshot at the feature boundary.
export type SummaryAmounts = {
  regularSubtotalPoisha: number
  productDiscountPoisha: number
  couponDiscountPoisha: number
  deliveryChargePoisha: number
  finalTotalPoisha: number
}
type Method = 'cod' | 'bkash' | 'nagad' | 'rocket'
const methods: Record<Method, string> = {
  cod: 'Cash on delivery',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
}
export function OrderSummary({
  amounts,
  kind,
  method,
}: {
  amounts: SummaryAmounts
  kind: 'estimate' | 'quote' | 'order'
  method?: Method
}) {
  const id = useId()
  const rows = [
    ['Subtotal', formatBdt(amounts.regularSubtotalPoisha)],
    [
      'Product discounts',
      `${amounts.productDiscountPoisha > 0 ? '−' : ''}${formatBdt(amounts.productDiscountPoisha)}`,
    ],
    [
      'Coupon discount',
      `${amounts.couponDiscountPoisha > 0 ? '−' : ''}${formatBdt(amounts.couponDiscountPoisha)}`,
    ],
    ['Delivery charge', formatBdt(amounts.deliveryChargePoisha)],
    [
      kind === 'estimate'
        ? 'Estimated total'
        : kind === 'quote'
          ? 'Quoted total'
          : 'Order total',
      formatBdt(amounts.finalTotalPoisha),
    ],
  ]
  return (
    <Card aria-labelledby={id} className="">
      <Card.Header>
        <h2 id={id} className="text-xl">
          Order summary
        </h2>
      </Card.Header>
      <Card.Content className="space-y-4">
        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt>{label}</dt>
              <dd className="tabular-nums font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          Payment method: {method ? methods[method] : 'Not selected'}
        </p>
        <p className="text-sm text-muted">
          {kind === 'order'
            ? 'Recorded order amounts. Payment status is shown separately.'
            : 'Prices, discounts, delivery and stock are rechecked when placing your order.'}
        </p>
      </Card.Content>
    </Card>
  )
}

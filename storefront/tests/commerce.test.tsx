// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Price } from '../src/components/commerce/price'
import { ProductCard } from '../src/components/commerce/product-card'
import { VariantSelector } from '../src/components/commerce/variant-selector'
import { CartLine } from '../src/components/commerce/cart-line'
import { StatusBadge, AvailabilityBadge } from '../src/components/commerce/status-badge'
import { OrderSummary } from '../src/components/commerce/order-summary'
import { CommerceSkeleton } from '../src/components/commerce/commerce-skeleton'
import { Button } from '../src/components/ui/button'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement, root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  document.documentElement.removeAttribute('data-theme')
})
async function click(node: HTMLElement | null | undefined) {
  expect(node).toBeTruthy()
  await act(() => {
    node?.focus()
    node?.click()
  })
}
const product = {
  name: 'Synthetic sports ball',
  href: '/products/synthetic-ball',
  effectivePricePoisha: 123450,
  regularPricePoisha: 140000,
  availability: 'available' as const,
}
const line = {
  name: 'Synthetic sports ball',
  href: '/products/synthetic-ball',
  variant: 'Size M / Black',
  sku: 'SYNTHETIC-M',
  quantity: 1,
  maxQuantity: 3,
  availability: 'available' as const,
  estimatedUnitPoisha: 10000,
  estimatedLinePoisha: 9901,
}
const amounts = {
  regularSubtotalPoisha: 10000,
  productDiscountPoisha: 1000,
  couponDiscountPoisha: 500,
  deliveryChargePoisha: 2500,
  finalTotalPoisha: 9876,
}

describe.each(['light', 'dark'])('commerce foundations in %s', (theme) => {
  beforeEach(() => {
    document.documentElement.dataset.theme = theme
  })
  it.each([
    { regular: 140000, sale: true },
    { regular: 123450, sale: false },
    { regular: 100000, sale: false },
    { regular: undefined, sale: false },
  ])(
    'COMMERCE-01: regular $regular produces only a genuine sale comparison',
    ({ regular, sale }) => {
      const html = renderToStaticMarkup(
        <Price amountPoisha={123450} regularPricePoisha={regular} />,
      )
      expect(html).toContain('৳1,234.50')
      expect(html.includes('<del')).toBe(sale)
      expect(html.includes('Sale')).toBe(sale)
      expect(html).toContain('Price:')
    },
  )
  it('COMMERCE-02: zero and large amounts use exact integer-poisha formatting; invalid money is rejected', () => {
    expect(renderToStaticMarkup(<Price amountPoisha={0} />)).toContain('৳0')
    expect(
      renderToStaticMarkup(<Price amountPoisha={Number.MAX_SAFE_INTEGER} />),
    ).toContain('৳90,071,992,547,409.91')
    expect(() => renderToStaticMarkup(<Price amountPoisha={1.5} />)).toThrow(RangeError)
  })
  it('COMMERCE-03: product action is separate from its link; approved rating and availability are explicit text', async () => {
    const action = vi.fn()
    await act(() =>
      root.render(
        <ProductCard
          {...product}
          approvedRating={{ average: 4.5, count: 12 }}
          action={<Button onPress={action}>Example action</Button>}
        />,
      ),
    )
    expect(host.querySelector('a')?.getAttribute('href')).toBe(product.href)
    expect(host.querySelector('a button, button a')).toBeNull()
    expect(host.textContent).toContain('4.5 out of 5 · 12 approved reviews')
    expect(host.textContent).toContain('Available to order')
    expect(host.textContent).toContain('Image unavailable')
    await click(host.querySelector('button'))
    expect(action).toHaveBeenCalledOnce()
  })
  it('COMMERCE-04: absent/unapproved or invalid rating never fabricates review counts; unavailable/unknown stock is readable', () => {
    const unavailable = renderToStaticMarkup(
      <ProductCard
        {...product}
        availability="unavailable"
        approvedRating={{ average: 5, count: 0 }}
      />,
    )
    expect(unavailable).toContain('Out of stock')
    expect(unavailable).not.toContain('approved reviews')
    expect(unavailable).not.toContain('Add to cart')
    expect(
      renderToStaticMarkup(<ProductCard {...product} availability="unknown" />),
    ).toContain('Availability unconfirmed')
  })
  it('COMMERCE-05: failed image gets an honest fallback and a replacement source restores the image with alt text', async () => {
    await act(() =>
      root.render(
        <ProductCard
          {...product}
          image={{ src: '/synthetic-photo.webp', alt: 'Synthetic ball side view' }}
        />,
      ),
    )
    const image = host.querySelector('img')
    expect(image?.alt).toBe('Synthetic ball side view')
    await act(() => image?.dispatchEvent(new Event('error')))
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('Image unavailable')
    await act(() =>
      root.render(
        <ProductCard
          {...product}
          image={{ src: '/synthetic-replacement.webp', alt: 'Replacement view' }}
        />,
      ),
    )
    expect(host.querySelector('img')?.alt).toBe('Replacement view')
  })
  it('COMMERCE-06: variant availability is text, disabled choices cannot activate and selected state is announced', async () => {
    const change = vi.fn()
    const options = [
      { id: 'm', label: 'Size M', available: true },
      { id: 'l', label: 'Size L', available: false },
    ]
    function Example() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <VariantSelector
          options={options}
          value={value}
          onChange={(next) => {
            change(next)
            setValue(next)
          }}
        />
      )
    }
    await act(() => root.render(<Example />))
    expect(host.textContent).toContain(
      'Choose an available variant before adding to cart.',
    )
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios[1].disabled).toBe(true)
    await click(radios[1])
    expect(change).not.toHaveBeenCalled()
    await click(radios[0])
    expect(change).toHaveBeenCalledWith('m')
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'Selected: Size M',
    )
    expect(host.textContent).toContain('Stock is rechecked at checkout.')
  })
  it('COMMERCE-07: stale unavailable selection, empty and loading variants give clear recovery without a purchase claim', async () => {
    await act(() =>
      root.render(
        <VariantSelector
          options={[{ id: 'm', label: 'Size M', available: false }]}
          value="m"
          onChange={vi.fn()}
          isPending
        />,
      ),
    )
    expect(host.textContent).toContain('This variant is unavailable')
    expect(host.textContent).toContain('Checking variants…')
    expect(host.querySelector<HTMLInputElement>('input[type="radio"]')?.disabled).toBe(
      true,
    )
    await act(() =>
      root.render(<VariantSelector options={[]} value={null} onChange={vi.fn()} />),
    )
    expect(host.textContent).toContain('No variants available.')
  })
  it('COMMERCE-08: quantity bounds and removal send requests while supplied line totals remain untouched', async () => {
    const change = vi.fn(),
      remove = vi.fn()
    function Example() {
      const [quantity, setQuantity] = useState(1)
      return (
        <CartLine
          {...line}
          quantity={quantity}
          maxQuantity={2}
          onQuantityChange={(value) => {
            change(value)
            setQuantity(value)
          }}
          onRemove={remove}
        />
      )
    }
    await act(() => root.render(<Example />))
    const minus = host.querySelector<HTMLButtonElement>(
      '[data-slot="number-field-decrement-button"]',
    )
    const plus = host.querySelector<HTMLButtonElement>(
      '[data-slot="number-field-increment-button"]',
    )
    expect(minus?.disabled).toBe(true)
    await click(plus)
    expect(change).toHaveBeenCalledWith(2)
    expect(plus?.disabled).toBe(true)
    await click(plus)
    expect(change).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('৳99.01')
    expect(host.textContent).not.toContain('৳200')
    expect(host.textContent).toContain('Estimated line total')
    await click(host.querySelector('button[aria-label^="Remove"]'))
    expect(remove).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('do not reserve stock')
  })
  it('COMMERCE-09: pending/unavailable cart lines disable changes; warnings and original requested quantities remain visible', async () => {
    const change = vi.fn(),
      remove = vi.fn()
    await act(() =>
      root.render(
        <CartLine
          {...line}
          quantity={2}
          maxQuantity={0}
          availability="unavailable"
          warning="Price and stock changed. Review this item."
          isPending
          onQuantityChange={change}
          onRemove={remove}
        />,
      ),
    )
    expect(
      host.querySelector<HTMLInputElement>('[data-slot="number-field-input"]')
        ?.disabled,
    ).toBe(true)
    expect(
      host.querySelector<HTMLInputElement>('[data-slot="number-field-input"]')?.value,
    ).toBe('2')
    expect(host.textContent).toContain('Price and stock changed')
    await click(host.querySelector('button[aria-label^="Remove"]'))
    expect(remove).not.toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Updating cart item')
  })
  it('COMMERCE-10: payment/funding status remains caller-supplied text, never inferred from totals', () => {
    const html = renderToStaticMarkup(
      <>
        <StatusBadge label="Payment pending" tone="warning" />
        <StatusBadge label="Refund awaiting payout" tone="info" />
        <AvailabilityBadge availability="unknown" />
      </>,
    )
    expect(html).toContain('Payment pending')
    expect(html).toContain('Refund awaiting payout')
    expect(html).toContain('Availability unconfirmed')
    expect(html).not.toContain('Paid')
  })
  it.each(['estimate', 'quote', 'order'] as const)(
    'COMMERCE-11: %s summary displays the supplied final total and separate payment method without recalculation',
    (kind) => {
      const html = renderToStaticMarkup(
        <OrderSummary amounts={amounts} kind={kind} method="cod" />,
      )
      expect(html).toContain('৳98.76')
      expect(html).not.toContain('৳110')
      expect(html).toContain('Cash on delivery')
      expect(html).not.toContain('Payment successful')
      expect(html).toContain(
        kind === 'estimate'
          ? 'Estimated total'
          : kind === 'quote'
            ? 'Quoted total'
            : 'Order total',
      )
      expect(html).toContain(
        kind === 'order'
          ? 'Payment status is shown separately'
          : 'rechecked when placing your order',
      )
    },
  )
  it.each(['product', 'cart-line', 'summary'] as const)(
    'COMMERCE-12: %s skeleton has one loading announcement and no invented price or stock',
    (kind) => {
      const html = renderToStaticMarkup(<CommerceSkeleton kind={kind} />)
      expect(html.match(/role="status"/g)).toHaveLength(1)
      expect(html).toContain('aria-hidden="true"')
      expect(html).toContain('aria-busy="true"')
      expect(html).not.toContain('৳')
      expect(html).not.toContain('Available to order')
    },
  )
  it('COMMERCE-13: direct quantity input commits bounded integers and rejects nonnumeric requests', async () => {
    const change = vi.fn()
    function Example() {
      const [quantity, setQuantity] = useState(1)
      return (
        <CartLine
          {...line}
          quantity={quantity}
          onQuantityChange={(value) => {
            change(value)
            setQuantity(value)
          }}
          onRemove={vi.fn()}
        />
      )
    }
    await act(() => root.render(<Example />))
    const input = host.querySelector<HTMLInputElement>(
      '[data-slot="number-field-input"]',
    )
    if (!input) throw new Error('Quantity input missing')
    async function enter(value: string) {
      await act(() => {
        input?.focus()
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
          input,
          value,
        )
        input?.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(() => input?.blur())
    }
    await enter('2')
    expect(change).toHaveBeenLastCalledWith(2)
    await enter('not-a-number')
    await enter('999')
    expect(input.value).toBe('3')
    for (const [value] of change.mock.calls)
      expect(Number.isSafeInteger(value) && value >= 1 && value <= 3).toBe(true)
  })
})

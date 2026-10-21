'use client'

import { Card, Label, NumberField } from '../ui/index'
import { useId } from 'react'
import { Button } from '../ui/button'
import { Notice } from '../ui/feedback'
import { Link } from '../ui/link'
import { Price } from './price'
import { ProductImage, type ProductImageSource } from './product-image'
import { AvailabilityBadge, type Availability } from './status-badge'

type Props = {
  name: string
  href: string
  variant: string
  sku: string
  image?: ProductImageSource
  quantity: number
  maxQuantity: number
  availability: Availability
  estimatedUnitPoisha: number
  estimatedLinePoisha: number
  warning?: string
  isPending?: boolean
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}
export function CartLine({
  name,
  href,
  variant,
  sku,
  image,
  quantity,
  maxQuantity,
  availability,
  estimatedUnitPoisha,
  estimatedLinePoisha,
  warning,
  isPending = false,
  onQuantityChange,
  onRemove,
}: Props) {
  const id = useId()
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !Number.isSafeInteger(maxQuantity) ||
    maxQuantity < 0
  )
    throw new RangeError(
      'Cart quantity display requires positive integer quantity and nonnegative integer limit',
    )
  const disabled = isPending || availability !== 'available' || maxQuantity === 0
  return (
    <Card className="min-w-0">
      <Card.Content className="grid min-w-0 gap-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
        <div className="w-24">
          <ProductImage key={image?.src ?? 'missing'} image={image} sizes="96px" />
        </div>
        <div className="min-w-0 space-y-3">
          <h3 className="text-lg">
            <Link href={href}>{name}</Link>
          </h3>
          <p className="break-words text-sm text-muted">
            {variant} · SKU: {sku}
          </p>
          <AvailabilityBadge availability={availability} />
          <p>
            <Price label="Estimated unit price" amountPoisha={estimatedUnitPoisha} />
          </p>
          <NumberField
            id={id}
            value={quantity}
            minValue={1}
            maxValue={maxQuantity || undefined}
            step={1}
            formatOptions={{ maximumFractionDigits: 0, useGrouping: false }}
            isDisabled={disabled}
            onChange={(next) => {
              if (
                !disabled &&
                typeof next === 'number' &&
                Number.isSafeInteger(next) &&
                next >= 1 &&
                next <= maxQuantity
              )
                onQuantityChange(next)
            }}
          >
            <Label>Quantity for {name}</Label>
            <NumberField.Group className="h-auto  w-fit max-w-full">
              <NumberField.DecrementButton

                aria-label={`Decrease quantity for ${name}`}
              />
              <NumberField.Input className=" w-16 tabular-nums" />
              <NumberField.IncrementButton

                aria-label={`Increase quantity for ${name}`}
              />
            </NumberField.Group>
          </NumberField>
          {isPending ? (
            <p role="status" className="text-sm text-muted">
              Updating cart item…
            </p>
          ) : disabled ? (
            <p className="text-sm text-muted">
              Quantity changes are unavailable. Remove this item or check availability.
            </p>
          ) : quantity > maxQuantity ? (
            <Notice tone="warning" title="Quantity needs updating">
              Choose a quantity within the current limit of {maxQuantity}.
            </Notice>
          ) : null}
          <p>
            <Price label="Estimated line total" amountPoisha={estimatedLinePoisha} />
          </p>
          <Button
            variant="ghost"
            isDisabled={isPending}
            onPress={onRemove}
            aria-label={`Remove ${name} from cart`}
          >
            Remove
          </Button>
        </div>
      </Card.Content>
      <Card.Footer className="mt-4 flex flex-col items-start gap-3">
        <p className="text-sm text-muted">
          Cart estimates do not reserve stock. Final prices are checked at checkout.
        </p>
        {warning && (
          <Notice tone="warning" title="Cart item needs attention">
            {warning}
          </Notice>
        )}
      </Card.Footer>
    </Card>
  )
}

'use client'

import { Card } from '@heroui/react'
import type { ReactNode } from 'react'
import { Link } from '../ui/link'
import { Price } from './price'
import { ProductImage, type ProductImageSource } from './product-image'
import { AvailabilityBadge, type Availability } from './status-badge'

type Props = {
  name: string
  href: string
  image?: ProductImageSource
  effectivePricePoisha: number
  regularPricePoisha?: number
  availability: Availability
  approvedRating?: { average: number; count: number }
  action?: ReactNode
}
export function ProductCard({
  name,
  href,
  image,
  effectivePricePoisha,
  regularPricePoisha,
  availability,
  approvedRating,
  action,
}: Props) {
  const rating =
    approvedRating &&
    Number.isFinite(approvedRating.average) &&
    approvedRating.average >= 1 &&
    approvedRating.average <= 5 &&
    Number.isSafeInteger(approvedRating.count) &&
    approvedRating.count > 0
      ? approvedRating
      : undefined
  return (
    <Card className="h-full min-w-0 border border-border p-4">
      <Card.Content className="flex flex-col gap-4">
        <Link href={href} className="flex w-full min-w-0 flex-col items-start gap-3">
          <ProductImage key={image?.src ?? 'missing'} image={image} />
          <h3 className="wrap-break-word text-base font-semibold">{name}</h3>
        </Link>
        <Price
          amountPoisha={effectivePricePoisha}
          regularPricePoisha={regularPricePoisha}
        />
        <AvailabilityBadge availability={availability} />
        <p className="text-xs text-text-muted">Stock is rechecked at checkout.</p>
        {rating && (
          <p className="text-sm text-text-muted">
            {rating.average} out of 5 · {rating.count} approved reviews
          </p>
        )}
      </Card.Content>
      {action && <Card.Footer className="mt-auto pt-4">{action}</Card.Footer>}
    </Card>
  )
}

'use client'

import { Card, Skeleton } from '@heroui/react'

export function CommerceSkeleton({
  kind = 'product',
}: {
  kind?: 'product' | 'cart-line' | 'summary'
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <p className="sr-only">
        {kind === 'product'
          ? 'Loading product…'
          : kind === 'cart-line'
            ? 'Loading cart item…'
            : 'Loading order summary…'}
      </p>
      <Card aria-hidden="true" className="rounded-card border border-border p-4">
        <Card.Content className="space-y-4">
          {kind === 'product' && (
            <Skeleton className="aspect-square w-full rounded-card" />
          )}
          {kind === 'cart-line' && <Skeleton className="h-24 w-24 rounded-card" />}
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          {kind === 'summary' && (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-6 w-full" />
            </>
          )}
        </Card.Content>
      </Card>
    </div>
  )
}

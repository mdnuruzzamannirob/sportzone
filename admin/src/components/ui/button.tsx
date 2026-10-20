'use client'

import { Button as HeroButton, Spinner, type ButtonProps } from '@heroui/react'

type Props = Omit<ButtonProps, 'variant' | 'className'> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  className?: string
  pendingLabel?: string
}

// App-owned defaults; feature actions and state remain with the caller.
export function Button({
  className = '',
  variant = 'primary',
  isPending,
  pendingLabel = 'Working…',
  children,
  ...props
}: Props) {
  return (
    <HeroButton
      {...props}
      variant={variant}
      isPending={isPending}
      className={`min-h-control ${className}`}
    >
      {isPending ? (
        <>
          <Spinner role="presentation" aria-hidden="true" size="sm" color="current" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </HeroButton>
  )
}

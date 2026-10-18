'use client'

import { Button as HeroButton, type ButtonProps } from '@heroui/react'

type Props = Omit<ButtonProps, 'variant' | 'className'> & {
  variant?: 'primary' | 'outline' | 'ghost'
  className?: string
}

// App-owned defaults; feature actions and state remain with the caller.
export function Button({ className = '', variant = 'primary', ...props }: Props) {
  return (
    <HeroButton
      {...props}
      variant={variant}
      className={`min-h-control rounded-control ${className}`}
    />
  )
}

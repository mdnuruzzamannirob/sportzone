'use client'

import { Button as HeroButton, Spinner, type ButtonProps } from './primitives'

type Props = ButtonProps & { pendingLabel?: string }
export function Button({ isPending, pendingLabel, children, ...props }: Props) {
  return <HeroButton {...props} isPending={isPending}>
    {isPending && pendingLabel ? <><Spinner role="presentation" aria-hidden="true" size="sm" color="current" />{pendingLabel}</> : children}
  </HeroButton>
}

'use client'

import { Link as HeroLink } from './primitives'
import NextLink from 'next/link'
import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<typeof NextLink>, 'href' | 'className'> & {
  href: string
  className?: string
}

export function Link({ href, children, className = '', onClick, ref, ...rest }: Props) {
  return (
    <HeroLink
      href={href}
      ref={ref}
      className={className}
      render={(props) => (
        <NextLink
          {...props}
          {...rest}
          ref={(element) => {
            if (typeof props.ref === 'function') return props.ref(element)
            if (props.ref) props.ref.current = element
          }}
          href={href}
          onClick={(event) => {
            props.onClick?.(event)
            onClick?.(event)
          }}
        />
      )}
    >
      {children}
    </HeroLink>
  )
}

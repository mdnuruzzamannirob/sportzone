import { Link as HeroLink } from './primitives'
import { Link as RouterLink } from 'react-router'
import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<typeof RouterLink>, 'to' | 'className'> & {
  to: string
  className?: string
}

export function Link({ to, children, className = '', onClick, ref, ...rest }: Props) {
  return (
    <HeroLink
      href={to}
      ref={ref}
      className={className}
      render={(props) => (
        <RouterLink
          {...props}
          {...rest}
          ref={(element) => {
            if (typeof props.ref === 'function') return props.ref(element)
            if (props.ref) props.ref.current = element
          }}
          to={to}
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

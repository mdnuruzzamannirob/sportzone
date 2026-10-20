'use client'

import { Alert, Card, Skeleton, Spinner } from './primitives'
import { type ReactNode, useId } from 'react'

const statuses = {
  info: 'default',
  success: 'success',
  warning: 'warning',
  error: 'danger',
} as const
export function Notice({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: keyof typeof statuses
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <Alert
      status={statuses[tone]}
      role={tone === 'error' ? 'alert' : 'status'}

    >
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        {children && <Alert.Description>{children}</Alert.Description>}
        {actions}
      </Alert.Content>
    </Alert>
  )
}
export function LoadingState({
  label = 'Loading…',
  skeleton = false,
}: {
  label?: string
  skeleton?: boolean
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <p className="flex items-center gap-3">
        <Spinner role="presentation" aria-hidden="true" />
        {label}
      </p>
      {skeleton && (
        <div aria-hidden="true" className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
    </div>
  )
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  const id = useId()
  return (
    <Card aria-labelledby={id}>
      <Card.Header>
        <h2 id={id} className="text-xl">
          {title}
        </h2>
      </Card.Header>
      <Card.Content>
        <p className="text-muted">{children}</p>
      </Card.Content>
      {action && <Card.Footer>{action}</Card.Footer>}
    </Card>
  )
}

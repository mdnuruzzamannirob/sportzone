'use client'

import { Alert, Form as HeroForm, type FormProps } from '@heroui/react'
import { useEffect, useId, useRef } from 'react'
import { Link } from './link'

// Callers own validation, request state and backend idempotency. Never reset on failure.
export function Form({
  isPending = false,
  onSubmit,
  ...props
}: FormProps & { isPending?: boolean }) {
  return (
    <HeroForm
      {...props}
      aria-busy={isPending}
      onSubmit={(event) => {
        event.preventDefault()
        if (!isPending) onSubmit?.(event)
      }}
    />
  )
}

export type FieldIssue = { fieldId: string; message: string }
export function FormErrorSummary({
  errors,
  focusKey,
}: {
  errors: readonly FieldIssue[]
  focusKey?: number
}) {
  const titleId = useId()
  const summary = useRef<HTMLDivElement>(null)
  // Increment only after a failed submission; ordinary typing must not steal focus.
  useEffect(() => {
    if (focusKey !== undefined) summary.current?.focus()
  }, [focusKey])
  if (!errors.length) return null
  return (
    <Alert
      ref={summary}
      tabIndex={-1}
      role="alert"
      aria-labelledby={titleId}
      className="border border-danger p-4"
    >
      <Alert.Content>
        <h2 id={titleId} className="font-semibold text-danger">
          Please check the following fields
        </h2>
        <ul className="mt-2 space-y-2">
          {errors.map((error) => (
            <li key={error.fieldId}>
              <Link
                href={`#${encodeURIComponent(error.fieldId)}`}
                onClick={(event) => {
                  const field = document.getElementById(error.fieldId)
                  if (field) {
                    event.preventDefault()
                    field.focus()
                  }
                }}
              >
                {error.message}
              </Link>
            </li>
          ))}
        </ul>
      </Alert.Content>
    </Alert>
  )
}

'use client'

import { useId } from 'react'
import { RadioChoices } from '../ui/fields'
import { LoadingState } from '../ui/feedback'

type VariantOption = { id: string; label: string; available: boolean }
export function VariantSelector({
  label = 'Choose a variant',
  options,
  value,
  onChange,
  isPending = false,
  error,
}: {
  label?: string
  options: readonly VariantOption[]
  value: string | null
  onChange: (id: string) => void
  isPending?: boolean
  error?: string
}) {
  const id = useId()
  const selected = options.find((option) => option.id === value)
  return (
    <div className="space-y-3">
      <RadioChoices
        aria-describedby={id}
        label={label}
        value={value ?? ''}
        isDisabled={isPending}
        isRequired
        error={
          error ??
          (selected && !selected.available
            ? 'This variant is unavailable. Choose another option.'
            : undefined)
        }
        options={options.map((option) => ({
          value: option.id,
          label: option.available ? option.label : `${option.label} — Unavailable`,
          disabled: !option.available,
        }))}
        onChange={(next) => {
          if (!isPending && options.some((option) => option.id === next && option.available))
            onChange(next)
        }}
      />
      <p id={id} role="status" className="text-sm text-muted">
        {!options.length
          ? 'No variants available.'
          : selected?.available
            ? `Selected: ${selected.label}. Stock is rechecked at checkout.`
            : 'Choose an available variant before adding to cart.'}
      </p>
      {isPending && <LoadingState label="Checking variants…" />}
    </div>
  )
}

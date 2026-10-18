'use client'

import { Chip } from '@heroui/react'

const tones = {
  neutral: 'text-text',
  info: 'text-info-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const
export type Availability = 'available' | 'unavailable' | 'unknown'
export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: keyof typeof tones
}) {
  return (
    <Chip variant="soft" className={`border border-border ${tones[tone]}`}>
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  )
}
export function AvailabilityBadge({ availability }: { availability: Availability }) {
  const state = {
    available: ['Available to order', 'neutral'],
    unavailable: ['Out of stock', 'warning'],
    unknown: ['Availability unconfirmed', 'neutral'],
  } as const
  const [label, tone] = state[availability] ?? state.unknown
  return <StatusBadge label={label} tone={tone} />
}

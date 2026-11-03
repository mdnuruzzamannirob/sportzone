import type { ClientSession } from 'mongoose'

type CheckoutSettingsAccess = (
  session: ClientSession,
  now: Date,
) => Promise<{
  flags: {
    bkashEnabled: boolean
    nagadEnabled: boolean
    rocketEnabled: boolean
    codEnabled: boolean
  }
  policyVersions: {
    type: 'shipping' | 'cancellation' | 'returns' | 'refunds' | 'privacy' | 'terms' | 'complaints'
    version: string
    effectiveAt: string
  }[]
}>

export type { CheckoutSettingsAccess }

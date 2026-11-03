import type { ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { deliveryAreas } from './delivery.schema.js'

interface AddressCoverage {
  supports(district: string, area: string, session: ClientSession): Promise<boolean>
}

interface DeliveryChargeSnapshot {
  zoneId: string
  chargeRuleId: string
  coverageKey: string
  amountPoisha: number
  ruleVersion: number
}

type CheckoutDeliveryAccess = (
  district: string,
  area: string,
  session: ClientSession,
) => Promise<DeliveryChargeSnapshot>

type DeliveryAreasAccess = (query: unknown) => Promise<z.output<typeof deliveryAreas>>

export type { AddressCoverage, DeliveryChargeSnapshot, CheckoutDeliveryAccess, DeliveryAreasAccess }

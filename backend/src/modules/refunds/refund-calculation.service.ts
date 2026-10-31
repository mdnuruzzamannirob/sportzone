import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const money = z.int().min(0).max(Number.MAX_SAFE_INTEGER)
const unit = z.strictObject({
  ordinal: z.int().min(1).max(50),
  netEntitlementPoisha: money,
  refundHeldPoisha: money,
  refundCompletedPoisha: money,
  eligible: z.boolean(),
})
const line = z.strictObject({
  orderItemId: id,
  quantity: z.int().min(1).max(50),
  units: z
    .array(unit)
    .min(1)
    .max(50)
    .refine((v) => new Set(v.map((u) => u.ordinal)).size === v.length),
})
const capacity = z.strictObject({
  allocatedPoisha: money,
  heldPoisha: money,
  completedPoisha: money,
})
const inputSchema = z.strictObject({
  lines: z
    .array(line)
    .max(50)
    .refine((v) => new Set(v.map((line) => line.orderItemId)).size === v.length),
  source: capacity,
  order: capacity,
  delivery: z.strictObject({
    snapshotChargePoisha: money,
    heldPoisha: money,
    completedPoisha: money,
    requestedPoisha: money,
    approvedByPolicy: z.boolean(),
  }),
})
function add(...values: number[]) {
  const sum = values.reduce((a, b) => a + BigInt(b), 0n)
  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError('STATE_CONFLICT')
  return Number(sum)
}
function available(total: number, held: number, completed: number) {
  const used = add(held, completed)
  if (used > total) throw new ApiError('STATE_CONFLICT')
  return total - used
}

// Advisory calculation for trusted, snapshot-bound domain facts only. This neither creates an
// obligation nor reserves capacity; a financial writer must re-read and fence every source/unit.
export function calculateMerchandiseRefund(raw: unknown) {
  const input = parseInput(inputSchema, raw)
  const sourceAvailablePoisha = available(
    input.source.allocatedPoisha,
    input.source.heldPoisha,
    input.source.completedPoisha,
  )
  const orderAvailablePoisha = available(
    input.order.allocatedPoisha,
    input.order.heldPoisha,
    input.order.completedPoisha,
  )
  const deliveryAvailablePoisha = available(
    input.delivery.snapshotChargePoisha,
    input.delivery.heldPoisha,
    input.delivery.completedPoisha,
  )
  if (
    input.delivery.requestedPoisha > 0 &&
    (!input.delivery.approvedByPolicy || input.delivery.requestedPoisha > deliveryAvailablePoisha)
  )
    throw new ApiError('BUSINESS_RULE_VIOLATION')
  const items = input.lines.map((line) => {
    const candidates = line.units
      .map((u) => ({
        ordinal: u.ordinal,
        remaining: available(u.netEntitlementPoisha, u.refundHeldPoisha, u.refundCompletedPoisha),
        eligible: u.eligible,
      }))
      .filter((u) => u.eligible && u.remaining > 0)
      .sort((a, b) => a.ordinal - b.ordinal)
    if (candidates.length < line.quantity) throw new ApiError('BUSINESS_RULE_VIOLATION')
    const unitAmounts = candidates
      .slice(0, line.quantity)
      .map((u) => ({ ordinal: u.ordinal, amountPoisha: u.remaining }))
    return {
      orderItemId: line.orderItemId,
      unitAmounts,
      amountPoisha: add(...unitAmounts.map((u) => u.amountPoisha)),
    }
  })
  const merchandiseAmountPoisha = add(...items.map((item) => item.amountPoisha))
  const amountPoisha = add(merchandiseAmountPoisha, input.delivery.requestedPoisha)
  if (!amountPoisha) throw new ApiError('BUSINESS_RULE_VIOLATION')
  if (amountPoisha > sourceAvailablePoisha || amountPoisha > orderAvailablePoisha)
    return {
      status: 'insufficient_collected_balance' as const,
      sourceAvailablePoisha,
      orderAvailablePoisha,
    }
  return {
    status: 'advisory' as const,
    items,
    merchandiseAmountPoisha,
    deliveryAmountPoisha: input.delivery.requestedPoisha,
    amountPoisha,
    sourceAvailablePoisha,
    orderAvailablePoisha,
  }
}

// Correction cash is bounded independently of unit and delivery entitlements. Facts must come
// from the linked source's verified correction allocation, not unmatched provider intake.
export function calculateCorrectionRefund(raw: unknown) {
  const input = parseInput(
    z.strictObject({ source: capacity, order: capacity, requestedPoisha: money }),
    raw,
  )
  const sourceAvailablePoisha = available(
    input.source.allocatedPoisha,
    input.source.heldPoisha,
    input.source.completedPoisha,
  )
  const orderAvailablePoisha = available(
    input.order.allocatedPoisha,
    input.order.heldPoisha,
    input.order.completedPoisha,
  )
  if (!input.requestedPoisha) throw new ApiError('BUSINESS_RULE_VIOLATION')
  if (input.requestedPoisha > sourceAvailablePoisha || input.requestedPoisha > orderAvailablePoisha)
    return {
      status: 'insufficient_collected_balance' as const,
      sourceAvailablePoisha,
      orderAvailablePoisha,
    }
  return {
    status: 'advisory' as const,
    correctionAmountPoisha: input.requestedPoisha,
    amountPoisha: input.requestedPoisha,
    sourceAvailablePoisha,
    orderAvailablePoisha,
  }
}

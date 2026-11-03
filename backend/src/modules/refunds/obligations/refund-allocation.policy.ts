import { z } from 'zod'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'

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
function calculateMerchandiseRefund(raw: unknown) {
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
function calculateCorrectionRefund(raw: unknown) {
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

const sourceSlice = capacity.extend({ sourceCollectionId: id })

const multiSourceSchema = inputSchema.omit({ source: true }).extend({
  sources: z
    .array(sourceSlice)
    .min(1)
    .max(50)
    .refine((rows) => new Set(rows.map((r) => r.sourceCollectionId)).size === rows.length),
})

// Pure advisory only; no capacity is reserved. Inputs must be canonical facts obtained in one
// snapshot; an atomic writer must re-authorize, re-read, fence and commit every slice and intent.
function planMultiSourceMerchandiseRefund(raw: unknown) {
  const input = parseInput(multiSourceSchema, raw)
  const sources = input.sources
    .map((source) => ({
      sourceCollectionId: source.sourceCollectionId,
      availablePoisha: available(source.allocatedPoisha, source.heldPoisha, source.completedPoisha),
    }))
    .sort((a, b) =>
      a.sourceCollectionId < b.sourceCollectionId
        ? -1
        : a.sourceCollectionId > b.sourceCollectionId
          ? 1
          : 0,
    )
  const sourceTotal = add(...sources.map((source) => source.availablePoisha))
  const quote = calculateMerchandiseRefund({
    lines: input.lines,
    source: { allocatedPoisha: sourceTotal, heldPoisha: 0, completedPoisha: 0 },
    order: input.order,
    delivery: input.delivery,
  })
  if (quote.status !== 'advisory') return quote
  const slices: {
    sourceCollectionId: string
    items: {
      orderItemId: string
      unitAmounts: {
        ordinal: number
        amountPoisha: number
      }[]
      amountPoisha: number
    }[]
    merchandiseAmountPoisha: number
    deliveryAmountPoisha: number
    amountPoisha: number
  }[] = []
  let sourceIndex = 0
  function allocate(amount: number, orderItemId?: string, ordinal?: number) {
    let remaining = amount
    while (remaining > 0) {
      const source = sources[sourceIndex]
      if (!source) throw new ApiError('STATE_CONFLICT')
      if (!source.availablePoisha) {
        sourceIndex++
        continue
      }
      const used = Math.min(remaining, source.availablePoisha)
      let slice = slices.find((s) => s.sourceCollectionId === source.sourceCollectionId)
      if (!slice) {
        slice = {
          sourceCollectionId: source.sourceCollectionId,
          items: [],
          merchandiseAmountPoisha: 0,
          deliveryAmountPoisha: 0,
          amountPoisha: 0,
        }
        slices.push(slice)
      }
      if (orderItemId !== undefined && ordinal !== undefined) {
        let item = slice.items.find((entry) => entry.orderItemId === orderItemId)
        if (!item) {
          item = { orderItemId, unitAmounts: [], amountPoisha: 0 }
          slice.items.push(item)
        }
        item.unitAmounts.push({ ordinal, amountPoisha: used })
        item.amountPoisha = add(item.amountPoisha, used)
        slice.merchandiseAmountPoisha = add(slice.merchandiseAmountPoisha, used)
      } else slice.deliveryAmountPoisha = add(slice.deliveryAmountPoisha, used)
      slice.amountPoisha = add(slice.amountPoisha, used)
      source.availablePoisha -= used
      remaining -= used
    }
  }
  for (const item of [...quote.items].sort((a, b) =>
    a.orderItemId < b.orderItemId ? -1 : a.orderItemId > b.orderItemId ? 1 : 0,
  ))
    for (const unit of item.unitAmounts) allocate(unit.amountPoisha, item.orderItemId, unit.ordinal)
  allocate(quote.deliveryAmountPoisha)
  return {
    status: 'advisory' as const,
    amountPoisha: quote.amountPoisha,
    merchandiseAmountPoisha: quote.merchandiseAmountPoisha,
    deliveryAmountPoisha: quote.deliveryAmountPoisha,
    slices,
  }
}

export { calculateCorrectionRefund, calculateMerchandiseRefund, planMultiSourceMerchandiseRefund }

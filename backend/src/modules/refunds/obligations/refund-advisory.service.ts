import type { ClientSession } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../../shared/errors/app-error.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import type { refundOrderSnapshotAccess } from '../../orders/order.service.js'
import type { refundClaimSnapshotAccess } from '../../returns/return.service.js'
import type {
  correctionPaymentSnapshotAccess,
  refundPaymentSnapshotAccess,
} from '../../payments/payment.service.js'
import {
  calculateMerchandiseRefund,
  calculateCorrectionRefund,
  planMultiSourceMerchandiseRefund,
} from './refund-allocation.policy.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)

const command = z.strictObject({
  orderId: id,
  claimId: id,
  sourceCollectionId: id,
  items: z
    .array(z.strictObject({ orderItemId: id, quantity: z.int().min(1).max(50) }))
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((item) => item.orderItemId)).size === items.length),
  deliveryRequestedPoisha: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
})

// Caller owns current admin/customer scope and transaction. No root/HTTP wiring is installed.
// This snapshot is advisory: a future reservation writer must recheck everything using CAS.
function createRefundAdvisoryService(
  claim: ReturnType<typeof refundClaimSnapshotAccess>,
  order: ReturnType<typeof refundOrderSnapshotAccess>,
  payment: ReturnType<typeof refundPaymentSnapshotAccess>,
  deliveryPolicy?: (
    session: ClientSession,
    input: {
      orderId: string
      claimId: string
      requestedPoisha: number
    },
  ) => Promise<boolean>,
) {
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = parseInput(command, raw)
    const selection = await claim(session, input.orderId, input.claimId, input.items)
    const orderSnapshot = await order(session, input.orderId, input.claimId, selection)
    const funding = await payment(session, input.orderId, input.sourceCollectionId)
    let approvedByPolicy = false
    if (input.deliveryRequestedPoisha) {
      if (!deliveryPolicy) throw new ApiError('SERVICE_UNAVAILABLE')
      approvedByPolicy = await deliveryPolicy(session, {
        orderId: input.orderId,
        claimId: input.claimId,
        requestedPoisha: input.deliveryRequestedPoisha,
      })
      if (approvedByPolicy !== true) throw new ApiError('BUSINESS_RULE_VIOLATION')
    }
    return calculateMerchandiseRefund({
      lines: orderSnapshot.lines,
      source: funding.source,
      order: funding.order,
      delivery: {
        snapshotChargePoisha: orderSnapshot.deliveryChargePoisha,
        ...funding.delivery,
        requestedPoisha: input.deliveryRequestedPoisha,
        approvedByPolicy,
      },
    })
  }
}

const correctionCommand = z.strictObject({
  orderId: id,
  sourceCollectionIds: z
    .array(id)
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length),
  requestedPoisha: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
})

// Read-only snapshot; caller must authorize and a future writer must fence every capacity.
function createCorrectionRefundAdvisoryService(
  payment: ReturnType<typeof correctionPaymentSnapshotAccess>,
) {
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = parseInput(correctionCommand, raw)
    const slices: {
      sourceCollectionId: string
      availablePoisha: number
    }[] = []
    let order: Awaited<ReturnType<typeof payment>>['order'] | undefined
    for (const sourceCollectionId of [...input.sourceCollectionIds].sort()) {
      const snapshot = await payment(session, input.orderId, sourceCollectionId)
      if (
        order &&
        (order.allocatedPoisha !== snapshot.order.allocatedPoisha ||
          order.heldPoisha !== snapshot.order.heldPoisha ||
          order.completedPoisha !== snapshot.order.completedPoisha)
      )
        throw new ApiError('STATE_CONFLICT')
      order = snapshot.order
      const checked = calculateCorrectionRefund({
        source: snapshot.source,
        order,
        requestedPoisha: 1,
      })
      slices.push({ sourceCollectionId, availablePoisha: checked.sourceAvailablePoisha })
    }
    if (!order) throw new ApiError('STATE_CONFLICT')
    const total = slices.reduce((sum, item) => sum + BigInt(item.availablePoisha), 0n)
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError('STATE_CONFLICT')
    const result = calculateCorrectionRefund({
      source: { allocatedPoisha: Number(total), heldPoisha: 0, completedPoisha: 0 },
      order,
      requestedPoisha: input.requestedPoisha,
    })
    if (result.status !== 'advisory') return result
    let remaining = input.requestedPoisha
    const allocations = []
    for (const slice of slices) {
      const amountPoisha = Math.min(remaining, slice.availablePoisha)
      if (amountPoisha)
        allocations.push({ sourceCollectionId: slice.sourceCollectionId, amountPoisha })
      remaining -= amountPoisha
    }
    return { ...result, allocations }
  }
}

const multiCommand = command.omit({ sourceCollectionId: true }).extend({
  sourceCollectionIds: z
    .array(id)
    .min(1)
    .max(50)
    .refine((values) => new Set(values).size === values.length),
})

// This snapshot planner is private and nonbinding; transaction-wide CAS reservations and durable
// source-specific obligations must be performed separately before any financial effect.
function createMultiSourceRefundAdvisoryService(
  claim: ReturnType<typeof refundClaimSnapshotAccess>,
  order: ReturnType<typeof refundOrderSnapshotAccess>,
  payment: ReturnType<typeof refundPaymentSnapshotAccess>,
  deliveryPolicy?: (
    session: ClientSession,
    input: {
      orderId: string
      claimId: string
      requestedPoisha: number
    },
  ) => Promise<boolean>,
) {
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = parseInput(multiCommand, raw)
    const selection = await claim(session, input.orderId, input.claimId, input.items)
    const orderSnapshot = await order(session, input.orderId, input.claimId, selection)
    const sources: {
      sourceCollectionId: string
      allocatedPoisha: number
      heldPoisha: number
      completedPoisha: number
    }[] = []
    let aggregate: Awaited<ReturnType<ReturnType<typeof refundPaymentSnapshotAccess>>> | undefined
    for (const sourceCollectionId of input.sourceCollectionIds) {
      const fact = await payment(session, input.orderId, sourceCollectionId)
      if (
        aggregate &&
        (JSON.stringify(aggregate.order) !== JSON.stringify(fact.order) ||
          JSON.stringify(aggregate.delivery) !== JSON.stringify(fact.delivery))
      )
        throw new ApiError('STATE_CONFLICT')
      aggregate = fact
      sources.push({ sourceCollectionId, ...fact.source })
    }
    if (!aggregate) throw new ApiError('STATE_CONFLICT')
    let approvedByPolicy = false
    if (input.deliveryRequestedPoisha) {
      if (!deliveryPolicy) throw new ApiError('SERVICE_UNAVAILABLE')
      approvedByPolicy = await deliveryPolicy(session, {
        orderId: input.orderId,
        claimId: input.claimId,
        requestedPoisha: input.deliveryRequestedPoisha,
      })
      if (approvedByPolicy !== true) throw new ApiError('BUSINESS_RULE_VIOLATION')
    }
    return planMultiSourceMerchandiseRefund({
      lines: orderSnapshot.lines,
      sources,
      order: aggregate.order,
      delivery: {
        snapshotChargePoisha: orderSnapshot.deliveryChargePoisha,
        ...aggregate.delivery,
        requestedPoisha: input.deliveryRequestedPoisha,
        approvedByPolicy,
      },
    })
  }
}

export {
  createRefundAdvisoryService,
  createCorrectionRefundAdvisoryService,
  createMultiSourceRefundAdvisoryService,
}

import { createDeliveryDeadlineService } from './delivery-deadline.service.js'
import { createHash } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { fulfillmentPaymentAccess } from '../payments/payment.service.js'
import type { fulfillmentAllocationService } from '../checkout/fulfillment-allocation.service.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { orderModels, type Order } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { orderAllocationBinding } from './order.service.js'
import { orderId, assertFulfillmentTransition } from './order.schema.js'
import { deliveryDeadline } from './delivery-deadline.schema.js'
import { lifecycleInput, lifecycleResult } from './order-lifecycle.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const view = (r: Order & { _id: Types.ObjectId }) =>
  lifecycleResult.parse({
    id: r._id.toHexString(),
    fulfillmentStatus: r.fulfillmentStatus,
    revision: r.revision,
    ...(r.confirmedAt ? { confirmedAt: r.confirmedAt.toISOString() } : {}),
    ...(r.shippedAt ? { shippedAt: r.shippedAt.toISOString() } : {}),
    ...(r.deliveredAt ? { deliveredAt: r.deliveredAt.toISOString() } : {}),
  })
export function orderLifecycleService(
  connection: Connection,
  admin: AdminAccountAccess,
  payment: ReturnType<typeof fulfillmentPaymentAccess>,
  allocation: ReturnType<typeof fulfillmentAllocationService>,
  approvedDeadline?: (session: ClientSession, basis: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const { orders } = orderModels(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async transition(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(orderId, rawId),
        input = parseInput(lifecycleInput, raw),
        operationKey = hash(`fulfillment:${id}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input))
      return admin.owned(token, async (actorId, session) => {
        await verifyOrderPersistence(connection)
        const row = await orders.findById(id).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const cause = {
            action: 'order.fulfillment.transition',
            targetType: 'order',
            targetId: id,
            operationKey,
          },
          previous = await lookup(session, cause)
        if (previous) {
          if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return view(row)
        }
        assertFulfillmentTransition({ from: row.fulfillmentStatus, to: input.to })
        if (input.to === 'cancelled') throw new ApiError('BUSINESS_RULE_VIOLATION')
        const now = clock(),
          last = row.deliveredAt ?? row.shippedAt ?? row.confirmedAt ?? row.placedAt
        if (
          !Number.isFinite(now.getTime()) ||
          now < last ||
          row.revision >= Number.MAX_SAFE_INTEGER ||
          row.cancelledAt ||
          ['risk_review', 'allocation_shortfall'].includes(row.fulfillmentHold ?? 'none') ||
          (row.fulfillmentHold === 'admin_review' &&
            !(input.to === 'confirmed' && row.fulfillmentStatus === 'pending'))
        )
          throw new ApiError('STATE_CONFLICT')
        if (input.to !== 'shipped' && (input.dispatchReference || input.carrierLabel))
          throw new ApiError('VALIDATION_FAILED')
        await payment(session, {
          orderId: id,
          method: row.paymentMethod,
          expectedPoisha: row.pricingSnapshot.finalTotalPoisha,
        })
        const set: Record<string, unknown> = {
          fulfillmentStatus: input.to,
          fulfillmentHold: 'none',
          statusHistory: [
            ...row.statusHistory.slice(-39),
            {
              from: row.fulfillmentStatus,
              to: input.to,
              actorType: 'admin',
              actorId: new Types.ObjectId(actorId),
              reason: input.reason,
              at: now,
              operationKey,
            },
          ],
        }
        if (input.to === 'confirmed') {
          if (!approvedDeadline || row.confirmedAt) throw new ApiError('SERVICE_UNAVAILABLE')
          const basis = row.toObject({ flattenMaps: true }).deliverySnapshot.deadlineBasis
          await approvedDeadline(session, basis)
          const timing = parseInput(
            deliveryDeadline,
            createDeliveryDeadlineService(undefined, clock).requireConfirmation(basis, {
              placedAt: row.placedAt.toISOString(),
              confirmedAt: now.toISOString(),
            }),
          )
          if (
            timing.status !== 'calculated' ||
            !timing.effectiveAt ||
            !timing.targetDeadlineAt ||
            timing.ruleVersion !== row.deliverySnapshot.deadlineRuleVersion ||
            timing.startEventAt !== now.toISOString()
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          set.confirmedAt = now
          set.deliveryCommitment = {
            status: 'calculated',
            startEventAt: now,
            targetDeadlineAt: new Date(timing.targetDeadlineAt),
            ...(timing.legalCapAt ? { legalDeadlineAt: new Date(timing.legalCapAt) } : {}),
            effectiveDeadlineAt: new Date(timing.effectiveAt),
            calculatedAt: now,
            revision: row.deliveryCommitment.revision + 1,
          }
        } else if (
          !row.confirmedAt ||
          row.deliveryCommitment.status !== 'calculated' ||
          !row.deliveryCommitment.effectiveDeadlineAt
        )
          throw new ApiError('STATE_CONFLICT')
        if (input.to !== 'delivered')
          await allocation(session, orderAllocationBinding(row, 1), input.to === 'shipped')
        if (input.to === 'shipped') {
          if (!input.dispatchReference || row.shippedAt) throw new ApiError('VALIDATION_FAILED')
          set.shippedAt = now
          set.shipment = {
            dispatchReference: input.dispatchReference,
            ...(input.carrierLabel ? { carrierLabel: input.carrierLabel } : {}),
            statusUpdatedBy: new Types.ObjectId(actorId),
          }
        }
        if (input.to === 'delivered') {
          if (!row.shippedAt || !row.shipment?.dispatchReference || row.deliveredAt)
            throw new ApiError('STATE_CONFLICT')
          set.deliveredAt = now
        }
        const changed = await orders.findOneAndUpdate(
          { _id: row._id, revision: row.revision, fulfillmentStatus: row.fulfillmentStatus },
          { $set: set, $inc: { revision: 1 } },
          { session, returnDocument: 'after' },
        )
        if (!changed) throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        return view(changed)
      })
    },
  }
}

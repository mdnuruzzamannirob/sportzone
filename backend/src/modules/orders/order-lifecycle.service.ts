import { createHash } from 'node:crypto'
import { type ClientSession, type Connection, Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import {
  resourceId as orderId,
  idempotencyKey as paymentInitiationKey,
} from '../../shared/validation.js'
import type { AuditAccess } from '../audit/audit.public.js'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import { createNotificationService } from '../notifications/notification.service.js'

import type { FulfillmentPaymentAccess } from '../payments/payment.public.js'

import { deliveryDeadline } from './delivery-deadline.schema.js'
import { createDeliveryDeadlineService } from './delivery-deadline.service.js'
import { type Order, orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { assertFulfillmentTransition } from './order.schema.js'
import { orderAllocationBinding } from './order.service.js'
import type { createFulfillmentAllocationService } from './order-allocation.service.js'
import { lifecycleInput, lifecycleResult } from './order-lifecycle.schema.js'

const hash = (v: string) => createHash('sha256').update(v).digest('hex')

const view = (
  r: Order & {
    _id: Types.ObjectId
  },
) =>
  lifecycleResult.parse({
    id: r._id.toHexString(),
    fulfillmentStatus: r.fulfillmentStatus,
    revision: r.revision,
    ...(r.confirmedAt ? { confirmedAt: r.confirmedAt.toISOString() } : {}),
    ...(r.shippedAt ? { shippedAt: r.shippedAt.toISOString() } : {}),
    ...(r.deliveredAt ? { deliveredAt: r.deliveredAt.toISOString() } : {}),
  })

function createOrderLifecycleService(
  connection: Connection,
  admin: AdminAccountAccess,
  payment: FulfillmentPaymentAccess,
  allocation: ReturnType<typeof createFulfillmentAllocationService>,
  auditAccess: AuditAccess,
  approvedDeadline?: (session: ClientSession, basis: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const { orders } = orderModels(connection),
    audit = auditAccess.write,
    lookup = auditAccess.lookup
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
          const fullyPaidAt =
            basis.rule.prepaid && row.paymentMethod === 'online'
              ? await payment.fundedAt(session, id)
              : undefined
          const timing = parseInput(
            deliveryDeadline,
            createDeliveryDeadlineService(undefined, clock).requireConfirmation(basis, {
              placedAt: row.placedAt.toISOString(),
              confirmedAt: now.toISOString(),
              paymentMethod: row.paymentMethod,
              ...(fullyPaidAt ? { fullyPaidAt } : {}),
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
            ...(fullyPaidAt ? { fullyPaidAt: new Date(fullyPaidAt) } : {}),
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
        const eventType =
          input.to === 'confirmed'
            ? 'order_confirmation'
            : input.to === 'shipped'
              ? 'shipment_update'
              : input.to === 'delivered'
                ? 'delivery_completion'
                : undefined
        if (eventType)
          await createNotificationService(connection, clock).enqueueCommerce(
            {
              orderId: row._id,
              ...(row.userId ? { userId: row.userId } : {}),
              email: row.customerSnapshot.emailNormalized,
              name: row.customerSnapshot.name,
              eventType,
              operationKey,
              occurredAt: now,
            },
            session,
          )
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

export { createOrderLifecycleService }

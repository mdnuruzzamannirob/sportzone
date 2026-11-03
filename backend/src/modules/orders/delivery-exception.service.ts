import { createHash } from 'node:crypto'
import { type ClientSession, type Connection, Types } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import {
  resourceId as orderId,
  idempotencyKey as paymentInitiationKey,
} from '../../shared/validation.js'
import type { AuditAccess } from '../audit/audit.public.js'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import type { RecoveryReceiptService } from '../inventory/inventory.public.js'
import { createNotificationService } from '../notifications/notification.service.js'

import type { CancellationPaymentAccess } from '../payments/payment.public.js'

import { deliveryExceptionModel } from './delivery-exception.model.js'
import { verifyDeliveryExceptionPersistence } from './delivery-exception.persistence.js'
import { exceptionInput, exceptionResolution, exceptionView } from './delivery-exception.schema.js'
import { orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import type { DeliveryDispositionVerifier } from './order.public.js'

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

function createDeliveryExceptionService(
  connection: Connection,
  admin: AdminAccountAccess,
  payment: CancellationPaymentAccess,
  restore: RecoveryReceiptService,
  auditAccess: AuditAccess,
  verifyDisposition?: DeliveryDispositionVerifier,
  refunds?: (
    session: ClientSession,
    input: {
      orderId: string
      paymentId: string
      exceptionId: string
      actorId: string
      reason: string
    },
  ) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const model = deliveryExceptionModel(connection),
    { orders } = orderModels(connection),
    audit = auditAccess.write,
    lookup = auditAccess.lookup
  const view = (row: InstanceType<typeof model>) =>
    exceptionView.parse({
      id: row._id.toHexString(),
      orderId: row.orderId.toHexString(),
      type: row.type,
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      ...(row.resolvedAt
        ? { resolvedAt: row.resolvedAt.toISOString(), resolution: row.resolution }
        : {}),
    })
  async function ready() {
    await verifyOrderPersistence(connection)
    await verifyDeliveryExceptionPersistence(connection)
  }
  return {
    async list(token: string | undefined, rawId: unknown) {
      const id = parseInput(orderId, rawId)
      return admin.owned(
        token,
        async (_actor, session) => {
          await ready()
          if (!(await orders.exists({ _id: id }).session(session))) throw new ApiError('NOT_FOUND')
          const rows = await model
            .find({ orderId: id })
            .sort({ createdAt: -1, _id: -1 })
            .limit(201)
            .session(session)
          if (rows.length > 200) throw new ApiError('BUSINESS_RULE_VIOLATION')
          return rows.map(view)
        },
        false,
      )
    },
    async create(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(orderId, rawId),
        input = parseInput(exceptionInput, raw),
        operationKey = hash(`exception:${id}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input))
      const run = () =>
        admin.owned(token, async (actorId, session) => {
          await ready()
          const previous = await model.findOne({ orderId: id, operationKey }).session(session)
          if (previous) {
            if (previous.requestDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            return view(previous)
          }
          const row = await orders.findById(id).session(session),
            now = clock()
          if (!row) throw new ApiError('NOT_FOUND')
          if (
            !Number.isFinite(now.getTime()) ||
            now < row.placedAt ||
            row.revision >= Number.MAX_SAFE_INTEGER ||
            !['pending', 'confirmed', 'processing', 'shipped'].includes(row.fulfillmentStatus) ||
            (input.type !== 'delay' && row.fulfillmentStatus !== 'shipped')
          )
            throw new ApiError('STATE_CONFLICT')
          const fence = await orders.updateOne(
            { _id: row._id, revision: row.revision, fulfillmentStatus: row.fulfillmentStatus },
            { $inc: { revision: 1 } },
            { session },
          )
          if (fence.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          const event = new model({
            orderId: row._id,
            type: input.type,
            reason: input.reason,
            status: 'open',
            operationKey,
            requestDigest: digest,
            revision: 0,
            contactHistory: input.contact ? [{ ...input.contact, at: now }] : [],
            disposition: [],
            createdAt: now,
            updatedAt: now,
          })
          await event.save({ session })
          await audit(session, {
            actorType: 'admin',
            actorId,
            action: 'order.delivery.exception.create',
            targetType: 'delivery_exception',
            targetId: event._id.toHexString(),
            operationKey,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: now,
          })
          return view(event)
        })
      try {
        return await run()
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
          throw error
        return run()
      }
    },
    async resolve(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(orderId, rawId),
        input = parseInput(exceptionResolution, raw),
        operationKey = hash(`exception-resolution:${id}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input))
      return admin.owned(token, async (actorId, session) => {
        await ready()
        const event = await model.findById(id).session(session)
        if (!event) throw new ApiError('NOT_FOUND')
        const cause = {
            action: 'order.delivery.exception.resolve',
            targetType: 'delivery_exception',
            targetId: id,
            operationKey,
          },
          previous = await lookup(session, cause)
        if (previous) {
          if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return view(event)
        }
        const row = await orders.findById(event.orderId).session(session),
          now = clock()
        if (
          !row ||
          event.status !== 'open' ||
          event.revision >= Number.MAX_SAFE_INTEGER ||
          row.revision >= Number.MAX_SAFE_INTEGER ||
          !Number.isFinite(now.getTime()) ||
          now < event.createdAt
        )
          throw new ApiError('STATE_CONFLICT')
        let dispositionDigest: string | undefined
        if (event.type === 'final_non_delivery') {
          if (
            row.fulfillmentStatus !== 'shipped' ||
            !row.shippedAt ||
            row.deliveredAt ||
            row.cancelledAt ||
            !row.shipment?.dispatchReference ||
            !input.disposition ||
            !verifyDisposition
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          if (
            input.disposition.some((d) => !row.items.some((i) => i.id.equals(d.orderItemId))) ||
            row.items.some(
              (i) =>
                input.disposition
                  ?.filter((d) => i.id.equals(d.orderItemId))
                  .reduce((sum, d) => sum + d.quantity, 0) !== i.quantity,
            )
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          dispositionDigest = z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(
              await verifyDisposition(session, {
                orderId: row._id.toHexString(),
                exceptionId: id,
                shippedAt: row.shippedAt,
                disposition: input.disposition,
              }),
            )
          const funds = await payment(session, {
            orderId: row._id.toHexString(),
            expectedPoisha: row.pricingSnapshot.finalTotalPoisha,
            method: row.paymentMethod,
          })
          if (funds.verifiedCollectedPoisha > 0) {
            if (!refunds) throw new ApiError('SERVICE_UNAVAILABLE')
            await refunds(session, {
              orderId: row._id.toHexString(),
              paymentId: funds.paymentId,
              exceptionId: id,
              actorId,
              reason: input.resolution,
            })
          }
          for (const item of row.items) {
            const quantity = input.disposition
              .filter((d) => item.id.equals(d.orderItemId))
              .reduce((sum, d) => sum + d.inspectedResellableQty, 0)
            if (quantity)
              await restore(session, {
                orderId: row._id.toHexString(),
                orderItemId: item.id.toHexString(),
                variantId: item.variantId.toHexString(),
                quantity,
                actorId,
                inspectionDigest: dispositionDigest,
              })
          }
          const transitionOptions = { session, transitionPath: 'final_non_delivery' }
          const changed = await orders.updateOne(
            { _id: row._id, fulfillmentStatus: 'shipped', revision: row.revision },
            {
              $set: {
                fulfillmentStatus: 'cancelled',
                cancelledAt: now,
                fulfillmentHold: 'none',
                statusHistory: [
                  ...row.statusHistory.slice(-39),
                  {
                    from: 'shipped',
                    to: 'cancelled',
                    actorType: 'admin',
                    actorId: new Types.ObjectId(actorId),
                    reason: input.resolution,
                    at: now,
                    operationKey,
                  },
                ],
              },
              $inc: { revision: 1 },
            },
            transitionOptions,
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await createNotificationService(connection, clock).enqueueCommerce(
            {
              orderId: row._id,
              ...(row.userId ? { userId: row.userId } : {}),
              email: row.customerSnapshot.emailNormalized,
              name: row.customerSnapshot.name,
              eventType: 'order_cancellation',
              operationKey,
              occurredAt: now,
            },
            session,
          )
        } else {
          if (input.disposition) throw new ApiError('VALIDATION_FAILED')
          const changed = await orders.updateOne(
            { _id: row._id, revision: row.revision },
            { $inc: { revision: 1 } },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        }
        const changed = await model.findOneAndUpdate(
          { _id: event._id, status: 'open', revision: event.revision },
          {
            $set: {
              status: 'resolved',
              resolution: input.resolution,
              resolvedAt: now,
              disposition: input.disposition ?? [],
              ...(dispositionDigest ? { dispositionDigest } : {}),
              contactHistory: [
                ...event.contactHistory.slice(input.contactOutcome ? -39 : -40),
                ...(input.contactOutcome
                  ? [{ at: now, channel: 'admin_record', outcome: input.contactOutcome }]
                  : []),
              ],
            },
            $inc: { revision: 1 },
          },
          { session, returnDocument: 'after' },
        )
        if (!changed) throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.resolution,
          occurredAt: now,
        })
        return view(changed)
      })
    },
  }
}

export { createDeliveryExceptionService }

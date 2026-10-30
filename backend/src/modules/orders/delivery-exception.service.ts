import { createHash } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { recoveryReceiptService } from '../inventory/recovery-receipt.service.js'
import type { cancellationPaymentAccess } from '../payments/payment.service.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { createRegistrationNotifications } from '../notifications/notification.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { orderId } from './order.schema.js'
import { deliveryExceptionModel } from './delivery-exception.model.js'
import { verifyDeliveryExceptionPersistence } from './delivery-exception.persistence.js'
import { exceptionInput, exceptionResolution, exceptionView } from './delivery-exception.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export function deliveryExceptionService(
  connection: Connection,
  admin: AdminAccountAccess,
  payment: ReturnType<typeof cancellationPaymentAccess>,
  restore: ReturnType<typeof recoveryReceiptService>,
  verifyDisposition?: (
    session: ClientSession,
    input: {
      orderId: string
      exceptionId: string
      disposition: NonNullable<ReturnType<typeof exceptionResolution.parse>['disposition']>
    },
  ) => Promise<unknown>,
  refunds?: (
    session: ClientSession,
    input: { orderId: string; paymentId: string; exceptionId: string },
  ) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const model = deliveryExceptionModel(connection),
    { orders } = orderModels(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
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
          await createRegistrationNotifications(connection, clock).enqueueCommerce(
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

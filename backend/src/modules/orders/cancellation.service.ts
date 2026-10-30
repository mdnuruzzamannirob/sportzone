import { createRegistrationNotifications } from '../notifications/notification.service.js'
import { createHash } from 'node:crypto'
import { Types, type Connection, type ClientSession } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
} from '../auth/checkout-access.service.js'
import type { cancellationAllocationService } from '../checkout/cancellation-allocation.service.js'
import type { cancellationPaymentAccess } from '../payments/payment.service.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { orderModels } from './order.model.js'
import { orderId } from './order.schema.js'
import { orderOwnerFilter } from './order-read.service.js'
import { orderAllocationBinding } from './order.service.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { cancellationModel } from './cancellation.model.js'
import { verifyCancellationPersistence } from './cancellation.persistence.js'
import { cancellationInput, cancellationDecision, cancellationView } from './cancellation.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export function cancellationService(
  connection: Connection,
  scope: ReturnType<typeof orderScopeAccess>,
  admin: AdminAccountAccess,
  release: ReturnType<typeof cancellationAllocationService>,
  payment: ReturnType<typeof cancellationPaymentAccess>,
  refunds?: (
    session: ClientSession,
    input: { orderId: string; paymentId: string; requestId: string },
  ) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const { orders } = orderModels(connection),
    requests = cancellationModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  const view = (r: InstanceType<typeof requests>) =>
    cancellationView.parse({
      id: r._id.toHexString(),
      orderId: r.orderId.toHexString(),
      status: r.status,
      reason: r.reason,
      requestedAt: r.createdAt.toISOString(),
      ...(r.reviewedAt ? { reviewedAt: r.reviewedAt.toISOString() } : {}),
    })
  async function ready() {
    await verifyOrderPersistence(connection)
    await verifyCancellationPersistence(connection)
  }
  return {
    async request(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      raw: unknown,
      key: unknown,
    ) {
      const id = parseInput(orderId, rawId),
        input = parseInput(cancellationInput, raw),
        requestKey = parseInput(paymentInitiationKey, key)
      const run = () =>
        scope.owned(
          credentials,
          id,
          async (principal, session) => {
            await ready()
            const order = await orders.findOne(orderOwnerFilter(id, principal)).session(session)
            if (!order) throw new ApiError('NOT_FOUND')
            const operationKey = hash(
              `cancellation:${id}:${principal.kind}:${principal.kind === 'customer' ? principal.userId : principal.orderId}:${requestKey}`,
            )
            const previous = await requests.findOne({ orderId: id, operationKey }).session(session)
            if (previous) {
              if (previous.reason !== input.reason) throw new ApiError('IDEMPOTENCY_CONFLICT')
              return view(previous)
            }
            if (
              !['pending', 'confirmed', 'processing'].includes(order.fulfillmentStatus) ||
              order.shippedAt ||
              order.shipment?.dispatchReference ||
              order.cancelledAt
            )
              throw new ApiError('STATE_CONFLICT')
            const existing = await requests
              .findOne({ orderId: id, status: 'requested' })
              .session(session)
            if (existing) throw new ApiError('STATE_CONFLICT')
            const at = clock()
            if (
              !Number.isFinite(at.getTime()) ||
              at < order.placedAt ||
              order.revision >= Number.MAX_SAFE_INTEGER
            )
              throw new ApiError('STATE_CONFLICT')
            const fenced = await orders.updateOne(
              {
                _id: order._id,
                revision: order.revision,
                fulfillmentStatus: order.fulfillmentStatus,
              },
              { $inc: { revision: 1 } },
              { session },
            )
            if (fenced.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
            const requestedBy =
              principal.kind === 'customer'
                ? { kind: principal.kind, userId: new Types.ObjectId(principal.userId) }
                : {
                    kind: principal.kind,
                    guestSessionId: new Types.ObjectId(principal.guestSessionId),
                  }
            const row = new requests({
              orderId: new Types.ObjectId(id),
              requestedBy,
              reason: input.reason,
              status: 'requested',
              operationKey,
              revision: 0,
              createdAt: at,
              updatedAt: at,
            })
            await row.save({ session })
            await audit(session, {
              actorType: principal.kind,
              ...(principal.kind === 'customer' ? { actorId: principal.userId } : {}),
              action: 'order.cancellation.request',
              targetType: 'order',
              targetId: id,
              operationKey,
              reason: input.reason,
              occurredAt: clock(),
            })
            return view(row)
          },
          true,
        )
      try {
        return await run()
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
          throw error
        return run()
      }
    },
    async decide(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(orderId, rawId),
        input = parseInput(cancellationDecision, raw),
        operationKey = hash(`cancellation-decision:${id}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input))
      return admin.owned(token, async (actorId, session) => {
        await ready()
        const request = await requests.findById(id).session(session)
        if (!request) throw new ApiError('NOT_FOUND')
        const cause = {
            action: 'order.cancellation.decision',
            targetType: 'cancellation_request',
            targetId: id,
            operationKey,
          },
          previous = await lookup(session, cause)
        if (previous) {
          if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return view(request)
        }
        if (request.status !== 'requested') throw new ApiError('STATE_CONFLICT')
        const order = await orders.findById(request.orderId).session(session),
          now = clock()
        if (
          !order ||
          !Number.isFinite(now.getTime()) ||
          now < order.placedAt ||
          now < request.createdAt ||
          order.revision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('STATE_CONFLICT')
        if (input.decision === 'approve') {
          if (
            !['pending', 'confirmed', 'processing'].includes(order.fulfillmentStatus) ||
            order.shippedAt ||
            order.shipment?.dispatchReference ||
            order.cancelledAt ||
            (order.fulfillmentStatus === 'processing' && input.dispatchNotStartedConfirmed !== true)
          )
            throw new ApiError('STATE_CONFLICT')
          const funds = await payment(session, {
            orderId: order._id.toHexString(),
            expectedPoisha: order.pricingSnapshot.finalTotalPoisha,
            method: order.paymentMethod,
          })
          if (funds.verifiedCollectedPoisha > 0) {
            if (!refunds) throw new ApiError('SERVICE_UNAVAILABLE')
            await refunds(session, {
              orderId: order._id.toHexString(),
              paymentId: funds.paymentId,
              requestId: id,
            })
          }
          await release(session, orderAllocationBinding(order, 1))
          const changed = await orders.updateOne(
            {
              _id: order._id,
              revision: order.revision,
              fulfillmentStatus: order.fulfillmentStatus,
            },
            {
              $set: {
                fulfillmentStatus: 'cancelled',
                cancelledAt: now,
                fulfillmentHold: 'none',
                statusHistory: [
                  ...order.statusHistory.slice(-39),
                  {
                    from: order.fulfillmentStatus,
                    to: 'cancelled',
                    actorType: 'admin',
                    actorId: new Types.ObjectId(actorId),
                    reason: input.reason,
                    at: now,
                    operationKey,
                  },
                ],
              },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await createRegistrationNotifications(connection, clock).enqueueCommerce(
            {
              orderId: order._id,
              ...(order.userId ? { userId: order.userId } : {}),
              email: order.customerSnapshot.emailNormalized,
              name: order.customerSnapshot.name,
              eventType: 'order_cancellation',
              operationKey,
              occurredAt: now,
            },
            session,
          )
        }
        const changed = await requests.findOneAndUpdate(
          { _id: request._id, status: 'requested', revision: request.revision },
          {
            $set: {
              status: input.decision === 'approve' ? 'approved' : 'rejected',
              reviewedBy: new Types.ObjectId(actorId),
              reviewedAt: now,
              decisionReason: input.reason,
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
          reason: input.reason,
          occurredAt: now,
        })
        return view(changed)
      })
    },
  }
}

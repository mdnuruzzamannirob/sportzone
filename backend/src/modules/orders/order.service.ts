import { Types, type ClientSession, type Connection } from 'mongoose'
import { createHash, randomBytes } from 'node:crypto'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { buildOrderSnapshot } from './order-snapshot.service.js'
import { orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
import { initialOrderResult, orderCreateCommand } from './order.schema.js'
// REQUIRED checkout coordinator capability. In THIS transaction it must authorize current
// principal/consent, bind the intended order/intent, consume its valid quote and coordinate
// durable intent outcome. Real allocations/payment intent must join before outer commit.
export type OrderCreationAccess = {
  authorize(
    session: ClientSession,
    command: { orderId: string; checkoutIntentId: string },
  ): Promise<unknown>
}
export function orderService(
  connection: Connection,
  checkout: OrderCreationAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const { orders, balances } = orderModels(connection)
  return {
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const command = parseInput(orderCreateCommand, raw)
      try {
        await verifyOrderPersistence(connection)
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      const proof = await checkout.authorize(session, command)
      const placedAt = clock(),
        data = buildOrderSnapshot(proof, placedAt)
      if (
        data.proof.orderId !== command.orderId ||
        data.proof.checkoutIntentId !== command.checkoutIntentId
      )
        throw new ApiError('STATE_CONFLICT')
      const { proof: accepted, ...snapshots } = data
      try {
        const row = new orders({
          ...snapshots,
          _id: command.orderId,
          checkoutIntentId: command.checkoutIntentId,
          userId: accepted.userId,
          orderNumber: `SZ-${randomBytes(12).toString('hex').toUpperCase()}`,
          placedAt,
          fulfillmentStatus: 'pending',
          schemaVersion: 1,
          fulfillmentHold: data.paymentMethod === 'online' ? 'payment_pending' : 'none',
          ...(accepted.notes ? { notes: accepted.notes } : {}),
        })
        await row.save({ session })
        for (const item of data.items)
          await new balances({
            orderId: row._id,
            orderItemId: new Types.ObjectId(item.id),
            purchasedQty: item.quantity,
            unitCoverage: Array.from({ length: item.quantity }, (_v, index) => ({
              ordinal: index + 1,
              netEntitlementPoisha:
                item.unitRefundBasePoisha + (index < item.unitRefundRemainderQty ? 1 : 0),
              claimState: 'available',
              refundHeldPoisha: 0,
              refundCompletedPoisha: 0,
            })),
            activeClaimQty: 0,
            resolvedClaimQty: 0,
            refundedMerchandiseQty: 0,
            revision: 0,
          }).save({ session })
        await audit(session, {
          actorType: accepted.userId ? 'customer' : 'system',
          ...(accepted.userId ? { actorId: accepted.userId } : {}),
          action: 'order.create',
          targetType: 'order',
          targetId: row._id.toHexString(),
          operationKey: createHash('sha256').update(command.operationKey).digest('hex'),
          occurredAt: placedAt,
          afterDigest: createHash('sha256')
            .update(
              JSON.stringify({
                commercialDigest: accepted.commercialDigest,
                orderId: command.orderId,
                checkoutIntentId: command.checkoutIntentId,
              }),
            )
            .digest('hex'),
        })
        return parseInput(initialOrderResult, {
          id: row._id.toHexString(),
          orderNumber: row.orderNumber,
          fulfillmentStatus: row.fulfillmentStatus,
          paymentMethod: row.paymentMethod,
          revision: row.revision,
        })
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
          throw new ApiError('STATE_CONFLICT')
        throw error
      }
    },
  }
}

// Narrow checkout-only projection: intent scope is authorized by checkout, while canonical order
// ownership and intent linkage are checked again here. Never returns contact/financial secrets.
export function checkoutOrderReadAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return async (
    session: ClientSession,
    principal: import('../auth/checkout-access.service.js').CheckoutPrincipal,
    orderId: string,
    intentId: string,
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    if (principal.scopeType === 'customer' && !principal.profile) throw new ApiError('FORBIDDEN')
    const row = await orders
      .findOne({
        _id: orderId,
        checkoutIntentId: intentId,
        userId: principal.scopeType === 'customer' ? (principal.profile?.id ?? null) : null,
      })
      .session(session)
    if (!row) throw new ApiError('STATE_CONFLICT')
    return {
      id: row._id.toHexString(),
      orderNumber: row.orderNumber,
      fulfillmentStatus: row.fulfillmentStatus,
      paymentMethod: row.paymentMethod,
      revision: row.revision,
      placedAt: row.placedAt.toISOString(),
      finalTotalPoisha: row.pricingSnapshot.finalTotalPoisha,
      currency: row.pricingSnapshot.currency,
      ...(row.fulfillmentHold ? { fulfillmentHold: row.fulfillmentHold } : {}),
    }
  }
}

// Initial checkout allocation only. Payment commits and cancellation/release need their own
// durable eligibility capability; this access deliberately cannot authorize those later transitions.
export function initialOrderAllocationAccess(connection: Connection) {
  const { orders } = orderModels(connection)
  return {
    async authorize(session: ClientSession, orderId: string, generation: number, action: string) {
      if (!session.inTransaction() || generation !== 1 || !['cod', 'hold'].includes(action))
        throw new ApiError('STATE_CONFLICT')
      const row = await orders.findOneAndUpdate(
        {
          _id: orderId,
          fulfillmentStatus: 'pending',
          paymentMethod: action === 'cod' ? 'cod' : 'online',
          confirmedAt: { $exists: false },
          shippedAt: { $exists: false },
          cancelledAt: { $exists: false },
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      const items = row.items.map((item) => ({
        id: item.id.toHexString(),
        variantId: item.variantId.toHexString(),
        quantity: item.quantity,
        couponEligible: item.couponEligible,
        regularUnitPoisha: item.regularUnitPoisha,
        effectiveUnitPoisha: item.effectiveUnitPoisha,
      }))
      return {
        orderId,
        generation,
        ...(row.userId ? { userId: row.userId.toHexString() } : {}),
        pricing: {
          items,
          deliveryChargePoisha: row.pricingSnapshot.deliveryChargePoisha,
        },
        ...(row.couponSnapshot
          ? {
              coupon: {
                couponId: row.couponSnapshot.couponId.toHexString(),
                code: row.couponSnapshot.code,
                type: row.couponSnapshot.type,
                value: row.couponSnapshot.value,
                version: row.couponSnapshot.termsVersion,
                discountPoisha: row.couponSnapshot.discountPoisha,
                eligibleLineIds: row.items
                  .filter((item) => item.couponEligible)
                  .map((item) => item.id.toHexString()),
              },
            }
          : {}),
      }
    },
  }
}

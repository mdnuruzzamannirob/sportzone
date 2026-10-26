import { createHash, randomBytes } from 'node:crypto'
import { Types, type Connection, type ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { orderCreateCommand, initialOrderResult } from './order.schema.js'
import { buildOrderSnapshot } from './order-snapshot.service.js'
import { orderModels } from './order.model.js'
import { verifyOrderPersistence } from './order.persistence.js'
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

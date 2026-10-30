import { Types, type ClientSession, type Connection } from 'mongoose'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { createAuditWriter } from '../audit/audit.service.js'
import { refundModel } from './refund.model.js'
import { verifyCorrectionPersistence } from './refund.persistence.js'
const command = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  paymentId: z.string().regex(/^[a-f0-9]{24}$/),
  sourceCollectionId: z.string().regex(/^[a-f0-9]{24}$/),
  amountPoisha: z.int().positive().max(Number.MAX_SAFE_INTEGER),
  decisionKey: z.string().regex(/^[a-f0-9]{64}$/),
})
export function correctionObligationService(connection: Connection) {
  const refunds = refundModel(connection),
    audit = createAuditWriter(connection)
  return {
    // Trusted Payments coordinator must bind a verified linked correction source and fence its
    // collection/payment/order in THIS transaction. No HTTP caller may supply this authority.
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyCorrectionPersistence(connection)
      const input = command.parse(raw)
      const existing = await refunds
        .findOne({ orderId: input.orderId, decisionKey: input.decisionKey })
        .session(session)
      if (existing) {
        if (
          existing.paymentId.toHexString() !== input.paymentId ||
          existing.sourceCollectionId.toHexString() !== input.sourceCollectionId ||
          existing.amountPoisha !== input.amountPoisha
        )
          throw new ApiError('IDEMPOTENCY_CONFLICT')
        return existing._id.toHexString()
      }
      const row = new refunds({
        ...input,
        orderId: new Types.ObjectId(input.orderId),
        paymentId: new Types.ObjectId(input.paymentId),
        sourceCollectionId: new Types.ObjectId(input.sourceCollectionId),
        basis: 'payment_correction',
        classification: 'payment_correction',
        items: [],
        merchandiseAmountPoisha: 0,
        deliveryAmountPoisha: 0,
        correctionAmountPoisha: input.amountPoisha,
        status: 'under_review',
        capacityStatus: 'not_reserved',
        revision: 0,
      })
      await row.save({ session })
      await audit(session, {
        actorType: 'system',
        action: 'refund.correction.intent',
        targetType: 'refund',
        targetId: row._id.toHexString(),
        operationKey: input.decisionKey,
        afterDigest: createHash('sha256')
          .update(
            JSON.stringify({
              sourceCollectionId: input.sourceCollectionId,
              amountPoisha: input.amountPoisha,
            }),
          )
          .digest('hex'),
        occurredAt: row.createdAt,
      })
      return row._id.toHexString()
    },
  }
}

export function correctionMonitoringAccess(connection: Connection) {
  return async (session: ClientSession, paymentId: string, offset: number, limit: number) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyCorrectionPersistence(connection)
    const model = refundModel(connection),
      filter = { paymentId }
    const rows = await model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .session(session)
      .lean()
    return {
      total: await model.countDocuments(filter).session(session),
      items: rows.map((r) => ({
        id: r._id.toHexString(),
        sourceCollectionId: r.sourceCollectionId.toHexString(),
        amountPoisha: r.amountPoisha,
        status: r.status,
        capacityStatus: r.capacityStatus,
      })),
    }
  }
}

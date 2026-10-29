import { randomBytes } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentModel } from './payment.model.js'
import { paymentRecordModels } from './payment-record.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { prepareAttemptInput, attemptAllocation } from './payment-attempt.schema.js'
import { createAuditWriter } from '../audit/audit.service.js'
export type PaymentAttemptAccess = {
  // Reauthorize exact order/principal for both new creation and replay in THIS transaction.
  authorize(session: ClientSession, orderId: string): Promise<void>
  // New creation additionally fences eligible order, every current allocation generation and verified
  // channel capability/range. Projection arithmetic alone is never authorization to collect money.
  allocation(
    session: ClientSession,
    orderId: string,
    channel: string,
    outstandingPoisha: number,
  ): Promise<unknown>
}
export function paymentAttemptService(
  connection: Connection,
  access: PaymentAttemptAccess,
  clock: () => Date = () => new Date(),
) {
  const payments = paymentModel(connection),
    { attempts } = paymentRecordModels(connection),
    audit = createAuditWriter(connection)
  const view = (row: InstanceType<typeof attempts>) => ({
    id: row._id.toHexString(),
    orderId: row.orderId.toHexString(),
    tranId: row.tranId,
    expectedAmountPoisha: row.expectedAmountPoisha,
    currency: row.currency,
    state: row.state,
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
  })
  return {
    async prepare(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const input = parseInput(prepareAttemptInput, raw)
      await access.authorize(session, input.orderId)
      try {
        await verifyPaymentRecordPersistence(connection)
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      const existing = await attempts.findById(input.attemptId).session(session)
      if (existing) {
        if (
          existing.orderId.toHexString() !== input.orderId ||
          existing.requestedChannel !== input.requestedChannel ||
          existing.retryOfAttemptId?.toHexString() !== input.retryOfAttemptId
        )
          throw new ApiError('IDEMPOTENCY_CONFLICT')
        if (
          !(await payments
            .exists({ _id: existing.paymentId, orderId: existing.orderId })
            .session(session))
        )
          throw new ApiError('STATE_CONFLICT')
        return view(existing)
      }
      const payment = await payments.findOne({ orderId: input.orderId }).session(session)
      if (
        payment?.method !== 'online' ||
        !['pending', 'failed'].includes(payment.paymentStatus) ||
        payment.riskStatus !== 'clear' ||
        payment.unassignedCollectedPoisha > 0 ||
        payment.revision >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      const amount = payment.expectedPoisha - payment.merchandiseFundedPoisha
      if (amount <= 0) throw new ApiError('STATE_CONFLICT')
      // The shared aggregate write serializes independent new-attempt identities and receipt/expiry decisions.
      const fenced = await payments.updateOne(
        { _id: payment._id, revision: payment.revision },
        { $inc: { revision: 1 } },
        { session },
      )
      if (fenced.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      const history = await attempts.exists({ orderId: payment.orderId }).session(session)
      if (
        await attempts
          .exists({
            orderId: payment.orderId,
            state: { $in: ['created', 'initiated', 'pending', 'uncertain'] },
          })
          .session(session)
      )
        throw new ApiError('STATE_CONFLICT')
      if (Boolean(history) !== Boolean(input.retryOfAttemptId)) throw new ApiError('STATE_CONFLICT')
      if (input.retryOfAttemptId) {
        const parent = await attempts
          .findOne({ _id: input.retryOfAttemptId, orderId: payment.orderId })
          .session(session)
        if (!parent || (await attempts.exists({ retryOfAttemptId: parent._id }).session(session)))
          throw new ApiError('STATE_CONFLICT')
      }
      const allocation = parseInput(
          attemptAllocation,
          await access.allocation(session, input.orderId, input.requestedChannel, amount),
        ),
        now = clock()
      if (
        allocation.orderId !== input.orderId ||
        allocation.channel !== input.requestedChannel ||
        !Number.isFinite(now.getTime()) ||
        allocation.heldAt > now ||
        allocation.expiresAt <= now
      )
        throw new ApiError('STATE_CONFLICT')
      if (amount < allocation.minPoisha || amount > allocation.maxPoisha)
        throw new ApiError('PAYMENT_AMOUNT_UNSUPPORTED')
      const [row] = await attempts.create(
        [
          {
            _id: new Types.ObjectId(input.attemptId),
            paymentId: payment._id,
            orderId: payment.orderId,
            provider: 'sslcommerz',
            tranId: `SZ${randomBytes(14).toString('hex')}`,
            expectedAmountPoisha: amount,
            initiatedOutstandingPoisha: amount,
            currency: 'BDT',
            amountDisposition: 'not_checked',
            requestedChannel: input.requestedChannel,
            state: 'created',
            expiresAt: allocation.expiresAt,
            ...(input.retryOfAttemptId
              ? { retryOfAttemptId: new Types.ObjectId(input.retryOfAttemptId) }
              : {}),
            createdAt: now,
            updatedAt: now,
          },
        ],
        { session },
      )
      if (!row) throw new ApiError('STATE_CONFLICT')
      await audit(session, {
        actorType: 'system',
        action: 'payment.attempt.prepare',
        targetType: 'payment_attempt',
        targetId: row._id.toHexString(),
        operationKey: `payment-attempt:${row._id.toHexString()}`,
        occurredAt: now,
      })
      return view(row)
    },
  }
}

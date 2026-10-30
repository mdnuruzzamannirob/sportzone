import { paymentRecordModels } from './payment-record.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentAmounts, paymentModel, type Payment } from './payment.model.js'
import { verifyPaymentPersistence } from './payment.persistence.js'
const input = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  method: z.enum(['cod', 'online']),
  expectedPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
// Trusted checkout capability only; owning coordinator binds these facts to the canonical order.
// No collection/attempt or Paid transition exists in this service.
export function checkoutPaymentAccess(connection: Connection) {
  const model = paymentModel(connection)
  return {
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const data = parseInput(input, raw)
      try {
        await verifyPaymentPersistence(connection)
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      await model.create(
        [
          {
            ...data,
            orderId: new Types.ObjectId(data.orderId),
            currency: 'BDT',
            paymentStatus: 'pending',
            riskStatus: 'clear',
            revision: 0,
            ...Object.fromEntries(paymentAmounts.map((name) => [name, 0])),
          },
        ],
        { session },
      )
    },
    async authorizeHoldExpiry(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyPaymentPersistence(connection)
      // Releasing capacity never cancels a payment attempt or declares collection failure.
      // All verified receipt applications must serialize on this same aggregate revision.
      const row = await model.findOneAndUpdate(
        {
          orderId,
          method: 'online',
          paymentStatus: 'pending',
          riskStatus: 'clear',
          ...Object.fromEntries(paymentAmounts.map((name) => [name, 0])),
          revision: { $lt: Number.MAX_SAFE_INTEGER },
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      )
      return Boolean(row)
    },
    async read(session: ClientSession, orderId: string) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const row = await model.findOne({ orderId }).session(session)
      if (!row) throw new ApiError('STATE_CONFLICT')
      return {
        paymentStatus: row.paymentStatus,
        expectedPoisha: row.expectedPoisha,
        currency: row.currency,
      }
    },
  }
}

export function paymentMethodBalanceAccess(connection: Connection) {
  const model = paymentModel(connection)
  return async (session: ClientSession, orderId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyPaymentPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await model.findOne({ orderId }).session(session)
    if (!row) throw new ApiError('SERVICE_UNAVAILABLE')
    return {
      method: row.method,
      remainingPoisha: Math.max(0, row.expectedPoisha - row.merchandiseFundedPoisha),
    }
  }
}

// Required fence for unpaid allocation refresh/shortfall. All funding/expiry decisions serialize here.
export function paymentInitiationEligibilityAccess(connection: Connection) {
  const payments = paymentModel(connection),
    { attempts } = paymentRecordModels(connection)
  return async (session: ClientSession, orderId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentRecordPersistence(connection)
    const payment = await payments.findOneAndUpdate(
      {
        orderId,
        method: 'online',
        paymentStatus: { $in: ['pending', 'failed'] },
        riskStatus: 'clear',
        unassignedCollectedPoisha: 0,
        revision: { $lt: Number.MAX_SAFE_INTEGER },
        $expr: { $gt: ['$expectedPoisha', '$merchandiseFundedPoisha'] },
      },
      { $inc: { revision: 1 } },
      { session, returnDocument: 'after' },
    )
    if (
      !payment ||
      (await attempts
        .exists({ orderId, state: { $in: ['created', 'initiated', 'pending', 'uncertain'] } })
        .session(session))
    )
      throw new ApiError('STATE_CONFLICT')
  }
}

export function fulfillmentPaymentAccess(connection: Connection) {
  const payments = paymentModel(connection)
  return async (
    session: ClientSession,
    input: { orderId: string; method: 'cod' | 'online'; expectedPoisha: number },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentPersistence(connection)
    const row = await payments.findOne({ orderId: input.orderId }).session(session)
    if (
      !row ||
      row.method !== input.method ||
      row.expectedPoisha !== input.expectedPoisha ||
      row.riskStatus !== 'clear' ||
      row.unassignedCollectedPoisha !== 0 ||
      row.revision >= Number.MAX_SAFE_INTEGER ||
      (row.method === 'online' &&
        (row.paymentStatus !== 'paid' || row.merchandiseFundedPoisha !== row.expectedPoisha)) ||
      (row.method === 'cod' && !['pending', 'paid'].includes(row.paymentStatus))
    )
      throw new ApiError('STATE_CONFLICT')
    const changed = await payments.updateOne(
      { _id: row._id, revision: row.revision },
      { $inc: { revision: 1 } },
      { session },
    )
    if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
  }
}

export function customerPaymentSummaryAccess(connection: Connection) {
  const project = (row: Payment) => ({
    status: row.paymentStatus,
    fundingContext:
      row.merchandiseFundedPoisha === 0 && row.correctionCollectedPoisha > 0
        ? ('correction_only' as const)
        : ('normal' as const),
    expectedPoisha: row.expectedPoisha,
    verifiedCollectedPoisha: row.verifiedCollectedPoisha,
    merchandiseFundedPoisha: row.merchandiseFundedPoisha,
    correctionCollectedPoisha: row.correctionCollectedPoisha,
    unassignedCollectedPoisha: row.unassignedCollectedPoisha,
    riskStatus: row.riskStatus,
    merchandiseRefundHeldPoisha: row.merchandiseRefundHeldPoisha,
    merchandiseRefundCompletedPoisha: row.merchandiseRefundCompletedPoisha,
    correctionRefundHeldPoisha: row.correctionRefundHeldPoisha,
    correctionRefundCompletedPoisha: row.correctionRefundCompletedPoisha,
  })
  const many = async (session: ClientSession, ids: string[]) => {
    if (!session.inTransaction() || ids.length > 100 || new Set(ids).size !== ids.length)
      throw new ApiError('STATE_CONFLICT')
    await verifyPaymentPersistence(connection)
    const rows = await paymentModel(connection)
      .find({ orderId: { $in: ids } })
      .session(session)
      .lean()
    if (rows.length !== ids.length) throw new ApiError('SERVICE_UNAVAILABLE')
    return new Map(rows.map((row) => [row.orderId.toHexString(), project(row)]))
  }
  return Object.assign(
    async (session: ClientSession, orderId: string) => {
      const result = (await many(session, [orderId])).get(orderId)
      if (!result) throw new ApiError('SERVICE_UNAVAILABLE')
      return result
    },
    { many },
  )
}

export function cancellationPaymentAccess(connection: Connection) {
  return async (
    session: ClientSession,
    input: { orderId: string; expectedPoisha: number; method: 'cod' | 'online' },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentRecordPersistence(connection)
    const row = await paymentModel(connection).findOneAndUpdate(
      {
        orderId: input.orderId,
        expectedPoisha: input.expectedPoisha,
        method: input.method,
        revision: { $lt: Number.MAX_SAFE_INTEGER },
      },
      { $inc: { revision: 1 } },
      { session, returnDocument: 'after' },
    )
    if (!row) throw new ApiError('STATE_CONFLICT')
    // No collection is erased, marked failed or made non-reconcilable by cancellation.
    return {
      paymentId: row._id.toHexString(),
      verifiedCollectedPoisha: row.verifiedCollectedPoisha,
    }
  }
}

import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentRecordModels } from './payment-record.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { paymentAmounts, paymentModel, type Payment } from './payment.model.js'
import { verifyPaymentPersistence } from './payment.persistence.js'
const input = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  method: z.enum(['cod', 'online']),
  expectedPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})

// Read-only snapshot: only an existing, linked, independently verified collection can fund a quote.
export function refundPaymentSnapshotAccess(connection: Connection) {
  const payments = paymentModel(connection),
    { collections } = paymentRecordModels(connection)
  return async (session: ClientSession, orderId: string, sourceCollectionId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentPersistence(connection)
    await verifyPaymentRecordPersistence(connection)
    const payment = await payments.findOne({ orderId }).session(session)
    if (!payment) throw new ApiError('NOT_FOUND')
    const source = await collections
      .findOne({ _id: sourceCollectionId, orderId, paymentId: payment._id })
      .session(session)
    if (!source) throw new ApiError('NOT_FOUND')
    const amounts = parseInput(
      z.strictObject({
        allocatedPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        heldPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        completedPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      }),
      {
        allocatedPoisha: source.get('merchandiseAllocatedPoisha'),
        heldPoisha: source.get('merchandiseRefundHeldPoisha'),
        completedPoisha: source.get('merchandiseRefundCompletedPoisha'),
      },
    )
    return {
      source: amounts,
      order: {
        allocatedPoisha: payment.merchandiseFundedPoisha,
        heldPoisha: payment.merchandiseRefundHeldPoisha,
        completedPoisha: payment.merchandiseRefundCompletedPoisha,
      },
      delivery: {
        heldPoisha: payment.deliveryRefundHeldPoisha,
        completedPoisha: payment.deliveryRefundCompletedPoisha,
      },
    }
  }
}
// Detached correction balances for a verified collection linked to this order's payment.
export function correctionPaymentSnapshotAccess(connection: Connection) {
  const payments = paymentModel(connection),
    { collections } = paymentRecordModels(connection)
  return async (session: ClientSession, orderId: string, sourceCollectionId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentPersistence(connection)
    await verifyPaymentRecordPersistence(connection)
    const payment = await payments.findOne({ orderId }).session(session)
    if (!payment) throw new ApiError('NOT_FOUND')
    const source = await collections
      .findOne({ _id: sourceCollectionId, orderId, paymentId: payment._id })
      .session(session)
    if (!source) throw new ApiError('NOT_FOUND')
    return {
      source: {
        allocatedPoisha: source.get('correctionAllocatedPoisha'),
        heldPoisha: source.get('correctionRefundHeldPoisha'),
        completedPoisha: source.get('correctionRefundCompletedPoisha'),
      },
      order: {
        allocatedPoisha: payment.correctionCollectedPoisha,
        heldPoisha: payment.correctionRefundHeldPoisha,
        completedPoisha: payment.correctionRefundCompletedPoisha,
      },
    }
  }
}

// Refunds receive detached verified funding and guarded class-specific reservation operations.
export function refundFundingAccess(connection: Connection) {
  const payments = paymentModel(connection),
    { collections } = paymentRecordModels(connection)
  const money = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  const capacity = z.strictObject({
    allocatedPoisha: money,
    heldPoisha: money,
    completedPoisha: money,
  })
  async function read(session: ClientSession, orderId: string) {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentPersistence(connection)
    await verifyPaymentRecordPersistence(connection)
    const payment = await payments.findOne({ orderId }).session(session)
    if (!payment) throw new ApiError('NOT_FOUND')
    return payment
  }
  const amounts = (allocatedPoisha: unknown, heldPoisha: unknown, completedPoisha: unknown) => {
    const value = parseInput(capacity, {
      allocatedPoisha,
      heldPoisha,
      completedPoisha,
    })
    if (BigInt(value.heldPoisha) + BigInt(value.completedPoisha) > BigInt(value.allocatedPoisha))
      throw new ApiError('STATE_CONFLICT')
    return value
  }
  return {
    async list(
      session: ClientSession,
      orderId: string,
      classification: 'merchandise' | 'payment_correction',
    ) {
      const payment = await read(session, orderId)
      const rows = await collections
        .find({ orderId, paymentId: payment._id })
        .sort({ _id: 1 })
        .limit(51)
        .session(session)
      if (rows.length > 50) throw new ApiError('SERVICE_UNAVAILABLE')
      const correction = classification === 'payment_correction'
      return {
        paymentId: payment._id.toHexString(),
        order: amounts(
          correction ? payment.correctionCollectedPoisha : payment.merchandiseFundedPoisha,
          correction ? payment.correctionRefundHeldPoisha : payment.merchandiseRefundHeldPoisha,
          correction
            ? payment.correctionRefundCompletedPoisha
            : payment.merchandiseRefundCompletedPoisha,
        ),
        delivery: {
          heldPoisha: payment.deliveryRefundHeldPoisha,
          completedPoisha: payment.deliveryRefundCompletedPoisha,
        },
        sources: rows.map((row) => ({
          sourceCollectionId: row._id.toHexString(),
          provider: row.provider,
          merchantAccountKey: row.merchantAccountKey,
          ...(row.bankTranId ? { bankTranId: row.bankTranId } : {}),
          collectedAt: row.collectedAt,
          verifiedAt: row.verifiedAt,
          ...amounts(
            row.get(correction ? 'correctionAllocatedPoisha' : 'merchandiseAllocatedPoisha'),
            row.get(correction ? 'correctionRefundHeldPoisha' : 'merchandiseRefundHeldPoisha'),
            row.get(
              correction ? 'correctionRefundCompletedPoisha' : 'merchandiseRefundCompletedPoisha',
            ),
          ),
        })),
      }
    },
    async reserve(session: ClientSession, raw: unknown) {
      const input = parseInput(
        z.strictObject({
          orderId: z.string().regex(/^[a-f0-9]{24}$/),
          sourceCollectionId: z.string().regex(/^[a-f0-9]{24}$/),
          classification: z.enum(['merchandise', 'payment_correction']),
          amountPoisha: money.refine((n) => n > 0),
          deliveryAmountPoisha: money,
          deliveryChargePoisha: money,
        }),
        raw,
      )
      const payment = await read(session, input.orderId)
      const row = await collections
        .findOne({
          _id: input.sourceCollectionId,
          orderId: input.orderId,
          paymentId: payment._id,
        })
        .session(session)
      if (!row) throw new ApiError('NOT_FOUND')
      const correction = input.classification === 'payment_correction'
      const allocated = correction ? 'correctionAllocatedPoisha' : 'merchandiseAllocatedPoisha'
      const held = correction ? 'correctionRefundHeldPoisha' : 'merchandiseRefundHeldPoisha'
      const completed = correction
        ? 'correctionRefundCompletedPoisha'
        : 'merchandiseRefundCompletedPoisha'
      const source = amounts(row.get(allocated), row.get(held), row.get(completed))
      const order = amounts(
        correction ? payment.correctionCollectedPoisha : payment.merchandiseFundedPoisha,
        payment[held],
        payment[completed],
      )
      if (
        input.deliveryAmountPoisha > input.amountPoisha ||
        (correction && input.deliveryAmountPoisha) ||
        input.amountPoisha > source.allocatedPoisha - source.heldPoisha - source.completedPoisha ||
        input.amountPoisha > order.allocatedPoisha - order.heldPoisha - order.completedPoisha ||
        (!correction &&
          BigInt(payment.deliveryRefundHeldPoisha) +
            BigInt(payment.deliveryRefundCompletedPoisha) +
            BigInt(input.deliveryAmountPoisha) >
            BigInt(input.deliveryChargePoisha))
      )
        throw new ApiError('REFUND_BALANCE_EXCEEDED')
      if (
        payment.revision >= Number.MAX_SAFE_INTEGER ||
        row.get('revision') >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      const changed = await collections.updateOne(
        { _id: row._id, revision: row.get('revision') },
        { $inc: { [held]: input.amountPoisha, revision: 1 } },
        { session },
      )
      const aggregate = await payments.updateOne(
        { _id: payment._id, revision: payment.revision },
        {
          $inc: {
            [held]: input.amountPoisha,
            deliveryRefundHeldPoisha: input.deliveryAmountPoisha,
            revision: 1,
          },
        },
        { session },
      )
      if (changed.modifiedCount !== 1 || aggregate.modifiedCount !== 1)
        throw new ApiError('STATE_CONFLICT')
    },
  }
}
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
        .exists({
          orderId,
          state: { $in: ['created', 'initiated', 'pending', 'uncertain'] },
        })
        .session(session))
    )
      throw new ApiError('STATE_CONFLICT')
  }
}

export function fulfillmentPaymentAccess(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const payments = paymentModel(connection)
  const access = async (
    session: ClientSession,
    input: {
      orderId: string
      method: 'cod' | 'online'
      expectedPoisha: number
    },
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
  return Object.assign(access, {
    fundedAt: verifiedFullPaymentTimeAccess(connection, clock),
  })
}

export function customerPaymentSummaryAccess(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
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
    { many, fundedAt: verifiedFullPaymentTimeAccess(connection, clock) },
  )
}

export function cancellationPaymentAccess(connection: Connection) {
  return async (
    session: ClientSession,
    input: {
      orderId: string
      expectedPoisha: number
      method: 'cod' | 'online'
    },
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

// Reconstruct the actual full-funding event from canonical verified sources, never fulfillment time.
export function verifiedFullPaymentTimeAccess(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  return async (session: ClientSession, orderId: string) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentPersistence(connection)
    await verifyPaymentRecordPersistence(connection)
    const payment = await paymentModel(connection).findOne({ orderId }).session(session)
    if (!payment) throw new ApiError('NOT_FOUND')
    if (payment.method !== 'online' || payment.merchandiseFundedPoisha < payment.expectedPoisha)
      return undefined
    if (payment.expectedPoisha <= 0 || payment.merchandiseFundedPoisha !== payment.expectedPoisha)
      throw new ApiError('SERVICE_UNAVAILABLE')
    const rows = await paymentRecordModels(connection)
      .collections.find({ paymentId: payment._id, orderId })
      .sort({ collectedAt: 1, _id: 1 })
      .limit(101)
      .session(session)
    if (rows.length > 100) throw new ApiError('SERVICE_UNAVAILABLE')
    const at = clock()
    if (!Number.isFinite(at.getTime())) throw new ApiError('SERVICE_UNAVAILABLE')
    let sum = 0n,
      fullyPaidAt: string | undefined
    for (const row of rows) {
      const amount = parseInput(
        z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        row.get('merchandiseAllocatedPoisha'),
      )
      if (
        row.provider !== 'sslcommerz' ||
        !Number.isFinite(row.collectedAt.getTime()) ||
        !Number.isFinite(row.verifiedAt.getTime()) ||
        row.collectedAt > at ||
        row.verifiedAt > at
      )
        throw new ApiError('SERVICE_UNAVAILABLE')
      sum += BigInt(amount)
      if (!fullyPaidAt && sum >= BigInt(payment.expectedPoisha))
        fullyPaidAt = row.collectedAt.toISOString()
    }
    if (sum !== BigInt(payment.merchandiseFundedPoisha) || !fullyPaidAt)
      throw new ApiError('SERVICE_UNAVAILABLE')
    return fullyPaidAt
  }
}

import { type ClientSession, type Connection, Types } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { paymentRecordModels } from './collections/payment-record.model.js'
import { verifyPaymentRecordPersistence } from './collections/payment-record.persistence.js'
import { type Payment, paymentAmounts, paymentModel } from './payment.model.js'
import { verifyPaymentPersistence } from './payment.persistence.js'

const input = z.strictObject({
  orderId: z.string().regex(/^[a-f0-9]{24}$/),
  method: z.enum(['cod', 'online']),
  expectedPoisha: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})

// Read-only snapshot: only an existing, linked, independently verified collection can fund a quote.
function refundPaymentSnapshotAccess(connection: Connection) {
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
function correctionPaymentSnapshotAccess(connection: Connection) {
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
function refundFundingAccess(connection: Connection) {
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
    async settle(session: ClientSession, raw: unknown) {
      const input = parseInput(
        z.strictObject({
          orderId: z.string().regex(/^[a-f0-9]{24}$/),
          sourceCollectionId: z.string().regex(/^[a-f0-9]{24}$/),
          classification: z.enum(['merchandise', 'payment_correction']),
          amountPoisha: money.refine((n) => n > 0),
          deliveryAmountPoisha: money,
          complete: z.boolean(),
          occurredAt: z.date(),
        }),
        raw,
      )
      const payment = await read(session, input.orderId)
      const row = await collections
        .findOne({ _id: input.sourceCollectionId, orderId: input.orderId, paymentId: payment._id })
        .session(session)
      const correction = input.classification === 'payment_correction'
      const held = correction ? 'correctionRefundHeldPoisha' : 'merchandiseRefundHeldPoisha'
      const completed = correction
        ? 'correctionRefundCompletedPoisha'
        : 'merchandiseRefundCompletedPoisha'
      if (
        !row ||
        row.get(held) < input.amountPoisha ||
        payment[held] < input.amountPoisha ||
        payment.deliveryRefundHeldPoisha < input.deliveryAmountPoisha ||
        (correction && input.deliveryAmountPoisha) ||
        input.deliveryAmountPoisha > input.amountPoisha ||
        payment.revision >= Number.MAX_SAFE_INTEGER ||
        row.get('revision') >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      const inc = {
        [held]: -input.amountPoisha,
        ...(input.complete ? { [completed]: input.amountPoisha } : {}),
        revision: 1,
      }
      const source = await collections.collection.updateOne(
        { _id: row._id, revision: row.get('revision') },
        { $inc: inc, $set: { updatedAt: input.occurredAt } },
        { session },
      )
      const refunded =
        payment.merchandiseRefundCompletedPoisha +
        (!correction && input.complete ? input.amountPoisha : 0)
      const paymentStatus =
        !correction &&
        input.complete &&
        payment.expectedPoisha > 0 &&
        payment.merchandiseFundedPoisha === payment.expectedPoisha
          ? refunded >= payment.merchandiseFundedPoisha
            ? 'refunded'
            : 'partially_refunded'
          : payment.paymentStatus
      const aggregate = await payments.collection.updateOne(
        { _id: payment._id, revision: payment.revision },
        {
          $inc: {
            ...inc,
            deliveryRefundHeldPoisha: -input.deliveryAmountPoisha,
            ...(input.complete
              ? { deliveryRefundCompletedPoisha: input.deliveryAmountPoisha }
              : {}),
          },
          $set: { paymentStatus, updatedAt: input.occurredAt },
        },
        { session },
      )
      if (source.modifiedCount !== 1 || aggregate.modifiedCount !== 1)
        throw new ApiError('STATE_CONFLICT')
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
function checkoutPaymentAccess(connection: Connection) {
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

function paymentMethodBalanceAccess(connection: Connection) {
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
function paymentInitiationEligibilityAccess(connection: Connection) {
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

function fulfillmentPaymentAccess(connection: Connection, clock: () => Date = () => new Date()) {
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

function customerPaymentSummaryAccess(
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
    {
      many,
      fundedAt: verifiedFullPaymentTimeAccess(connection, clock),
      async history(session: ClientSession, orderId: string) {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        try {
          await verifyPaymentRecordPersistence(connection)
        } catch {
          throw new ApiError('SERVICE_UNAVAILABLE')
        }
        const payment = (await many(session, [orderId])).get(orderId)
        if (!payment) throw new ApiError('SERVICE_UNAVAILABLE')
        const rows = await paymentRecordModels(connection)
          .attempts.find({ orderId })
          .sort({ createdAt: -1, _id: -1 })
          .limit(50)
          .session(session)
        return {
          payment,
          attempts: rows.map((row) => ({
            id: row._id.toHexString(),
            state: row.state,
            expectedAmountPoisha: row.expectedAmountPoisha,
            ...(row.verifiedReceiptAmountPoisha !== undefined
              ? { verifiedReceiptAmountPoisha: row.verifiedReceiptAmountPoisha }
              : {}),
            amountDisposition: row.amountDisposition,
            riskStatus: payment.riskStatus,
            ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
            ...(row.lastCheckedAt ? { lastCheckedAt: row.lastCheckedAt.toISOString() } : {}),
          })),
        }
      },
    },
  )
}

function cancellationPaymentAccess(connection: Connection) {
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
function verifiedFullPaymentTimeAccess(
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

function paymentReportAccess(connection: Connection) {
  const { collections, intake } = paymentRecordModels(connection),
    payments = paymentModel(connection)
  return async (
    session: ClientSession,
    period: {
      from: Date
      to: Date
      asOf: Date
    },
    codOrderIds: string[],
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyPaymentRecordPersistence(connection)
    await verifyPaymentPersistence(connection)
    const rows = await collections
      .find({
        collectedAt: { $gte: period.from, $lt: period.to },
        verifiedAt: { $lte: period.asOf },
      })
      .select(
        'amountPoisha collectedAt provider merchandiseAllocatedPoisha correctionAllocatedPoisha unassignedAllocatedPoisha',
      )
      .limit(5001)
      .maxTimeMS(5000)
      .session(session)
    const cod = await payments
      .find({ orderId: { $in: codOrderIds } })
      .select('expectedPoisha verifiedCollectedPoisha')
      .limit(5001)
      .maxTimeMS(5000)
      .session(session)
    const unmatched = await intake
      .aggregate<{
        amount: number
      }>([
        {
          $match: {
            matchingStatus: 'unmatched',
            verifiedAt: { $lte: period.asOf },
            collectedAt: { $gte: period.from, $lt: period.to },
          },
        },
        { $group: { _id: null, amount: { $sum: '$amountPoisha' } } },
      ])
      .option({ maxTimeMS: 5000 })
      .session(session)
    const balances = await collections
      .aggregate<{
        unassigned: number
      }>([
        { $match: { verifiedAt: { $lte: period.asOf } } },
        { $group: { _id: null, unassigned: { $sum: '$unassignedAllocatedPoisha' } } },
      ])
      .option({ maxTimeMS: 5000 })
      .session(session)
    if (rows.length > 5000 || cod.length > 5000) throw new ApiError('BUSINESS_RULE_VIOLATION')
    return {
      collections: rows.map((row) => ({
        id: row._id.toHexString(),
        amountPoisha: row.amountPoisha,
        collectedAt: row.collectedAt.toISOString(),
        sourceKind: row.provider,
        merchandisePoisha: z.int().nonnegative().parse(row.get('merchandiseAllocatedPoisha')),
        correctionPoisha: z.int().nonnegative().parse(row.get('correctionAllocatedPoisha')),
        unassignedPoisha: z.int().nonnegative().parse(row.get('unassignedAllocatedPoisha')),
      })),
      codBalances: cod.map((row) => ({
        id: row._id.toHexString(),
        expectedPoisha: row.expectedPoisha,
        verifiedCollectedPoisha: row.verifiedCollectedPoisha,
      })),
      unattributedProviderCashPoisha: unmatched[0]?.amount ?? 0,
      unassignedLinkedCashPoisha: balances[0]?.unassigned ?? 0,
    }
  }
}

function paymentExceptionQueueAccess(connection: Connection) {
  const payments = paymentModel(connection),
    { attempts } = paymentRecordModels(connection)
  return async (
    session: ClientSession,
    input: {
      page: number
      pageSize: number
    },
    reconciliation: boolean,
  ) => {
    await verifyPaymentPersistence(connection)
    await verifyPaymentRecordPersistence(connection)
    const offset = (input.page - 1) * input.pageSize
    if (reconciliation) {
      const filter = { state: { $in: ['initiated', 'pending', 'uncertain'] as const } }
      const rows = await attempts
        .find(filter)
        .select('orderId state')
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(input.pageSize)
        .maxTimeMS(5000)
        .session(session)
      return {
        items: rows.map((row) => ({
          id: row._id.toHexString(),
          orderId: row.orderId.toHexString(),
          status: row.state,
          reasonCode: 'PAYMENT_RECONCILIATION',
        })),
        pagination: pageMeta(input, await attempts.countDocuments(filter).session(session)),
      }
    }
    const filter = {
      $or: [{ riskStatus: { $ne: 'clear' as const } }, { unassignedCollectedPoisha: { $gt: 0 } }],
    }
    const rows = await payments
      .find(filter)
      .select('orderId paymentStatus')
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(input.pageSize)
      .maxTimeMS(5000)
      .session(session)
    return {
      items: rows.map((row) => ({
        id: row._id.toHexString(),
        orderId: row.orderId.toHexString(),
        status: row.paymentStatus,
        reasonCode: 'PAYMENT_REVIEW',
      })),
      pagination: pageMeta(input, await payments.countDocuments(filter).session(session)),
    }
  }
}

export {
  cancellationPaymentAccess,
  checkoutPaymentAccess,
  correctionPaymentSnapshotAccess,
  customerPaymentSummaryAccess,
  fulfillmentPaymentAccess,
  paymentExceptionQueueAccess,
  paymentInitiationEligibilityAccess,
  paymentMethodBalanceAccess,
  paymentReportAccess,
  refundFundingAccess,
  refundPaymentSnapshotAccess,
  verifiedFullPaymentTimeAccess,
}

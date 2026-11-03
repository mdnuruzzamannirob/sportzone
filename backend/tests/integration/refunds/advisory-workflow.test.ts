import { Types } from 'mongoose'
import { expect, it } from 'vitest'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { refundOrderSnapshotAccess } from '../../../src/modules/orders/order.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import {
  correctionPaymentSnapshotAccess,
  refundPaymentSnapshotAccess,
} from '../../../src/modules/payments/payment.service.js'
import {
  createCorrectionRefundAdvisoryService,
  createMultiSourceRefundAdvisoryService,
} from '../../../src/modules/refunds/obligations/refund-advisory.service.js'
import { refundClaimSnapshotAccess } from '../../../src/modules/returns/return.service.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import { refundAdvisory } from '../../helpers/commerce/refunds.js'
import { physicalReturnFixture } from '../../helpers/commerce/returns.js'

registerCommerceFixture()

it('correction advisory local: linked verified excess is class-isolated, bounded and read-only', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ bank_tran_id: 'correction-bank', val_id: 'correction-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'correction-validation' })).toBe(
    'committed',
  )
  const collections = paymentRecordModels(context.db.connection).collections
  const sources = await collections.find({ orderId: f.result.id })
  const correction = sources.find((source) => source.get('correctionAllocatedPoisha') > 0)
  const merchandise = sources.find((source) => source.get('merchandiseAllocatedPoisha') > 0)
  if (!correction || !merchandise) throw new Error('Missing verified fixture collections')
  const service = createCorrectionRefundAdvisoryService(
    correctionPaymentSnapshotAccess(context.db.connection),
  )
  const input = {
    orderId: f.result.id,
    sourceCollectionIds: [correction._id.toHexString()],
    requestedPoisha: correction.get('correctionAllocatedPoisha'),
  }
  const beforePayment = await paymentModel(context.db.connection)
    .findById(f.attempt.paymentId)
    .lean()
  const beforeSources = await collections.find({ orderId: f.result.id }).sort({ _id: 1 }).lean()
  expect(
    await inTransaction(context.db.connection, (session) => service(session, input)),
  ).toMatchObject({
    status: 'advisory',
    correctionAmountPoisha: input.requestedPoisha,
    allocations: [
      { sourceCollectionId: input.sourceCollectionIds[0], amountPoisha: input.requestedPoisha },
    ],
  })
  expect(
    await inTransaction(context.db.connection, (session) =>
      service(session, { ...input, sourceCollectionIds: [merchandise._id.toHexString()] }),
    ),
  ).toMatchObject({ status: 'insufficient_collected_balance', sourceAvailablePoisha: 0 })
  expect(
    await inTransaction(context.db.connection, (session) =>
      service(session, { ...input, requestedPoisha: input.requestedPoisha + 1 }),
    ),
  ).toMatchObject({ status: 'insufficient_collected_balance' })
  await expect(
    inTransaction(context.db.connection, (session) =>
      service(session, { ...input, orderId: new Types.ObjectId().toHexString() }),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const other = await processingFixture()
  await expect(
    inTransaction(context.db.connection, (session) =>
      service(session, { ...input, orderId: other.result.id }),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(
    inTransaction(context.db.connection, (session) =>
      service(session, {
        ...input,
        sourceCollectionIds: [input.sourceCollectionIds[0], input.sourceCollectionIds[0]],
      }),
    ),
  ).rejects.toThrow()
  expect(await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean()).toEqual(
    beforePayment,
  )
  expect(await collections.find({ orderId: f.result.id }).sort({ _id: 1 }).lean()).toEqual(
    beforeSources,
  )
})

it('correction advisory local: deterministic multi-source planning subtracts existing commitments', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  for (const label of ['first', 'second']) {
    f.change({ bank_tran_id: `correction-${label}-bank`, val_id: `correction-${label}-validation` })
    expect(
      await f.processor().process({ ...f.claim, validationId: `correction-${label}-validation` }),
    ).toBe('committed')
  }
  const collections = paymentRecordModels(context.db.connection).collections
  const rows = (await collections.find({ orderId: f.result.id })).filter(
    (row) => row.get('correctionAllocatedPoisha') > 0,
  )
  expect(rows).toHaveLength(2)
  const first = rows[0]
  if (!first) throw new Error('Missing correction source')
  await inTransaction(context.db.connection, async (session) => {
    await collections.updateOne(
      { _id: first._id, revision: first.revision },
      { $set: { correctionRefundHeldPoisha: 1 }, $inc: { revision: 1 } },
      { session },
    )
    await paymentModel(context.db.connection).updateOne(
      {
        _id: f.attempt.paymentId,
        revision: (
          await paymentModel(context.db.connection)
            .findById(f.attempt.paymentId)
            .session(session)
            .orFail()
        ).revision,
      },
      { $set: { correctionRefundHeldPoisha: 1 }, $inc: { revision: 1 } },
      { session },
    )
  })
  const service = createCorrectionRefundAdvisoryService(
    correctionPaymentSnapshotAccess(context.db.connection),
  )
  const ids = rows.map((row) => row._id.toHexString())
  const input = {
    orderId: f.result.id,
    sourceCollectionIds: ids,
    requestedPoisha: f.attempt.expectedAmountPoisha + 1,
  }
  const firstResult = await inTransaction(context.db.connection, (session) =>
    service(session, input),
  )
  const reverseResult = await inTransaction(context.db.connection, (session) =>
    service(session, { ...input, sourceCollectionIds: [...ids].reverse() }),
  )
  expect(firstResult).toEqual(reverseResult)
  expect(firstResult).toMatchObject({
    status: 'advisory',
    orderAvailablePoisha: 2 * f.attempt.expectedAmountPoisha - 1,
  })
  if (firstResult.status === 'advisory')
    expect(firstResult.allocations.reduce((sum, slice) => sum + slice.amountPoisha, 0)).toBe(
      input.requestedPoisha,
    )
})

it('refund advisory local: uncollected COD has no verified source and cannot produce a quote', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory()(session, {
        orderId: f.id,
        claimId: f.claimId,
        sourceCollectionId: new Types.ObjectId().toHexString(),
        items: [{ orderItemId: f.itemId, quantity: 1 }],
        deliveryRequestedPoisha: 0,
      }),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(
    await paymentRecordModels(context.db.connection).collections.countDocuments({ orderId: f.id }),
  ).toBe(0)
})

it('refund advisory local: verified COD and inspected claim use historical unit price without changing balances', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  await f.cash()
  const source = await paymentRecordModels(context.db.connection)
    .collections.findOne({ orderId: f.id })
    .orFail()
  const beforeOrder = await orderModels(context.db.connection).orders.findById(f.id).lean().orFail()
  const beforeBalance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.id })
    .lean()
    .orFail()
  const beforeSource = await paymentRecordModels(context.db.connection)
    .collections.findById(source._id)
    .lean()
    .orFail()
  const input = {
    orderId: f.id,
    claimId: f.claimId,
    sourceCollectionId: source._id.toHexString(),
    items: [{ orderItemId: f.itemId, quantity: 1 }],
    deliveryRequestedPoisha: 0,
  }
  const unit = beforeBalance.unitCoverage[0]
  if (!unit) throw new Error('Missing historical unit')
  await productModels(context.db.connection).variants.updateOne(
    { _id: f.selected.row._id },
    { $set: { regularPricePoisha: 3000, salePricePoisha: 2000 } },
  )
  const result = await inTransaction(context.db.connection, (session) =>
    refundAdvisory()(session, input),
  )
  expect(result).toMatchObject({
    status: 'advisory',
    amountPoisha: unit.netEntitlementPoisha,
    items: [{ unitAmounts: [{ ordinal: unit.ordinal, amountPoisha: unit.netEntitlementPoisha }] }],
  })
  expect(await orderModels(context.db.connection).orders.findById(f.id).lean().orFail()).toEqual(
    beforeOrder,
  )
  expect(
    await orderModels(context.db.connection).balances.findOne({ orderId: f.id }).lean().orFail(),
  ).toEqual(beforeBalance)
  expect(
    await paymentRecordModels(context.db.connection)
      .collections.findById(source._id)
      .lean()
      .orFail(),
  ).toEqual(beforeSource)
  expect(
    await context.db.connection
      .collection('refunds')
      .countDocuments({ orderId: new Types.ObjectId(f.id) }),
  ).toBe(0)
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory()(session, { ...input, items: [{ orderItemId: f.itemId, quantity: 3 }] }),
    ),
  ).rejects.toThrow()
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory()(session, { ...input, orderId: new Types.ObjectId().toHexString() }),
    ),
  ).rejects.toThrow()
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory()(session, { ...input, deliveryRequestedPoisha: 1 }),
    ),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
})

it('refund advisory local: physical receipt without inspection cannot authorize a refund', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.cash()
  const source = await paymentRecordModels(context.db.connection)
    .collections.findOne({ orderId: f.id })
    .orFail()
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory()(session, {
        orderId: f.id,
        claimId: f.claimId,
        sourceCollectionId: source._id.toHexString(),
        items: [{ orderItemId: f.itemId, quantity: 1 }],
        deliveryRequestedPoisha: 0,
      }),
    ),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
})

it('refund advisory local: approved shortage uses only approved ordinals with no physical restoration', async () => {
  const f = await physicalReturnFixture('shortage')
  await f.cash()
  const source = await paymentRecordModels(context.db.connection)
    .collections.findOne({ orderId: f.id })
    .orFail()
  const result = await inTransaction(context.db.connection, (session) =>
    refundAdvisory()(session, {
      orderId: f.id,
      claimId: f.claimId,
      sourceCollectionId: source._id.toHexString(),
      items: [{ orderItemId: f.itemId, quantity: 1 }],
      deliveryRequestedPoisha: 0,
    }),
  )
  expect(result.status).toBe('advisory')
  expect(
    await context.db.connection
      .collection('inventoryMovements')
      .countDocuments({ type: 'return_receipt', orderId: new Types.ObjectId(f.id) }),
  ).toBe(0)
})

it('refund advisory local: held amounts reduce historical unit and both verified funding balances', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  await f.cash()
  const collections = paymentRecordModels(context.db.connection).collections
  const source = await collections.findOne({ orderId: f.id }).orFail()
  const payment = await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  const balances = orderModels(context.db.connection).balances
  const balance = await balances.findOne({ orderId: f.id }).orFail()
  const unit = balance.unitCoverage[0]
  if (!unit || unit.netEntitlementPoisha < 2) throw new Error('Unsuitable fixture entitlement')
  // Isolated synthetic prior commitment; no refund writer is enabled in application runtime.
  await inTransaction(context.db.connection, async (session) => {
    await balances.updateOne(
      { _id: balance._id, revision: balance.revision },
      { $set: { 'unitCoverage.0.refundHeldPoisha': 1 }, $inc: { revision: 1 } },
      { session },
    )
    await collections.updateOne(
      { _id: source._id, revision: source.revision },
      { $set: { merchandiseRefundHeldPoisha: 1 }, $inc: { revision: 1 } },
      { session },
    )
    await paymentModel(context.db.connection).updateOne(
      { _id: payment._id, revision: payment.revision },
      { $set: { merchandiseRefundHeldPoisha: 1 }, $inc: { revision: 1 } },
      { session },
    )
  })
  const result = await inTransaction(context.db.connection, (session) =>
    refundAdvisory()(session, {
      orderId: f.id,
      claimId: f.claimId,
      sourceCollectionId: source._id.toHexString(),
      items: [{ orderItemId: f.itemId, quantity: 1 }],
      deliveryRequestedPoisha: 0,
    }),
  )
  expect(result).toMatchObject({ status: 'advisory', amountPoisha: unit.netEntitlementPoisha - 1 })
  if (result.status === 'advisory') {
    expect(result.sourceAvailablePoisha).toBe(source.get('merchandiseAllocatedPoisha') - 1)
    expect(result.orderAvailablePoisha).toBe(payment.merchandiseFundedPoisha - 1)
  }
})

it('refund advisory local: a source collected for another order is never usable', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  const other = await physicalReturnFixture()
  await other.cash()
  const source = await paymentRecordModels(context.db.connection)
    .collections.findOne({ orderId: other.id })
    .orFail()
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory()(session, {
        orderId: f.id,
        claimId: f.claimId,
        sourceCollectionId: source._id.toHexString(),
        items: [{ orderItemId: f.itemId, quantity: 1 }],
        deliveryRequestedPoisha: 0,
      }),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('refund advisory local: delivery charge requires current trusted policy and stays within original snapshot', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  await f.cash()
  const source = await paymentRecordModels(context.db.connection)
    .collections.findOne({ orderId: f.id })
    .orFail()
  const input = {
    orderId: f.id,
    claimId: f.claimId,
    sourceCollectionId: source._id.toHexString(),
    items: [{ orderItemId: f.itemId, quantity: 1 }],
    deliveryRequestedPoisha: 1,
  }
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory(async () => false)(session, input),
    ),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  expect(
    await inTransaction(context.db.connection, (session) =>
      refundAdvisory(async () => true)(session, input),
    ),
  ).toMatchObject({ status: 'advisory', deliveryAmountPoisha: 1 })
  await expect(
    inTransaction(context.db.connection, (session) =>
      refundAdvisory(async () => true)(session, { ...input, deliveryRequestedPoisha: 101 }),
    ),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
})

it('multi-source refund local: linked partial COD collections split one original unit without writes', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  await f.cash(300, 'source-first')
  await f.cash(300, 'source-second')
  const collection = paymentRecordModels(context.db.connection).collections
  const sources = await collection.find({ orderId: f.id }).sort({ _id: 1 }).lean()
  expect(sources).toHaveLength(2)
  const before = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.id })
    .lean()
    .orFail()
  const planner = createMultiSourceRefundAdvisoryService(
    refundClaimSnapshotAccess(context.db.connection),
    refundOrderSnapshotAccess(context.db.connection),
    refundPaymentSnapshotAccess(context.db.connection),
  )
  const input = {
    orderId: f.id,
    claimId: f.claimId,
    sourceCollectionIds: sources.map((s) => s._id.toHexString()),
    items: [{ orderItemId: f.itemId, quantity: 1 }],
    deliveryRequestedPoisha: 0,
  }
  const plan = await inTransaction(context.db.connection, (session) => planner(session, input))
  expect(plan.status).toBe('advisory')
  if (plan.status !== 'advisory') throw new Error('Expected valid advisory')
  expect(plan.amountPoisha).toBe(before.unitCoverage[0]?.netEntitlementPoisha)
  expect(plan.slices).toHaveLength(2)
  expect(plan.slices.reduce((sum, slice) => sum + slice.amountPoisha, 0)).toBe(plan.amountPoisha)
  expect(
    await inTransaction(context.db.connection, (session) =>
      planner(session, { ...input, sourceCollectionIds: [...input.sourceCollectionIds].reverse() }),
    ),
  ).toEqual(plan)
  expect(
    await orderModels(context.db.connection).balances.findOne({ orderId: f.id }).lean().orFail(),
  ).toEqual(before)
  expect(await collection.find({ orderId: f.id }).sort({ _id: 1 }).lean()).toEqual(sources)
  expect(
    await context.db.connection
      .collection('refunds')
      .countDocuments({ orderId: new Types.ObjectId(f.id) }),
  ).toBe(0)
})

it('multi-source refund local: duplicate or foreign collection sources cannot create a plan', async () => {
  const f = await physicalReturnFixture()
  await f.receive()
  await f.inspect()
  await f.cash()
  const other = await physicalReturnFixture()
  await other.cash(undefined, 'foreign-source-unique')
  const collection = paymentRecordModels(context.db.connection).collections
  const own = await collection.findOne({ orderId: f.id }).orFail(),
    foreign = await collection.findOne({ orderId: other.id }).orFail()
  const planner = createMultiSourceRefundAdvisoryService(
    refundClaimSnapshotAccess(context.db.connection),
    refundOrderSnapshotAccess(context.db.connection),
    refundPaymentSnapshotAccess(context.db.connection),
  )
  const input = {
    orderId: f.id,
    claimId: f.claimId,
    sourceCollectionIds: [own._id.toHexString(), foreign._id.toHexString()],
    items: [{ orderItemId: f.itemId, quantity: 1 }],
    deliveryRequestedPoisha: 0,
  }
  await expect(
    inTransaction(context.db.connection, (session) => planner(session, input)),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(
    inTransaction(context.db.connection, (session) =>
      planner(session, {
        ...input,
        sourceCollectionIds: [own._id.toHexString(), own._id.toHexString()],
      }),
    ),
  ).rejects.toThrow()
})

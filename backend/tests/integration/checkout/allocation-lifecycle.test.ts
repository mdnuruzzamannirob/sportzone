import { Types } from 'mongoose'
import { expect, it } from 'vitest'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { variantStockAccess } from '../../../src/modules/catalog/products/variant.service.js'
import {
  createCheckoutCompletionService,
  createCheckoutIntentService,
} from '../../../src/modules/checkout/checkout.service.js'
import {
  inventoryMovementModel,
  inventoryReservationModel,
} from '../../../src/modules/inventory/inventory.model.js'
import { createAllocationService } from '../../../src/modules/inventory/inventory.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  initialOrderAllocationAccess,
  paymentAllocationOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import { createOrderAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { paymentEligibility } from '../../../src/modules/payments/attempts/payment-eligibility.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { paymentInitiationEligibilityAccess } from '../../../src/modules/payments/payment.service.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { initializeCouponPersistence } from '../../../src/modules/promotions/promotion.persistence.js'
import { settingsModel } from '../../../src/modules/settings/setting.model.js'
import {
  composeAuditAccess,
  composeCheckoutCompletionDependencies,
  composeCheckoutIntentDependencies,
  composeOrderAllocationDependencies,
  composePaymentEligibilityDependencies,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  body,
  context,
  coupon,
  guest,
  makeService,
  registerCommerceFixture,
  submit,
  variant,
} from '../../helpers/commerce/base.js'
import {
  expiryJob,
  heldOrder,
  paymentAllocations,
  submissionService,
} from '../../helpers/commerce/checkout.js'

registerCommerceFixture()

it('online foundation captures one server hold clock for every SKU/coupon and replay never extends it', async () => {
  const who = await guest(),
    first = await variant(),
    second = await variant(),
    promotion = await coupon()
  const quotes = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const input = { ...body([first.item, second.item]), method: 'bkash', couponCode: 'SYNTHETIC' }
  const quote = await quotes.create(who.credentials, input),
    api = submissionService(quotes),
    began = context.now.getTime()
  const result = await api.submit(who.credentials, submit(input, quote), 'synthetic-online')
  const holds = await inventoryReservationModel(context.db.connection).find({ orderId: result.id })
  expect(holds).toHaveLength(2)
  for (const hold of holds) {
    expect(hold.status).toBe('held')
    expect(hold.heldAt?.getTime()).toBe(began)
    expect(hold.expiresAt?.getTime()).toBe(began + 900000)
  }
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id })
    .orFail()
  expect(redemption.heldAt?.getTime()).toBe(began)
  expect(redemption.expiresAt?.getTime()).toBe(began + 900000)
  context.now = new Date(began + 300000)
  expect((await api.submit(who.credentials, submit(input, quote), 'synthetic-online')).id).toBe(
    result.id,
  )
  expect(
    (
      await couponModels(context.db.connection).redemptions.findById(redemption._id)
    )?.expiresAt?.getTime(),
  ).toBe(began + 900000)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(1)
  expect(await paymentModel(context.db.connection).findOne()).toMatchObject({
    method: 'online',
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.fulfillmentHold,
  ).toBe('payment_pending')
  expect(await context.db.connection.db?.collection('paymentAttempts').countDocuments()).toBe(0)
})

it('coordinated held release is retry-safe and a new generation gets a fresh shared 15-minute clock', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion =
      (await couponModels(context.db.connection).coupons.findOne({
        codeNormalized: 'SYNTHETIC',
      })) ?? (await coupon())
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  const result = await submissionService(quotes).submit(
    who.credentials,
    submit(input, quote),
    'generation-test',
  )
  const began = context.now.getTime()
  // Synthetic later lifecycle authority, kept out of production composition. The actual expiry/
  // payment/cancellation owner must authorize its own durable decisions in P06-010/P07/P06-013.
  const initial = initialOrderAllocationAccess(context.db.connection)
  const allocations = createOrderAllocationService(
    createAllocationService(
      context.db.connection,
      variantStockAccess(context.db.connection),
      () => context.now,
    ),
    {
      async authorize(session, orderId, generation, action) {
        if (orderId !== result.id || !['release_held', 'hold', 'commit'].includes(action))
          throw new Error('Synthetic decision denied')
        const binding = await initial.authorize(session, orderId, 1, 'hold')
        return { ...binding, generation }
      },
    },
    composeOrderAllocationDependencies(context.db.connection),
    () => context.now,
  )
  const run = (action: string, generation: number) =>
    inTransaction(context.db.connection, (session) =>
      allocations.apply(session, { orderId: result.id, generation, action }),
    )
  context.now = new Date(began + 900000)
  await run('release_held', 1)
  await run('release_held', 1)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ reserved: 0, committed: 0 })
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(0)
  context.now = new Date(began + 1200000)
  await run('hold', 2)
  const newest = await inventoryReservationModel(context.db.connection)
    .findOne({ orderId: result.id, generation: 2 })
    .orFail()
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id, generation: 2 })
    .orFail()
  expect(newest.heldAt?.getTime()).toBe(context.now.getTime())
  expect(newest.expiresAt?.getTime()).toBe(context.now.getTime() + 900000)
  expect(redemption.expiresAt).toEqual(newest.expiresAt)
  context.now = new Date(context.now.getTime() + 10000)
  await run('hold', 2)
  expect(
    (await inventoryReservationModel(context.db.connection).findById(newest._id))?.expiresAt,
  ).toEqual(newest.expiresAt)
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ orderId: result.id }),
  ).toBe(2)
  await run('commit', 2)
  await run('commit', 2)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 2 })
  expect(await couponModels(context.db.connection).coupons.findById(promotion._id)).toMatchObject({
    heldCount: 0,
    redeemedCount: 1,
  })
})

it('allocation authority and late coupon failure prevent partial release or unauthorized commitment', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon(),
    input = { ...body([selected.item]), couponCode: 'SYNTHETIC' },
    quote = await context.service.create(who.credentials, input)
  const result = await submissionService().submit(
    who.credentials,
    submit(input, quote),
    'release-rollback',
  )
  const initial = initialOrderAllocationAccess(context.db.connection),
    stock = createAllocationService(
      context.db.connection,
      variantStockAccess(context.db.connection),
      () => context.now,
    )
  const denied = createOrderAllocationService(
    stock,
    initial,
    composeOrderAllocationDependencies(context.db.connection),
    () => context.now,
  )
  await expect(
    inTransaction(context.db.connection, (session) =>
      denied.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
    ),
  ).rejects.toThrow()
  const synthetic = createOrderAllocationService(
    stock,
    {
      async authorize(session, orderId, generation, action) {
        if (action !== 'release_committed' || orderId !== result.id)
          throw new Error('Synthetic cancellation denied')
        return initial.authorize(session, orderId, generation, 'cod')
      },
    },
    composeOrderAllocationDependencies(context.db.connection),
    () => context.now,
  )
  await couponModels(context.db.connection).redemptions.collection.dropIndex(
    'coupon_order_generation_unique',
  )
  try {
    await expect(
      inTransaction(context.db.connection, (session) =>
        synthetic.apply(session, {
          orderId: result.id,
          generation: 1,
          action: 'release_committed',
        }),
      ),
    ).rejects.toThrow()
    expect(
      (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
        .committed,
    ).toBe(2)
    expect(
      (await couponModels(context.db.connection).coupons.findById(promotion._id))?.redeemedCount,
    ).toBe(1)
    expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(1)
  } finally {
    await initializeCouponPersistence(context.db.connection)
  }
  await inTransaction(context.db.connection, (session) =>
    synthetic.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
  )
  await inTransaction(context.db.connection, (session) =>
    synthetic.apply(session, { orderId: result.id, generation: 1, action: 'release_committed' }),
  )
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .committed,
  ).toBe(0)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.redeemedCount,
  ).toBe(0)
  expect(await inventoryMovementModel(context.db.connection).countDocuments()).toBe(2)
})

it('initial hold clocks equal actual order placement even when service calls advance the server clock', async () => {
  const who = await guest(),
    selected = await variant(),
    promotion = await coupon()
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  let tick = context.now.getTime()
  const advancing = () => new Date(tick++)
  const api = createCheckoutIntentService(
    context.db.connection,
    context.access,
    quotes,
    createCheckoutCompletionService(
      composeAuditAccess(context.db.connection),
      composeCheckoutCompletionDependencies(context.db.connection),
      advancing,
    ),
    composeCheckoutIntentDependencies(),
    advancing,
  )
  const result = await api.submit(who.credentials, submit(input, quote), 'placement-clock')
  const order = await orderModels(context.db.connection).orders.findById(result.id).orFail()
  const reservation = await inventoryReservationModel(context.db.connection)
    .findOne({ orderId: result.id })
    .orFail()
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id, couponId: promotion._id })
    .orFail()
  expect(reservation.heldAt).toEqual(order.placedAt)
  expect(redemption.heldAt).toEqual(order.placedAt)
  expect(reservation.expiresAt?.getTime()).toBe(order.placedAt.getTime() + 900000)
  expect(redemption.expiresAt).toEqual(reservation.expiresAt)
})

it('payment allocation preparation retains valid holds and never extends a generation on replay', async () => {
  const { result } = await heldOrder(),
    allocation = await paymentAllocations()
  const initial = await inTransaction(context.db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  context.now = new Date(context.now.getTime() + 1000)
  const replay = await inTransaction(context.db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  expect(replay).toEqual(initial)
  expect(initial.generation).toBe(1)
})

it('payment preparation atomically reacquires expired stock and coupon under one new 15-minute generation', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  context.now = new Date(context.now.getTime() + 900000)
  const result2 = await inTransaction(context.db.connection, (session) =>
    allocation.ensure(session, result.id),
  )
  expect(result2).toEqual({
    generation: 2,
    heldAt: context.now,
    expiresAt: new Date(context.now.getTime() + 900000),
  })
  expect(
    await inventoryReservationModel(context.db.connection).findOne({
      orderId: result.id,
      generation: 1,
    }),
  ).toMatchObject({ status: 'released' })
  expect(
    await couponModels(context.db.connection).redemptions.findOne({
      orderId: result.id,
      generation: 2,
    }),
  ).toMatchObject({ status: 'held', heldAt: context.now, expiresAt: result2.expiresAt })
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(1)
})

it('concurrent payment reacquisition/expiry retains exactly one active stock/coupon generation', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  context.now = new Date(context.now.getTime() + 900000)
  const [refreshed] = await Promise.all([
    Promise.all([
      inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
      inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
    ]),
    expiryJob().run(),
  ])
  expect(refreshed[0]).toEqual(refreshed[1])
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({
      orderId: result.id,
      activeKey: 'active',
    }),
  ).toBe(1)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(1)
})

it('a late coupon failure rolls back stock release/reacquisition and leaves the original snapshots untouched', async () => {
  const { result, selected, promotion } = await heldOrder(),
    allocation = await paymentAllocations()
  const original = (await orderModels(context.db.connection).orders.findById(result.id))
    ?.pricingSnapshot
  context.now = new Date(context.now.getTime() + 900000)
  await couponModels(context.db.connection).coupons.updateOne(
    { _id: promotion._id },
    { $set: { status: 'inactive' } },
  )
  await expect(
    inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
  ).rejects.toMatchObject({ code: 'COUPON_UNAVAILABLE' })
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({ orderId: result.id }),
  ).toBe(1)
  expect(
    (await inventoryReservationModel(context.db.connection).findOne({ orderId: result.id }))
      ?.status,
  ).toBe('held')
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.pricingSnapshot,
  ).toEqual(original)
})

it('unresolved attempts protect both stock/coupon capacity against payment reacquisition and shortfall writes', async () => {
  const { result } = await heldOrder(),
    allocation = await paymentAllocations()
  const payment = await paymentModel(context.db.connection).findOne({ orderId: result.id }).orFail()
  await paymentRecordModels(context.db.connection).attempts.create({
    orderId: new Types.ObjectId(result.id),
    paymentId: payment._id,
    provider: 'sslcommerz',
    tranId: 'synthetic-pending',
    expectedAmountPoisha: payment.expectedPoisha,
    initiatedOutstandingPoisha: payment.expectedPoisha,
    currency: 'BDT',
    state: 'uncertain',
    amountDisposition: 'not_checked',
  })
  context.now = new Date(context.now.getTime() + 900000)
  await expect(
    inTransaction(context.db.connection, (session) => allocation.ensure(session, result.id)),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  const orderAccess = paymentAllocationOrderAccess(
    context.db.connection,
    paymentInitiationEligibilityAccess(context.db.connection),
  )
  await expect(
    inTransaction(context.db.connection, (session) => orderAccess.shortfall(session, result.id)),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({
      orderId: result.id,
      status: 'held',
    }),
  ).toBe(1)
})

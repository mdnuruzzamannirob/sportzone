import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { createCheckoutExpiryService } from '../../../src/modules/checkout/checkout.service.js'
import {
  inventoryMovementModel,
  inventoryReservationModel,
} from '../../../src/modules/inventory/inventory.model.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { composeAuditAccess, composeCheckoutExpiryDependencies } from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  initializeJobLeases,
  jobLeaseModel,
  jobLeaseValidator,
} from '../../../src/shared/jobs/job-lease.model.js'
import { jobLeaseService } from '../../../src/shared/jobs/job-lease.service.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { expiryJob, heldOrder } from '../../helpers/commerce/checkout.js'
import { testEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('expires a whole unpaid generation at the exact boundary without cancelling its order/payment', async () => {
  const { result, selected, promotion } = await heldOrder(),
    started = context.now.getTime()
  context.now = new Date(started + 899999)
  expect((await expiryJob().run()).released).toBe(0)
  context.now = new Date(started + 900000)
  expect((await expiryJob().run()).released).toBe(1)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, reserved: 0, committed: 0 })
  expect(await couponModels(context.db.connection).coupons.findById(promotion._id)).toMatchObject({
    heldCount: 0,
    redeemedCount: 0,
  })
  expect(await paymentModel(context.db.connection).findOne({ orderId: result.id })).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect(
    (await orderModels(context.db.connection).orders.findById(result.id))?.fulfillmentStatus,
  ).toBe('pending')
  expect(
    await inventoryReservationModel(context.db.connection).countDocuments({
      orderId: result.id,
      status: 'released',
    }),
  ).toBe(1)
  expect(
    await context.db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'checkout.hold.expire' }),
  ).toBe(1)
})

it('concurrent expiry runners release capacity and record the event only once', async () => {
  const { result } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  const outcomes = await Promise.all([expiryJob().run(), expiryJob().run(), expiryJob().run()])
  expect(outcomes.reduce((sum, item) => sum + item.released, 0)).toBe(1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({
      orderId: result.id,
      type: 'release_hold',
    }),
  ).toBe(1)
})

it('expiry retains verified-funded and risk-held capacity for reconciliation', async () => {
  const { result, selected } = await heldOrder()
  const payment = await paymentModel(context.db.connection).findOne({ orderId: result.id }).orFail()
  await paymentModel(context.db.connection).updateOne(
    { _id: payment._id },
    {
      $set: {
        paymentStatus: 'paid',
        verifiedCollectedPoisha: payment.expectedPoisha,
        merchandiseFundedPoisha: payment.expectedPoisha,
      },
      $inc: { revision: 1 },
    },
  )
  context.now = new Date(context.now.getTime() + 900000)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
})

it('rolls back every expiry effect on audit failure, then resumes safely after restart', async () => {
  const { result, selected, promotion } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  await context.db.connection.db?.collection('auditLogs').dropIndex('audit_target_time')
  try {
    await expect(expiryJob().run()).rejects.toThrow()
    expect(
      (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
        .reserved,
    ).toBe(2)
    expect(
      (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
    ).toBe(1)
    expect(
      (await inventoryReservationModel(context.db.connection).findOne({ orderId: result.id }))
        ?.status,
    ).toBe('held')
    expect(
      await jobLeaseModel(context.db.connection).findOne({ jobKey: 'reservation-expiry' }),
    ).toMatchObject({ failureCount: 1, lastErrorCode: 'JOB_FAILED' })
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect((await expiryJob().run()).released).toBe(1)
})

it('rejects mixed stock/coupon clocks instead of partially releasing a generation', async () => {
  const { result, selected } = await heldOrder()
  const redemption = await couponModels(context.db.connection)
    .redemptions.findOne({ orderId: result.id })
    .orFail()
  await couponModels(context.db.connection).redemptions.updateOne(
    { _id: redemption._id },
    {
      $set: {
        heldAt: new Date(context.now.getTime() + 1),
        expiresAt: new Date(context.now.getTime() + 900001),
      },
    },
  )
  context.now = new Date(context.now.getTime() + 900001)
  expect((await expiryJob().run()).released).toBe(0)
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
})

it('durable cursor moves past protected holds without starving eligible later orders', async () => {
  const first = await heldOrder(),
    second = await heldOrder()
  await paymentModel(context.db.connection).updateOne(
    { orderId: first.result.id },
    { $set: { riskStatus: 'review' } },
  )
  context.now = new Date(context.now.getTime() + 900000)
  expect((await expiryJob(1).run()).released).toBe(0)
  expect((await expiryJob(1).run()).released).toBe(1)
  expect(
    (await inventoryReservationModel(context.db.connection).findOne({ orderId: second.result.id }))
      ?.status,
  ).toBe('released')
  expect(
    (await inventoryReservationModel(context.db.connection).findOne({ orderId: first.result.id }))
      ?.status,
  ).toBe('held')
})

it('expired lease owners cannot mutate or checkpoint after a new runner takes ownership', async () => {
  const { result } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  const leases = jobLeaseService(
      context.db.connection,
      'reservation-expiry',
      1000,
      () => context.now,
    ),
    old = await leases.acquire()
  if (!old) throw new Error('Missing synthetic lease')
  context.now = new Date(context.now.getTime() + 1000)
  expect((await expiryJob().run()).released).toBe(1)
  await expect(
    inTransaction(context.db.connection, async (session) => {
      await leases.fence(session, old.owner)
      await createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, result.id, 1)
    }),
  ).rejects.toThrow()
  await expect(leases.finish(old.owner)).rejects.toThrow()
})

it('compiled expiry entry requires explicit options and runs bounded work without exposing identifiers', async () => {
  const env = {
    ...testEnvironment(),
    MONGODB_URI: context.db.replica.getUri(),
    MONGODB_DB_NAME: context.db.connection.name,
    RESERVATION_EXPIRY_BATCH_SIZE: '10',
    RESERVATION_EXPIRY_LEASE_MS: '30000',
  }
  const result = spawnSync(process.execPath, ['scripts/expire-reservations.mjs'], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    action: 'reservation_expiry',
    acquired: true,
    scanned: 0,
  })
  const missing = spawnSync(process.execPath, ['scripts/expire-reservations.mjs'], {
    env: { ...env, RESERVATION_EXPIRY_LEASE_MS: '' },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(missing.status).toBe(1)
  expect(missing.stderr).not.toContain(env.MONGODB_URI)
})

it('concurrent funding and expiry preserve money status and cannot double-release stock/coupon capacity', async () => {
  const { result, selected, promotion } = await heldOrder(),
    model = paymentModel(context.db.connection),
    payment = await model.findOne({ orderId: result.id }).orFail()
  context.now = new Date(context.now.getTime() + 900000)
  // Synthetic verified-receipt application updates the same canonical aggregate fence. It does
  // not claim a live provider or late-payment stock reacquisition implementation.
  await Promise.all([
    expiryJob().run(),
    inTransaction(context.db.connection, async (session) => {
      await model.updateOne(
        { _id: payment._id },
        {
          $set: {
            paymentStatus: 'paid',
            verifiedCollectedPoisha: payment.expectedPoisha,
            merchandiseFundedPoisha: payment.expectedPoisha,
          },
          $inc: { revision: 1 },
        },
        { session },
      )
    }),
  ])
  expect((await model.findById(payment._id))?.paymentStatus).toBe('paid')
  const stock = (await productModels(context.db.connection).variants.findById(selected.row._id))
    ?.stock
  expect([0, 2]).toContain(stock?.reserved)
  expect(stock?.committed).toBe(0)
  expect(
    (await couponModels(context.db.connection).coupons.findById(promotion._id))?.heldCount,
  ).toBe(stock?.reserved === 0 ? 0 : 1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({
      orderId: result.id,
      type: 'release_hold',
    }),
  ).toBeLessThanOrEqual(1)
})

it('lease loss after domain writes rolls back those writes before any stale owner can commit', async () => {
  const { result, selected } = await heldOrder()
  context.now = new Date(context.now.getTime() + 900000)
  const leases = jobLeaseService(
      context.db.connection,
      'reservation-expiry',
      1000,
      () => context.now,
    ),
    claim = await leases.acquire()
  if (!claim) throw new Error('Missing synthetic claim')
  await expect(
    inTransaction(context.db.connection, async (session) => {
      await leases.fence(session, claim.owner)
      await createCheckoutExpiryService(
        composeAuditAccess(context.db.connection),
        composeCheckoutExpiryDependencies(context.db.connection),
        () => context.now,
      ).expire(session, result.id, 1)
      context.now = new Date(context.now.getTime() + 1000)
      await leases.fence(session, claim.owner)
    }),
  ).rejects.toThrow()
  expect(
    (await productModels(context.db.connection).variants.findById(selected.row._id))?.stock
      .reserved,
  ).toBe(2)
  expect(
    await context.db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ action: 'checkout.hold.expire' }),
  ).toBe(0)
  expect((await expiryJob().run()).released).toBe(1)
})

it('job registry rejects TTL or validator drift rather than silently rewriting durable history', async () => {
  await jobLeaseModel(context.db.connection).collection.createIndex(
    { lastSucceededAt: 1 },
    { expireAfterSeconds: 0, name: 'synthetic_job_ttl' },
  )
  try {
    await expect(expiryJob().run()).rejects.toThrow('TTL')
    await expect(initializeJobLeases(context.db.connection)).rejects.toThrow('TTL')
  } finally {
    await jobLeaseModel(context.db.connection).collection.dropIndex('synthetic_job_ttl')
  }
  await context.db.connection.db?.command({ collMod: 'jobLeases', validator: {} })
  try {
    await expect(expiryJob().run()).rejects.toThrow('reviewed provisioning')
    await expect(initializeJobLeases(context.db.connection)).rejects.toThrow(
      'reviewed provisioning',
    )
  } finally {
    await context.db.connection.db?.command({ collMod: 'jobLeases', validator: jobLeaseValidator })
  }
})

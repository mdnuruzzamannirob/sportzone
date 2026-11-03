import { spawnSync } from 'node:child_process'
import request from 'supertest'
import { expect, it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { paymentReconciliationJob } from '../../../src/jobs/reconcile-payments.job.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { verifiedFundingOrderAccess } from '../../../src/modules/orders/order.service.js'
import { createVerifiedAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createPaymentProcessingService } from '../../../src/modules/payments/collections/payment-processing.service.js'
import { createPaymentReconciliationService } from '../../../src/modules/payments/collections/payment-reconciliation.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composePaymentOutcomeDependencies,
  composePaymentReconciliationDependencies,
} from '../../../src/setup.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { initiationApp } from '../../helpers/commerce/checkout.js'
import {
  processingFixture,
  reconcileOptions,
  reconciliation,
} from '../../helpers/commerce/payments.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('multi/reconcile batch: independently paid overlapping attempts preserve both sources, one merchandise allocation and one correction obligation', async () => {
  const f = await processingFixture(true)
  f.change({ status: 'FAILED' })
  const { validationId: _unused, ...queryClaim } = f.claim
  expect(await f.processor().process(queryClaim)).toBe('committed')
  const { root } = await initiationApp(true, undefined, false, f.gateway)
  const response = await request(root)
    .post(`/api/v1/orders/${f.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', f.who.cookie)
    .set('X-CSRF-Token', f.who.csrf)
    .set('Idempotency-Key', 'second-attempt')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  const second = await paymentRecordModels(context.db.connection)
    .attempts.findById(response.body.data.attemptId)
    .orFail()
  f.change({ status: 'VALIDATED' })
  const firstProof = await f.verifier.verify(f.claim)
  f.change({
    tran_id: second.tranId,
    val_id: 'second-attempt-validation',
    bank_tran_id: 'second-attempt-bank',
  })
  const secondProof = await f.verifier.verify({
    ...f.claim,
    tranId: second.tranId,
    validationId: 'second-attempt-validation',
  })
  const process = (proof: typeof firstProof) =>
    createPaymentProcessingService(
      context.db.connection,
      { verify: async () => proof },
      verifiedFundingOrderAccess(context.db.connection),
      createVerifiedAllocationService(
        composeAuditAccess(context.db.connection),
        composeAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composePaymentOutcomeDependencies(context.db.connection),
      () => context.now,
    ).process(f.claim)
  expect(await Promise.all([process(firstProof), process(secondProof)])).toEqual([
    'committed',
    'committed',
  ])
  expect(
    await paymentRecordModels(context.db.connection).attempts.countDocuments({
      state: 'verified_paid',
    }),
  ).toBe(2)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(2)
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
    merchandiseFundedPoisha: f.attempt.expectedAmountPoisha,
    correctionCollectedPoisha: f.attempt.expectedAmountPoisha,
    merchandiseRefundHeldPoisha: 0,
    correctionRefundHeldPoisha: 0,
  })
  expect(
    await context.db.connection
      .collection('refunds')
      .countDocuments({ classification: 'payment_correction' }),
  ).toBe(1)
  expect(
    await couponModels(context.db.connection)
      .coupons.findOne({ codeNormalized: 'SYNTHETIC' })
      .lean(),
  ).toMatchObject({ redeemedCount: 1, heldCount: 0 })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
  expect(await process(firstProof)).toBe('committed')
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(1)
})

it('multi/reconcile batch: missing IPN is recovered by the merchant query with durable scheduling and repeat/restart safety', async () => {
  const f = await processingFixture(true)
  context.now = new Date(context.now.getTime() + 1001)
  expect(await reconciliation(f).job.run()).toMatchObject({
    acquired: true,
    scanned: 1,
    resolved: 1,
  })
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
  expect(await reconciliation(f).job.run()).toMatchObject({ scanned: 0 })
  context.now = new Date(context.now.getTime() + 5001)
  expect(await reconciliation(f).job.run()).toMatchObject({ scanned: 1, resolved: 1 })
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('multi/reconcile batch: provider timeouts remain uncertain and bounded retries escalate once without fabricating failure', async () => {
  const f = await processingFixture()
  context.now = new Date(context.now.getTime() + 1001)
  f.transport.mockRejectedValue(new Error('private timeout detail'))
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 0 })
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'uncertain' })
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'pending',
  })
  expect(await reconciliation(f).job.run()).toMatchObject({ scanned: 0 })
  context.now = new Date(context.now.getTime() + 6000)
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 1 })
  context.now = new Date(context.now.getTime() + 1001)
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 0 })
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.escalated' }),
  ).toBe(1)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(0)
})

it('multi/reconcile batch: competing job instances and IPN apply the independently verified collection once', async () => {
  const f = await processingFixture()
  context.now = new Date(context.now.getTime() + 1001)
  const results = await Promise.all([
    reconciliation(f).job.run(),
    reconciliation(f).job.run(),
    f.processor().process(f.claim),
  ])
  expect(results[2]).toBe('committed')
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 0, committed: 2 } })
})

it('multi/reconcile batch: expired runner cannot commit a provider result or checkpoint after lease takeover', async () => {
  const f = await processingFixture()
  context.now = new Date(context.now.getTime() + 1001)
  let release!: () => void, started!: () => void
  const barrier = new Promise<void>((resolve) => {
      release = resolve
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve
    })
  const actual = f.transport.getMockImplementation()
  if (!actual) throw new Error('Missing synthetic transport')
  let first = true
  f.transport.mockImplementation(async (...args) => {
    if (first) {
      first = false
      started()
      await barrier
    }
    return actual(...args)
  })
  const old = reconciliation(f).job.run()
  const oldResult = old.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await ready
  context.now = new Date(context.now.getTime() + 30001)
  expect(await reconciliation(f).job.run()).toMatchObject({ acquired: true, resolved: 1 })
  release()
  expect(await oldResult).toHaveProperty('error')
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
})

it('multi/reconcile batch: a crash after durable collection before scheduling checkpoint replays safely on restart', async () => {
  const f = await processingFixture()
  context.now = new Date(context.now.getTime() + 1001)
  const original = reconciliation(f)
  const failing = paymentReconciliationJob(
    context.db.connection,
    {
      ...original.domain,
      reconcile: async (id, fence) => {
        await original.domain.reconcile(id, fence)
        throw new Error('synthetic-after-commit')
      },
    },
    reconcileOptions,
    () => context.now,
  )
  await expect(failing.run()).rejects.toThrow('synthetic-after-commit')
  context.now = new Date(context.now.getTime() + 5001)
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
})

it('multi/reconcile batch: a later provider recovery resolves an escalation without replaying collection', async () => {
  const f = await processingFixture(),
    actual = f.transport.getMockImplementation()
  if (!actual) throw new Error('Missing synthetic transport')
  context.now = new Date(context.now.getTime() + 6000)
  f.transport.mockRejectedValue(new Error('synthetic-timeout'))
  expect(await reconciliation(f).job.run()).toMatchObject({ unresolved: 1, escalated: 1 })
  f.transport.mockImplementation(actual)
  context.now = new Date(context.now.getTime() + 1001)
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.resolved' }),
  ).toBe(1)
  context.now = new Date(context.now.getTime() + 5001)
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'payment.reconcile.resolved' }),
  ).toBe(1)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
})

it('multi/reconcile batch: timing out while revisiting Paid preserves its proof and reports unresolved verification', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  context.now = new Date(context.now.getTime() + 6000)
  f.transport.mockRejectedValue(new Error('synthetic-later-timeout'))
  expect(await reconciliation(f).job.run()).toMatchObject({
    resolved: 0,
    unresolved: 1,
    escalated: 1,
  })
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'verified_paid' })
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
  })
})

it('multi/reconcile batch: merchant rotation cannot query or change an old account attempt', async () => {
  const f = await processingFixture()
  context.now = new Date(context.now.getTime() + 1001)
  const domain = createPaymentReconciliationService(
    context.db.connection,
    f.processor(),
    'f'.repeat(64),
    reconcileOptions,
    composeAuditAccess(context.db.connection),
    composePaymentReconciliationDependencies(context.db.connection),
    () => context.now,
  )
  expect(
    await paymentReconciliationJob(
      context.db.connection,
      domain,
      reconcileOptions,
      () => context.now,
    ).run(),
  ).toMatchObject({ scanned: 1, skipped: 1 })
  expect(f.transport).not.toHaveBeenCalled()
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(f.attempt._id).lean(),
  ).toMatchObject({ state: 'initiated' })
})

it('multi/reconcile batch: persistent cursor advances past unresolved records and wraps without starving later attempts', async () => {
  const first = await processingFixture(),
    second = await processingFixture()
  first.transport.mockRejectedValue(new Error('synthetic-unavailable'))
  context.now = new Date(context.now.getTime() + 1001)
  const options = { ...reconcileOptions, batchSize: 1 }
  expect(await reconciliation(first, options).job.run()).toMatchObject({
    scanned: 1,
    unresolved: 1,
  })
  expect(await reconciliation(first, options).job.run()).toMatchObject({
    scanned: 1,
    unresolved: 1,
  })
  expect(
    await paymentRecordModels(context.db.connection).attempts.findById(second.attempt._id).lean(),
  ).toMatchObject({ state: 'uncertain' })
  expect(await reconciliation(first, options).job.run()).toMatchObject({ scanned: 0 })
  context.now = new Date(context.now.getTime() + 1001)
  expect(await reconciliation(first, options).job.run()).toMatchObject({ scanned: 1 })
})

it('multi/reconcile batch: compiled worker requires explicit local/test policy, emits only counts and refuses deployed execution', async () => {
  const f = await processingFixture()
  const env = {
    ...identityEnvironment(),
    MONGODB_URI: context.db.replica.getUri(),
    MONGODB_DB_NAME: context.db.connection.name,
    PAYMENT_RECONCILIATION_ENABLED: 'true',
    PAYMENT_RECONCILIATION_BATCH_SIZE: '10',
    PAYMENT_RECONCILIATION_LEASE_MS: '30000',
    PAYMENT_RECONCILIATION_POLL_MS: '86400000',
    PAYMENT_RECONCILIATION_TERMINAL_POLL_MS: '86400000',
    PAYMENT_RECONCILIATION_ESCALATE_AFTER_MS: '86400000',
    SSLCOMMERZ_ADAPTER_ENABLED: 'true',
    SSLCOMMERZ_MODE: 'sandbox',
    SSLCOMMERZ_STORE_ID: 'synthetic-store',
    SSLCOMMERZ_STORE_PASSWORD: 'synthetic-password',
    SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test',
    SSLCOMMERZ_TIMEOUT_MS: '1000',
  }
  const hook =
    'globalThis.fetch = () => { throw new Error("Provider network forbidden in fixture") };'
  const run = (change: NodeJS.ProcessEnv = {}) =>
    spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(hook)}`,
        'scripts/reconcile-payments.mjs',
      ],
      { env: { ...env, ...change }, encoding: 'utf8', timeout: 15000 },
    )
  const result = run()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ action: 'payment_reconciliation', scanned: 0 })
  expect(result.stdout).not.toContain(f.attempt.tranId)
  expect(result.stdout).not.toContain(env.SSLCOMMERZ_STORE_PASSWORD)
  expect(run({ PAYMENT_RECONCILIATION_ENABLED: 'false' }).status).toBe(1)
  expect(run({ PAYMENT_RECONCILIATION_POLL_MS: '' }).status).toBe(1)
  const deployed = { ...env, APP_ENV: 'production', NODE_ENV: 'production' }
  expect(loadEnvironment(deployed).APP_ENV).toBe('production')
  expect(run(deployed).status).toBe(1)
})

it('multi/reconcile batch: lease expiry after allocation writes aborts receipt, money and stock before an old runner can commit', async () => {
  const f = await processingFixture(true)
  context.now = new Date(context.now.getTime() + 1001)
  const allocation = createVerifiedAllocationService(
    composeAuditAccess(context.db.connection),
    composeAllocationDependencies(context.db.connection),
    () => context.now,
  )
  const expiring = createPaymentProcessingService(
    context.db.connection,
    f.verifier,
    verifiedFundingOrderAccess(context.db.connection),
    {
      ...allocation,
      commitLive: async (session, binding) => {
        const result = await allocation.commitLive(session, binding)
        context.now = new Date(context.now.getTime() + 30001)
        return result
      },
    },
    composeAuditAccess(context.db.connection),
    composePaymentOutcomeDependencies(context.db.connection),
    () => context.now,
  )
  const domain = createPaymentReconciliationService(
    context.db.connection,
    expiring,
    f.claim.merchantAccountKey,
    reconcileOptions,
    composeAuditAccess(context.db.connection),
    composePaymentReconciliationDependencies(context.db.connection),
    () => context.now,
  )
  await expect(
    paymentReconciliationJob(
      context.db.connection,
      domain,
      reconcileOptions,
      () => context.now,
    ).run(),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(0)
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'pending',
  })
  expect(
    await productModels(context.db.connection).variants.findById(f.selected.row._id).lean(),
  ).toMatchObject({ stock: { reserved: 2, committed: 0 } })
  expect(await reconciliation(f).job.run()).toMatchObject({ resolved: 1 })
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
})

it('multi/reconcile batch: a Paid attempt with new quarantined money remains an unresolved admin investigation', async () => {
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  context.now = new Date(context.now.getTime() + 6000)
  f.change({
    amount: '99.00',
    currency_amount: '99.00',
    val_id: 'quarantine-validation',
    bank_tran_id: 'quarantine-bank',
  })
  expect(await reconciliation(f).job.run()).toMatchObject({
    unresolved: 1,
    resolved: 0,
    escalated: 1,
  })
  expect(await paymentRecordModels(context.db.connection).intake.countDocuments()).toBe(2)
  expect(await paymentRecordModels(context.db.connection).collections.countDocuments()).toBe(1)
  expect(
    await paymentModel(context.db.connection).findById(f.attempt.paymentId).lean(),
  ).toMatchObject({
    paymentStatus: 'paid',
    verifiedCollectedPoisha: f.attempt.expectedAmountPoisha,
  })
})

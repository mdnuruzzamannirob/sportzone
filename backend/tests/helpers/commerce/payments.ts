import { createHash } from 'node:crypto'
import request from 'supertest'
import { expect, vi } from 'vitest'
import { paymentReconciliationJob } from '../../../src/jobs/reconcile-payments.job.js'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import type { EmailAdapter } from '../../../src/modules/notifications/notification.types.js'
import { createNotificationDeliveryService } from '../../../src/modules/notifications/notification-delivery.service.js'
import { createPaymentMessageService } from '../../../src/modules/notifications/notification-template.js'
import { verifiedFundingOrderAccess } from '../../../src/modules/orders/order.service.js'
import { createVerifiedAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import {
  createPaymentMatchingService,
  type PaymentMatchingAuthority,
} from '../../../src/modules/payments/collections/payment-matching.service.js'
import { createPaymentMonitorService } from '../../../src/modules/payments/collections/payment-monitor.service.js'
import { paymentNotificationAccess } from '../../../src/modules/payments/collections/payment-notification.service.js'
import { createPaymentProcessingService } from '../../../src/modules/payments/collections/payment-processing.service.js'
import { createPaymentReconciliationService } from '../../../src/modules/payments/collections/payment-reconciliation.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { createPaymentRiskService } from '../../../src/modules/payments/collections/payment-risk.service.js'
import { createPaymentSettlementService } from '../../../src/modules/payments/collections/payment-settlement.service.js'
import { createPaymentVerificationService } from '../../../src/modules/payments/collections/payment-verification.service.js'
import {
  createPaymentMatchingRoutes,
  createPaymentMonitorRoutes,
  createPaymentRiskRoutes,
} from '../../../src/modules/payments/payment.routes.js'
import { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composePaymentMatchingDependencies,
  composePaymentMonitorDependencies,
  composePaymentOutcomeDependencies,
  composePaymentReconciliationDependencies,
} from '../../../src/setup.js'
import { sessionHttpFor } from '../auth.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { context, customer, type variant } from './base.js'
import { customerHeldOrder, initiationApp } from './checkout.js'

async function processingFixture(
  withCoupon = false,
  existingVariant?: Awaited<ReturnType<typeof variant>>,
  prepaid = false,
) {
  const held = await customerHeldOrder(withCoupon, existingVariant, prepaid),
    { root } = await initiationApp()
  await request(root)
    .post(`/api/v1/orders/${held.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', held.who.cookie)
    .set('X-CSRF-Token', held.who.csrf)
    .set('Idempotency-Key', 'processing-fixture')
    .send({ requestedChannel: 'bkash' })
    .expect(200)
  const attempt = await paymentRecordModels(context.db.connection)
    .attempts.findOne({ orderId: held.result.id })
    .orFail()
  const merchant = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
  const decimal = (amount: number) =>
    `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
  let provider = {
    status: 'VALIDATED',
    tran_id: attempt.tranId,
    val_id: 'processing-validation',
    bank_tran_id: 'processing-bank',
    amount: decimal(attempt.expectedAmountPoisha),
    currency: 'BDT',
    currency_type: 'BDT',
    currency_amount: decimal(attempt.expectedAmountPoisha),
    tran_date: new Date(context.now.getTime() - 1000).toISOString(),
    risk_level: '0',
    risk_title: 'Safe',
  }
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      new URL(String(url)).pathname.endsWith('validationserverAPI.php')
        ? Response.json(provider)
        : Response.json({ APIConnect: 'DONE', no_of_trans_found: 1, element: [provider] }),
    )
  const gateway = createSslcommerzAdapter(
    {
      appEnv: 'test',
      mode: 'sandbox',
      storeId: 'synthetic-store',
      storePassword: 'synthetic-password',
      callbackOrigin: 'https://api.example.test',
      timeoutMs: 1000,
    },
    transport,
  )
  const verifier = createPaymentVerificationService(context.db.connection, gateway, merchant)
  const processor = () =>
    createPaymentProcessingService(
      context.db.connection,
      verifier,
      verifiedFundingOrderAccess(context.db.connection),
      createVerifiedAllocationService(
        composeAuditAccess(context.db.connection),
        composeAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composePaymentOutcomeDependencies(context.db.connection),
      () => context.now,
    )
  const claim = {
    merchantAccountKey: merchant,
    tranId: attempt.tranId,
    claimedStatus: 'VALID',
    validationId: provider.val_id,
  }
  return {
    ...held,
    processor,
    verifier,
    gateway,
    claim,
    transport,
    attempt,
    change: (value: Partial<typeof provider>) => {
      provider = { ...provider, ...value }
    },
  }
}

async function lateRiskFixture(initialRisk = '1') {
  const f = await processingFixture(true)
  f.change({ risk_level: initialRisk })
  expect(await f.processor().process(f.claim)).toBe('committed')
  const orderAccess = verifiedFundingOrderAccess(context.db.connection)
  const settlement = createPaymentSettlementService(
    context.db.connection,
    orderAccess,
    createVerifiedAllocationService(
      composeAuditAccess(context.db.connection),
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    composeAuditAccess(context.db.connection),
    () => context.now,
  )
  const risk = createPaymentRiskService(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    orderAccess,
    settlement,
    composeAuditAccess(context.db.connection),
    () => context.now,
  )
  const riskApp = createApp({
    apiRouter: createPaymentRiskRoutes(risk, context.security, sessionHttpFor(context.sessions)),
  })
  const admin = await customer('admin')
  const paymentId = f.attempt.paymentId.toHexString()
  const post = (
    data = { decision: 'approve', reason: 'Synthetic independent review' },
    key = 'risk-review',
  ) =>
    request(riskApp)
      .post(`/api/v1/admin/payments/${paymentId}/risk-decisions`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(data)
  return { ...f, risk, riskApp, admin, paymentId, post }
}

const reconcileOptions = {
  batchSize: 10,
  leaseMs: 30000,
  pollIntervalMs: 1000,
  terminalPollIntervalMs: 5000,
  escalateAfterMs: 5000,
}

function reconciliation(
  f: Awaited<ReturnType<typeof processingFixture>>,
  options = reconcileOptions,
) {
  const domain = createPaymentReconciliationService(
    context.db.connection,
    f.processor(),
    f.claim.merchantAccountKey,
    options,
    composeAuditAccess(context.db.connection),
    composePaymentReconciliationDependencies(context.db.connection),
    () => context.now,
  )
  return {
    domain,
    job: paymentReconciliationJob(context.db.connection, domain, options, () => context.now),
  }
}

const retryPost = (
  root: ReturnType<typeof createApp>,
  f: Awaited<ReturnType<typeof processingFixture>>,
  key: string,
) =>
  request(root)
    .post(`/api/v1/orders/${f.result.id}/payment-attempts`)
    .set('Origin', 'https://shop.example.test')
    .set('Cookie', f.who.cookie)
    .set('X-CSRF-Token', f.who.csrf)
    .set('Idempotency-Key', key)
    .send({ requestedChannel: 'bkash' })

function paymentDelivery(adapter: EmailAdapter) {
  const store = createNotificationService(context.db.connection, () => context.now)
  return createNotificationDeliveryService(
    store,
    adapter,
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 10 },
    () => context.now,
    undefined,
    undefined,
    undefined,
    undefined,
    createPaymentMessageService(
      paymentNotificationAccess(
        context.db.connection,
        verifiedFundingOrderAccess(context.db.connection).notificationTarget,
      ),
    ),
  )
}

async function monitorFixture() {
  const f = await processingFixture(),
    admin = await customer('admin')
  const service = createPaymentMonitorService(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    composeAuditAccess(context.db.connection),
    composePaymentMonitorDependencies(context.db.connection),
  )
  const monitorApp = createApp({
    apiRouter: createPaymentMonitorRoutes(
      service,
      context.security,
      sessionHttpFor(context.sessions),
    ),
  })
  const paymentId = f.attempt.paymentId.toHexString(),
    path = `/api/v1/admin/payments/${paymentId}`
  const get = (suffix = '') =>
    request(monitorApp).get(`${path}${suffix}`).set('Cookie', admin.cookie)
  const reconcile = (
    body: object = { reason: 'Investigate missing IPN' },
    key = 'manual-reconcile',
  ) =>
    request(monitorApp)
      .post(`${path}/reconcile`)
      .set('Cookie', admin.cookie)
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(body)
  return { ...f, admin, service, monitorApp, paymentId, path, get, reconcile }
}

async function matchingFixture() {
  const f = await monitorFixture()
  f.change({ amount: '1.00', currency_amount: '1.00' })
  await f.processor().process(f.claim)
  const receipt = await paymentRecordModels(context.db.connection).intake.findOne().orFail()
  const link = {
    orderId: f.result.id,
    attemptId: f.attempt._id.toHexString(),
    reason: 'Synthetic independently reviewed settled source',
    matchingEvidenceRef: 'synthetic:matching-case',
  }
  return { ...f, receipt, link }
}

function matchingRoot(verify?: PaymentMatchingAuthority) {
  return createApp({
    apiRouter: createPaymentMatchingRoutes(
      createPaymentMatchingService(
        context.db.connection,
        createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
        verifiedFundingOrderAccess(context.db.connection),
        createVerifiedAllocationService(
          composeAuditAccess(context.db.connection),
          composeAllocationDependencies(context.db.connection),
          () => context.now,
        ),
        composeAuditAccess(context.db.connection),
        composePaymentMatchingDependencies(context.db.connection),
        verify,
        () => context.now,
      ),
      context.security,
      sessionHttpFor(context.sessions),
    ),
  })
}

function matchPost(
  root: ReturnType<typeof createApp>,
  who: Awaited<ReturnType<typeof customer>>,
  path: string,
  body: object,
  key: string,
  revision?: string,
) {
  const req = request(root)
    .post(`/api/v1${path}`)
    .set('Cookie', who.cookie)
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', key)
  if (revision !== undefined) req.set('If-Match', revision)
  return req.send(body)
}

export {
  lateRiskFixture,
  matchPost,
  matchingFixture,
  matchingRoot,
  monitorFixture,
  paymentDelivery,
  processingFixture,
  reconcileOptions,
  reconciliation,
  retryPost,
}

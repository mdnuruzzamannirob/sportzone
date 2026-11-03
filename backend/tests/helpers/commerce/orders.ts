import { createHash } from 'node:crypto'
import request from 'supertest'
import { vi } from 'vitest'
import {
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { sessionCookies } from '../../../src/modules/auth/auth.composition.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import { orderPolicySnapshotAccess } from '../../../src/modules/checkout/checkout.service.js'
import { initializeCancellationPersistence } from '../../../src/modules/orders/cancellation.persistence.js'
import { createCancellationService } from '../../../src/modules/orders/cancellation.service.js'
import { createOrderReadRoutes } from '../../../src/modules/orders/order.routes.js'
import {
  cancellationRefundSnapshotAccess,
  codCollectionOrderAccess,
  refundUnitReservationAccess,
} from '../../../src/modules/orders/order.service.js'
import {
  createCancellationAllocationService,
  createFulfillmentAllocationService,
} from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { createOrderReadService } from '../../../src/modules/orders/order-read.service.js'
import { paymentEligibility } from '../../../src/modules/payments/attempts/payment-eligibility.service.js'
import { createCodCollectionService } from '../../../src/modules/payments/collections/cod-collection.service.js'
import { initializePaymentRecordPersistence } from '../../../src/modules/payments/collections/payment-record.persistence.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import {
  cancellationPaymentAccess,
  customerPaymentSummaryAccess,
  fulfillmentPaymentAccess,
  refundFundingAccess,
} from '../../../src/modules/payments/payment.service.js'
import { createCancellationRefundService } from '../../../src/modules/refunds/obligations/cancellation-refund.service.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { createApiRouter } from '../../../src/routes.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composeCancellationDependencies,
  composeCodCollectionDependencies,
  composeFulfillmentAllocationDependencies,
  composeOrderLifecycleDependencies,
  composeOrderOperationsRoutes,
  composeOrderReadDependencies,
  composePaymentEligibilityDependencies,
} from '../../../src/setup.js'
import { ApiError } from '../../../src/shared/errors/app-error.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { body, context, customer, guest, makeService, origin, submit, variant } from './base.js'
import { placeCod, submissionService } from './checkout.js'
import { localReviewAuth } from './reviews.js'

async function lifecycleFixture(approved = true, registered = false) {
  await initializePaymentRecordPersistence(context.db.connection)
  await initializeCorrectionPersistence(context.db.connection)
  const who = registered ? await customer() : await guest(),
    selected = await variant(),
    input = body([selected.item]),
    quote = await context.service.create(who.credentials, input)
  const placed = await placeCod(who, submit(input, quote)).expect(201),
    id = placed.body.data.order.id
  const payment = await paymentModel(context.db.connection).findOne({ orderId: id }).orFail(),
    admin = await customer('admin'),
    adminAccess = createAdminAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    )
  const lifecycle = createOrderLifecycleService(
    context.db.connection,
    adminAccess,
    fulfillmentPaymentAccess(context.db.connection),
    createFulfillmentAllocationService(
      composeFulfillmentAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    composeAuditAccess(context.db.connection),
    composeOrderLifecycleDependencies(context.db.connection),
    approved ? async () => {} : undefined,
    () => context.now,
  )
  const token = admin.credentials.customerToken
  const move = (to: string, key = to) =>
    lifecycle.transition(
      token,
      id,
      {
        to,
        reason: 'Synthetic lifecycle review',
        ...(to === 'shipped'
          ? { dispatchReference: 'synthetic-dispatch', carrierLabel: 'Store delivery' }
          : {}),
      },
      key,
    )
  const collectedAt = new Date(context.now)
  const proof = (data: {
    paymentId: string
    amountPoisha: number
    collectionReference: string
    evidenceRef: string
  }) => ({
    paymentId: data.paymentId,
    amountPoisha: data.amountPoisha,
    collectionReference: data.collectionReference,
    evidenceRef: data.evidenceRef,
    collectedAt,
    digest: createHash('sha256')
      .update(`${data.paymentId}:${data.collectionReference}:${data.amountPoisha}`)
      .digest('hex'),
  })
  const receipt = createCodCollectionService(
    context.db.connection,
    adminAccess,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (data) => proof(data),
    () => context.now,
  )
  const cash = (amount = payment.expectedPoisha, ref = 'cash-receipt-1', key = ref) =>
    receipt.collect(
      token,
      payment._id.toHexString(),
      {
        amountPoisha: amount,
        collectionReference: ref,
        evidenceRef: 'synthetic:private-cash-evidence',
        reason: 'Synthetic verified cash',
      },
      key,
    )
  return {
    who,
    selected,
    id,
    payment,
    admin,
    adminAccess,
    token,
    lifecycle,
    move,
    receipt,
    cash,
    proof,
  }
}

async function cancellationReadFixture(online = false) {
  await initializeCancellationPersistence(context.db.connection)
  await initializePaymentRecordPersistence(context.db.connection)
  const who = await customer(),
    selected = await variant(),
    input = { ...body([selected.item]), ...(online ? { method: 'bkash' } : {}) }
  const quotes = online
    ? makeService({
        methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
          { channel: 'bkash', active: true, minPoisha: 1000, maxPoisha: 50000 },
        ]),
      })
    : context.service
  const quote = await quotes.create(who.credentials, input)
  const placed = await submissionService(quotes).submit(
      who.credentials,
      submit(input, quote),
      'cancel-read-order',
    ),
    id = placed.id
  const customers = createCustomerAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    ),
    scope = orderScopeAccess(customers, context.sessions),
    admin = await customer('admin'),
    adminAccess = createAdminAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    )
  const cancellation = createCancellationService(
    context.db.connection,
    scope,
    adminAccess,
    createCancellationAllocationService(
      composeAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    undefined,
    () => context.now,
  )
  const creds = { ...who.credentials, csrfToken: who.csrf }
  const reading = createOrderReadService(
    context.db.connection,
    customers,
    scope,
    customerPaymentSummaryAccess(context.db.connection),
    orderPolicySnapshotAccess(context.db.connection),
    composeOrderReadDependencies(),
    () => context.now,
  )
  const readApp = createApp({
    apiRouter: createOrderReadRoutes(reading, context.security, sessionCookies),
  })
  const ask = (reason = 'Please cancel', key = 'cancellation-request') =>
    cancellation.request(creds, id, { reason }, key)
  const decide = (
    requestId: string,
    decision: 'approve' | 'reject' = 'approve',
    extra: object = {},
    key = 'cancel-decision',
  ) =>
    cancellation.decide(
      admin.credentials.customerToken,
      requestId,
      { decision, reason: 'Synthetic administrator review', ...extra },
      key,
    )
  return { who, selected, id, admin, cancellation, creds, reading, readApp, ask, decide }
}

async function fundedCancellationFixture(partial = false) {
  await initializeRefundAttemptPersistence(context.db.connection)
  const f = await cancellationReadFixture(),
    admins = createAdminAccountAccess(context.db.connection, context.identities, context.sessions)
  const lifecycle = createOrderLifecycleService(
    context.db.connection,
    admins,
    fulfillmentPaymentAccess(context.db.connection),
    createFulfillmentAllocationService(
      composeFulfillmentAllocationDependencies(context.db.connection),
      () => context.now,
    ),
    composeAuditAccess(context.db.connection),
    composeOrderLifecycleDependencies(context.db.connection),
    async () => {},
    () => context.now,
  )
  await lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'confirmed', reason: 'Synthetic qualified confirmation' },
    'confirmed',
  )
  const payment = await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  const receipt = createCodCollectionService(
    context.db.connection,
    admins,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (data) => ({
      paymentId: data.paymentId,
      amountPoisha: data.amountPoisha,
      collectionReference: data.collectionReference,
      evidenceRef: data.evidenceRef,
      collectedAt: context.now,
      digest: 'a'.repeat(64),
    }),
    () => context.now,
  )
  const amount = partial ? 1 : payment.expectedPoisha
  await receipt.collect(
    f.admin.credentials.customerToken,
    payment._id.toHexString(),
    {
      amountPoisha: amount,
      collectionReference: 'funded-cancellation',
      evidenceRef: 'synthetic:cash-evidence',
      reason: 'Synthetic verified receipt',
    },
    'cash',
  )
  const refund = createCancellationRefundService(
    context.db.connection,
    cancellationRefundSnapshotAccess(context.db.connection),
    refundUnitReservationAccess(context.db.connection),
    refundFundingAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    async () => ({
      policyVersion: 'synthetic-cancellation-policy',
      method: 'manual_bank',
      consentRequired: false,
      deliveryApproved: true,
    }),
  )
  const release = createCancellationAllocationService(
    composeAllocationDependencies(context.db.connection),
    () => context.now,
  )
  const scope = orderScopeAccess(
    createCustomerAccountAccess(context.db.connection, context.identities, context.sessions),
    context.sessions,
  )
  const cancellation = createCancellationService(
    context.db.connection,
    scope,
    admins,
    release,
    cancellationPaymentAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCancellationDependencies(context.db.connection),
    refund,
    () => context.now,
  )
  return { ...f, admins, payment, amount, lifecycle, refund, release, scope, cancellation }
}

// Package A runs real HTTP, current sessions and replica-set persistence. Policy/cash are synthetic.
function packageARoot(
  f: Awaited<ReturnType<typeof lifecycleFixture>>,
  approved = true,
  evidence = vi.fn(async (input: Parameters<typeof f.proof>[0]) => f.proof(input)),
) {
  const routers = composeOrderOperationsRoutes(
    context.db.connection,
    { ...localReviewAuth(), guestAccounts: undefined },
    origin,
    {
      approvedDeadline: async () => {
        if (!approved) throw new ApiError('SERVICE_UNAVAILABLE')
      },
      cashEvidence: evidence,
      cancellationRefund: async () => {
        throw new ApiError('SERVICE_UNAVAILABLE')
      },
    },
    () => context.now,
  )
  return { root: createApp({ apiRouter: createApiRouter(undefined, routers) }), evidence }
}

function packageAPost(
  root: ReturnType<typeof createApp>,
  f: Awaited<ReturnType<typeof lifecycleFixture>>,
  to: string,
  key = to,
) {
  return request(root)
    .post(`/api/v1/admin/orders/${f.id}/fulfillment-transitions`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .set('Idempotency-Key', key)
    .send({
      to,
      reason: 'Synthetic HTTP authorization',
      ...(to === 'shipped' ? { dispatchReference: 'http-dispatch' } : {}),
    })
}

export {
  cancellationReadFixture,
  fundedCancellationFixture,
  lifecycleFixture,
  packageAPost,
  packageARoot,
}

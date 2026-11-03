import request from 'supertest'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import type { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { createAuthQuotaStore } from '../../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../../src/modules/auth/sessions/auth-throttle.service.js'
import {
  closedRefundRequestAccess,
  refundRequestOrderAccess,
  verifiedFundingOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import { createVerifiedAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import type { PaymentMatchingAuthority } from '../../../src/modules/payments/collections/payment-matching.service.js'
import { createPaymentMatchingService } from '../../../src/modules/payments/collections/payment-matching.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { createPaymentMatchingRoutes } from '../../../src/modules/payments/payment.routes.js'
import { refundClaimSelectionAccess } from '../../../src/modules/returns/return.service.js'
import {
  composeAllocationDependencies,
  composeAuditAccess,
  composePaymentMatchingDependencies,
  composeRefundOperationsRoutes,
} from '../../../src/setup.js'
import { sessionHttpFor } from '../auth.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import type { Browser } from './base.js'
import { authSecret, context, type customer, origin } from './base.js'
import { monitorFixture } from './payments.js'
import { codRefundPolicy, type reservationFixture } from './refunds.js'
import { localReviewAuth } from './reviews.js'

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

function customerRefundRoot(
  f: Pick<Awaited<ReturnType<typeof reservationFixture>>, 'id' | 'claimId'>,
  guests?: ReturnType<typeof createGuestSessionService>,
  policy: Parameters<typeof composeRefundOperationsRoutes>[2]['options'] = codRefundPolicy(f),
) {
  const auth = localReviewAuth()
  const scope = orderScopeAccess(auth.customerAccounts, context.sessions, guests)
  const router = composeRefundOperationsRoutes(
    context.db.connection,
    auth,
    { options: policy },
    () => new Date(Date.now() + 1000),
    {
      access: {
        scope,
        ownedOrder: refundRequestOrderAccess(context.db.connection),
        claimSelection: refundClaimSelectionAccess(context.db.connection),
        qualifiedClosed: closedRefundRequestAccess(context.db.connection),
      },
      origin,
      throttle: createAuthThrottle(
        createAuthQuotaStore(context.db.connection),
        authSecret,
      ).middleware('customer', 'checkout'),
    },
  )
  return createApp({ apiRouter: router })
}

function customerRefundPost(
  root: ReturnType<typeof createApp>,
  who: Browser,
  orderId: string,
  input: object,
  key = 'customer-request',
) {
  return request(root)
    .post(`/api/v1/orders/${orderId}/refund-requests`)
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', key)
    .send(input)
}

export { customerRefundPost, customerRefundRoot, matchingFixture, matchingRoot, matchPost }

import { createHash } from 'node:crypto'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import {
  refundOrderSnapshotAccess,
  refundUnitReservationAccess,
} from '../../../src/modules/orders/order.service.js'
import {
  refundFundingAccess,
  refundPaymentSnapshotAccess,
} from '../../../src/modules/payments/payment.service.js'
import { createRefundAdvisoryService } from '../../../src/modules/refunds/obligations/refund-advisory.service.js'
import { createRefundReservationService } from '../../../src/modules/refunds/obligations/refund-reservation.service.js'
import { createManualPayoutVerificationService } from '../../../src/modules/refunds/payouts/manual-payout-verification.service.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import type {
  RefundOutcomeProof,
  RefundOutcomeVerifier,
} from '../../../src/modules/refunds/payouts/refund-outcome.schema.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { refundClaimSnapshotAccess } from '../../../src/modules/returns/return.service.js'
import type { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import { createApiRouter } from '../../../src/routes.js'
import {
  composeAuditAccess,
  composeRefundOperationsRoutes,
  composeRefundRecovery,
} from '../../../src/setup.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { context, customer } from './base.js'
import { processingFixture } from './payments.js'
import { physicalReturnFixture } from './returns.js'
import { localReviewAuth } from './reviews.js'

function refundAdvisory(policy?: Parameters<typeof createRefundAdvisoryService>[3]) {
  return createRefundAdvisoryService(
    refundClaimSnapshotAccess(context.db.connection),
    refundOrderSnapshotAccess(context.db.connection),
    refundPaymentSnapshotAccess(context.db.connection),
    policy,
  )
}

function reservations(
  admins = createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
  policy: Parameters<typeof createRefundReservationService>[7] = async () => ({
    policyVersion: 'synthetic-reservation-policy',
    method: 'manual_bank',
    consentRequired: false,
  }),
) {
  return createRefundReservationService(
    context.db.connection,
    admins,
    refundClaimSnapshotAccess(context.db.connection),
    refundOrderSnapshotAccess(context.db.connection),
    refundUnitReservationAccess(context.db.connection),
    refundFundingAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    policy,
  )
}

async function reservationFixture(collected = true, registered = false, quantity = 1) {
  await initializeRefundAttemptPersistence(context.db.connection)
  const f = await physicalReturnFixture('shortage', true, registered)
  if (collected) await f.cash()
  const input = {
    orderId: f.id,
    basis: 'shortage',
    basisRefId: f.claimId,
    classification: 'merchandise',
    requestedItems: [{ orderItemId: f.itemId, quantity }],
    reason: 'Synthetic reservation review',
  }
  return { ...f, input, service: reservations() }
}

async function reservedGatewayFixture() {
  await initializeRefundAttemptPersistence(context.db.connection)
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ bank_tran_id: 'dispatch-bank', val_id: 'dispatch-validation' })
  expect(await f.processor().process({ ...f.claim, validationId: 'dispatch-validation' })).toBe(
    'committed',
  )
  const obligation = await refundModel(context.db.connection)
      .findOne({ orderId: f.result.id })
      .orFail(),
    admin = await customer('admin')
  const admins = createAdminAccountAccess(
    context.db.connection,
    context.identities,
    context.sessions,
  )
  const service = reservations(admins, async () => ({
    policyVersion: 'synthetic-gateway',
    method: 'gateway',
    consentRequired: false,
  }))
  await service.reserve(
    admin.credentials.customerToken,
    {
      orderId: f.result.id,
      basis: 'payment_correction',
      classification: 'payment_correction',
      correctionCollectionId: obligation.sourceCollectionId.toHexString(),
      reason: 'Synthetic approval',
    },
    'reserve-dispatch',
  )
  return { ...f, obligation, admin, admins }
}

async function manualEvidenceFixture(options: { consentRequired?: boolean } = {}) {
  const administrator = await customer('admin'),
    access = createAdminAccountAccess(context.db.connection, context.identities, context.sessions)
  const id = () => new Types.ObjectId().toHexString(),
    at = new Date(Date.now() - 30000)
  let snapshot = {
    refundId: id(),
    orderId: id(),
    sourceCollectionId: id(),
    attemptId: id(),
    method: 'manual_bkash',
    amountPoisha: 100,
    sourceCollectedPoisha: 100,
    sourceReservedPoisha: 100,
    obligationReservedPoisha: 100,
    capacityStatus: 'reserved',
    status: 'processing',
    attemptStatus: 'submitted',
    collectionVerifiedAt: at,
    approvedAt: at,
    initiatedAt: at,
    refundRevision: 1,
    sourceRevision: 1,
    attemptRevision: 1,
    consentRequired: options.consentRequired ?? false,
  }
  const proof = () => ({
    refundId: snapshot.refundId,
    orderId: snapshot.orderId,
    sourceCollectionId: snapshot.sourceCollectionId,
    attemptId: snapshot.attemptId,
    method: snapshot.method,
    amountPoisha: snapshot.amountPoisha,
    transferReference: 'synthetic-transfer',
    evidenceRef: 'synthetic-private',
    verdict: 'verified',
    transferredAt: at,
    evidenceDigest: 'a'.repeat(64),
    destinationMasked: '***123',
  })
  let provider = async () => proof()
  let calls = 0
  const verify = createManualPayoutVerificationService(
    access,
    async (session, id) => {
      if (!session.inTransaction() || id !== snapshot.refundId)
        throw new Error('Invalid synthetic scope')
      return snapshot
    },
    async () => {
      calls++
      return provider()
    },
  )
  return {
    administrator,
    verify,
    get snapshot() {
      return snapshot
    },
    setSnapshot(value: typeof snapshot) {
      snapshot = value
    },
    setProvider(value: () => Promise<ReturnType<typeof proof>>) {
      provider = value
    },
    proof,
    calls: () => calls,
    request: { transferReference: 'synthetic-transfer', evidenceRef: 'synthetic-private' },
  }
}

function packageCRoot(
  options: Parameters<typeof composeRefundOperationsRoutes>[2],
  clock = () => new Date(Date.now() + 30000),
) {
  return createApp({
    apiRouter: createApiRouter(undefined, [
      composeRefundOperationsRoutes(context.db.connection, localReviewAuth(), options, clock),
    ]),
  })
}

function packageCPost(
  root: ReturnType<typeof createApp>,
  admin: Awaited<ReturnType<typeof customer>>,
  path: string,
  input: object,
  key = 'package-c',
) {
  return request(root)
    .post(`/api/v1${path}`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', admin.cookie)
    .set('X-CSRF-Token', admin.csrf)
    .set('Idempotency-Key', key)
    .send(input)
}

const refundDevelopmentPolicy = { policyVersion: 'sportzone-refunds-v1', authorizations: [] }

function codRefundPolicy(
  f: Pick<Awaited<ReturnType<typeof reservationFixture>>, 'id' | 'claimId'>,
) {
  return {
    policyVersion: 'sportzone-refunds-v1',
    authorizations: [
      {
        orderId: f.id,
        basis: 'shortage' as const,
        basisRefId: f.claimId,
        approval: {
          policyVersion: 'synthetic-consented-policy',
          method: 'manual_bank' as const,
          consentRequired: true,
          consentEvidenceRef: 'synthetic:verified-consent',
          deliveryApproved: false,
        },
      },
    ],
  }
}

async function packageDFixture(
  gateway = false,
  offset = 60000,
  manualMethod: 'manual_bank' | 'manual_bkash' | 'manual_nagad' | 'manual_rocket' = 'manual_bank',
  registered = false,
) {
  let ticks = Date.now() + offset
  let proof: RefundOutcomeProof | undefined
  const merchant = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
  const queryRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['queryRefund']>()
    .mockImplementation(async (raw) => {
      const input = z.strictObject({ refundRefId: z.string(), bankTranId: z.string() }).parse(raw)
      return {
        kind: 'refund_report',
        merchantAccountKey: merchant,
        refundRefId: input.refundRefId,
        bankTranId: input.bankTranId,
        status: proof?.outcome === 'no_payout' ? 'cancelled' : 'refunded',
        evidenceDigest: 'a'.repeat(64),
      }
    })
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockImplementation(async () => ({
      kind: 'accepted',
      refundRefId: `d-${refundId}-${initiateRefund.mock.calls.length}`,
      evidenceDigest: 'b'.repeat(64),
    }))
  let admin: Awaited<ReturnType<typeof customer>>,
    refundId: string,
    orderId: string,
    manual: Awaited<ReturnType<typeof reservationFixture>> | undefined
  let options: Parameters<typeof composeRefundOperationsRoutes>[2]['options']
  if (gateway) {
    await initializeRefundAttemptPersistence(context.db.connection)
    const base = await processingFixture()
    base.change({ bank_tran_id: `d-first-${base.result.id}`, val_id: `d-first-${base.result.id}` })
    expect(
      await base.processor().process({ ...base.claim, validationId: `d-first-${base.result.id}` }),
    ).toBe('committed')
    base.change({
      bank_tran_id: `d-second-${base.result.id}`,
      val_id: `d-second-${base.result.id}`,
    })
    expect(
      await base.processor().process({ ...base.claim, validationId: `d-second-${base.result.id}` }),
    ).toBe('committed')
    const obligation = await refundModel(context.db.connection)
        .findOne({ orderId: base.result.id })
        .orFail(),
      administrator = await customer('admin')
    const service = reservations(
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      async () => ({ policyVersion: 'synthetic', method: 'gateway', consentRequired: false }),
    )
    await service.reserve(
      administrator.credentials.customerToken,
      {
        orderId: base.result.id,
        basis: 'payment_correction',
        classification: 'payment_correction',
        correctionCollectionId: obligation.sourceCollectionId.toHexString(),
        reason: 'Synthetic correction',
      },
      'reserve-d',
    )
    const f = { ...base, obligation, admin: administrator }
    admin = f.admin
    refundId = f.obligation._id.toHexString()
    orderId = f.result.id
    options = refundDevelopmentPolicy
  } else {
    manual = await reservationFixture(false, registered, registered ? 2 : 1)
    await manual.cash(undefined, `d-cash-${manual.id}`)
    admin = manual.admin
    orderId = manual.id
    const policy = codRefundPolicy(manual)
    options = {
      ...policy,
      authorizations: policy.authorizations.map((row) => ({
        ...row,
        approval: { ...row.approval, method: manualMethod },
      })),
    }
    refundId = ''
  }
  const verifyEvidence: RefundOutcomeVerifier = async () => proof
  const dependencies = {
    options,
    ...(gateway
      ? { gateway: { client: { initiateRefund, queryRefund }, merchantAccountKey: merchant } }
      : {}),
    verifyEvidence,
  }
  const clock = () => new Date(ticks),
    root = packageCRoot(dependencies, clock)
  if (manual) {
    const created = await packageCPost(
      root,
      admin,
      '/admin/refund-groups',
      manual.input,
      'd-group',
    ).expect(201)
    refundId = created.body.data.refunds[0].id
  }
  const post = (suffix: string, body: object, key = suffix) =>
    packageCPost(root, admin, `/admin/refunds/${refundId}/${suffix}`, body, key)
  const payout = () =>
    post(
      'payout-attempts',
      { method: gateway ? 'gateway' : manualMethod, reason: 'Synthetic payout admission' },
      'd-payout',
    )
  const setProof = async (
    outcome: 'paid' | 'no_payout',
    change: Partial<RefundOutcomeProof> = {},
  ) => {
    ticks += 1000
    const row = await refundModel(context.db.connection).findById(refundId).orFail(),
      attempt = await refundAttemptModel(context.db.connection)
        .findOne({ refundId })
        .sort({ attemptNumber: -1 })
        .orFail()
    proof = {
      refundId,
      orderId,
      sourceCollectionId: row.sourceCollectionId.toHexString(),
      attemptId: attempt._id.toHexString(),
      amountPoisha: row.amountPoisha,
      outcome,
      checkedAt: clock(),
      ...(outcome === 'paid' ? { paidAt: clock() } : {}),
      evidenceDigest: 'c'.repeat(64),
      provider: gateway ? 'sslcommerz' : 'manual',
      method: gateway ? 'gateway' : manualMethod,
      ...(gateway
        ? {
            merchantAccountKey: merchant,
            bankTranId: attempt.originalBankTranId ?? '',
            refundTransId: attempt.refundTransId ?? '',
            ...(attempt.refundRefId ? { refundRefId: attempt.refundRefId } : {}),
          }
        : {
            transferReference: 'synthetic-transfer',
            evidenceRef: 'synthetic-proof',
            destinationMasked: 'bank ****1234',
            consentEvidenceRef: 'synthetic:verified-consent',
            consentDigest: 'd'.repeat(64),
            consentAt: new Date(ticks - 500),
          }),
      ...change,
    }
  }
  return {
    root,
    post,
    payout,
    setProof,
    clock,
    admin,
    refundId,
    orderId,
    manual,
    initiateRefund,
    queryRefund,
    dependencies,
    advance: (ms = 1000) => {
      ticks += ms
    },
    clearProof: () => {
      proof = undefined
    },
    domain: () =>
      composeRefundRecovery(
        context.db.connection,
        createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
        dependencies,
        clock,
      ),
  }
}

for (const method of ['manual_bkash', 'manual_nagad', 'manual_rocket'] as const) {
  it(`Package D: mobile wallet ${method} requires and records exact method-bound verified transfer`, async () => {
    const f = await packageDFixture(false, 60000, method)
    await f.payout().expect(200)
    await f.setProof('paid')
    await f
      .post(
        'manual-confirmations',
        {
          transferReference: 'synthetic-transfer',
          evidenceRef: 'synthetic-proof',
          reason: 'Method-bound wallet verification',
        },
        'wallet-confirm',
      )
      .expect(200)
    const refund = await refundModel(context.db.connection).findById(f.refundId).orFail()
    expect(refund.method).toBe(method)
    expect(refund.status).toBe('completed')
    expect(
      (await refundAttemptModel(context.db.connection).findOne({ refundId: f.refundId }).orFail())
        .manualEvidence?.destinationMasked,
    ).toContain('****')
  })
}

export {
  codRefundPolicy,
  manualEvidenceFixture,
  packageCPost,
  packageCRoot,
  packageDFixture,
  refundAdvisory,
  refundDevelopmentPolicy,
  reservationFixture,
  reservations,
  reservedGatewayFixture,
}

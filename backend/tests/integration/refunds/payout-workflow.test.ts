import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it, vi } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { refundReconciliationJob } from '../../../src/jobs/reconcile-refunds.job.js'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { createNotificationDeliveryService } from '../../../src/modules/notifications/notification-delivery.service.js'
import { createRefundMessageService } from '../../../src/modules/notifications/notification-template.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { returnNotificationOrderAccess } from '../../../src/modules/orders/order.service.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundFundingAccess } from '../../../src/modules/payments/payment.service.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import { createRefundDispatchService } from '../../../src/modules/refunds/payouts/refund-dispatch.service.js'
import type { RefundOutcomeProof } from '../../../src/modules/refunds/payouts/refund-outcome.schema.js'
import { refundNotificationProofAccess } from '../../../src/modules/refunds/payouts/refund-recovery.service.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import { startServer } from '../../../src/server.js'
import { composeAuditAccess, composeRefundRecovery } from '../../../src/setup.js'
import {
  assertOutsideTransaction,
  inTransaction,
} from '../../../src/shared/database/transaction.js'
import { jobLeaseService } from '../../../src/shared/jobs/job-lease.service.js'
import { createLogger } from '../../../src/shared/logger.js'
import {
  authSecret,
  context,
  customer,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { fundedCancellationFixture } from '../../helpers/commerce/orders.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import {
  manualEvidenceFixture,
  packageCPost,
  packageCRoot,
  packageDFixture,
  refundDevelopmentPolicy,
  reservedGatewayFixture,
} from '../../helpers/commerce/refunds.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('refund dispatch: concurrent requests submit one persisted identity outside the transaction and acceptance remains processing', async () => {
  const f = await reservedGatewayFixture()
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockImplementation(async () => {
      assertOutsideTransaction()
      expect((await refundAttemptModel(context.db.connection).findOne().orFail()).status).toBe(
        'submitted',
      )
      expect(
        (await refundModel(context.db.connection).findById(f.obligation._id).orFail()).status,
      ).toBe('processing')
      return {
        kind: 'accepted',
        refundRefId: 'synthetic-provider-refund',
        evidenceDigest: 'a'.repeat(64),
      }
    })
  const service = createRefundDispatchService(
    context.db.connection,
    f.admins,
    refundFundingAccess(context.db.connection),
    { initiateRefund },
    composeAuditAccess(context.db.connection),
  )
  const command = { method: 'gateway', reason: 'Synthetic dispatch review' }
  const result = await Promise.all([
    service.dispatch(
      f.admin.credentials.customerToken,
      f.obligation._id.toHexString(),
      command,
      'send',
    ),
    service.dispatch(
      f.admin.credentials.customerToken,
      f.obligation._id.toHexString(),
      command,
      'send',
    ),
  ])
  expect(result.every((r) => r.state === 'submitted')).toBe(true)
  expect(initiateRefund).toHaveBeenCalledTimes(1)
  const attempt = await refundAttemptModel(context.db.connection).findOne().orFail()
  expect(attempt.refundRefId).toBe('synthetic-provider-refund')
  expect(attempt.confirmedAt).toBeUndefined()
  const payment = await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()
  expect(payment.correctionRefundHeldPoisha).toBe(f.obligation.amountPoisha)
  expect(payment.correctionRefundCompletedPoisha).toBe(0)
})

it('refund dispatch: timeout preserves held funds and stable identity without automatic redispatch', async () => {
  const f = await reservedGatewayFixture()
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockRejectedValue(new Error('Synthetic ambiguous external timeout'))
  const service = createRefundDispatchService(
    context.db.connection,
    f.admins,
    refundFundingAccess(context.db.connection),
    { initiateRefund },
    composeAuditAccess(context.db.connection),
  )
  const command = { method: 'gateway', reason: 'Synthetic dispatch review' }
  const result = await service.dispatch(
    f.admin.credentials.customerToken,
    f.obligation._id.toHexString(),
    command,
    'uncertain',
  )
  expect(result.state).toBe('uncertain')
  expect(
    (
      await service.dispatch(
        f.admin.credentials.customerToken,
        f.obligation._id.toHexString(),
        command,
        'different-key',
      )
    ).state,
  ).toBe('uncertain')
  expect(initiateRefund).toHaveBeenCalledTimes(1)
  await expect(
    service.dispatch(
      f.admin.credentials.customerToken,
      f.obligation._id.toHexString(),
      { ...command, reason: 'Changed' },
      'uncertain',
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  expect(
    (await refundModel(context.db.connection).findById(f.obligation._id).orFail()).capacityStatus,
  ).toBe('reserved')
  await expect(
    inTransaction(context.db.connection, () =>
      service.dispatch(
        f.admin.credentials.customerToken,
        f.obligation._id.toHexString(),
        command,
        'inside-transaction',
      ),
    ),
  ).rejects.toThrow()
})

it('refund transport local: provider request is forbidden inside a MongoDB transaction', async () => {
  const transport = vi.fn<typeof fetch>()
  const provider = createSslcommerzAdapter(
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
  await expect(
    inTransaction(context.db.connection, (session) => {
      expect(session.inTransaction()).toBe(true)
      return provider.initiateRefund({
        bankTranId: 'bank',
        refundTransId: 'refund',
        amountPoisha: 100,
        remarks: 'synthetic',
      })
    }),
  ).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
})

it('manual payout evidence local: real admin authorizes verified bound proof without any financial write', async () => {
  const f = await manualEvidenceFixture(),
    token = f.administrator.credentials.customerToken
  const result = await f.verify(token, f.snapshot.refundId, f.request)
  expect(result).toMatchObject({ state: 'evidence_verified', evidenceDigest: 'a'.repeat(64) })
  expect(JSON.stringify(result)).not.toContain('synthetic-transfer')
  expect(JSON.stringify(result)).not.toContain('***123')
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
  expect(await context.db.connection.collection('paymentCollections').countDocuments()).toBe(0)
  expect(await context.db.connection.collection('auditLogs').countDocuments()).toBe(0)
})

it('manual payout evidence local: unauthorized or unfunded snapshots never access protected evidence', async () => {
  const f = await manualEvidenceFixture()
  await expect(f.verify(undefined, f.snapshot.refundId, f.request)).rejects.toThrow()
  expect(f.calls()).toBe(0)
  f.setSnapshot({ ...f.snapshot, sourceCollectedPoisha: 0 })
  await expect(
    f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
  ).rejects.toThrow()
  expect(f.calls()).toBe(0)
  f.setSnapshot({ ...f.snapshot, sourceCollectedPoisha: 100, sourceReservedPoisha: 101 })
  await expect(
    f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
  ).rejects.toThrow()
  expect(f.calls()).toBe(0)
})

it('manual payout evidence local: forged binding, time, masked destination and consent cannot establish proof', async () => {
  const f = await manualEvidenceFixture({ consentRequired: true })
  const base = f.proof()
  const cases = [
    { ...base, amountPoisha: 99 },
    { ...base, sourceCollectionId: new Types.ObjectId().toHexString() },
    { ...base, orderId: new Types.ObjectId().toHexString() },
    { ...base, method: 'manual_bank' },
    { ...base, attemptId: new Types.ObjectId().toHexString() },
    { ...base, transferReference: 'other' },
    { ...base, evidenceRef: 'other' },
    { ...base, transferredAt: new Date(Date.now() + 60000) },
    { ...base, verdict: 'unknown' },
    { ...base, destinationMasked: '1234567890' },
    base,
  ]
  for (const fact of cases) {
    f.setProvider(async () => fact)
    await expect(
      f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
    ).rejects.toThrow()
  }
  f.setProvider(async () => ({
    ...base,
    consentDigest: 'b'.repeat(64),
    consentAt: base.transferredAt,
  }))
  await expect(
    f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
  ).resolves.toMatchObject({ state: 'evidence_verified', consentDigest: 'b'.repeat(64) })
})

it('manual payout evidence local: changed reservation or revoked admin during evidence read fails closed', async () => {
  const f = await manualEvidenceFixture(),
    base = f.proof()
  f.setProvider(async () => {
    f.setSnapshot({ ...f.snapshot, sourceRevision: f.snapshot.sourceRevision + 1 })
    return base
  })
  await expect(
    f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  f.setProvider(async () => {
    await context.identities.users.updateOne(
      { _id: f.administrator.user._id },
      { $set: { status: 'suspended' } },
    )
    return base
  })
  await expect(
    f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
  ).rejects.toThrow()
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
})

it('manual payout evidence local: unknown evidence failure is sanitized and no retry or completion occurs', async () => {
  const f = await manualEvidenceFixture()
  f.setProvider(async () => {
    throw new Error('synthetic-secret')
  })
  await expect(
    f.verify(f.administrator.credentials.customerToken, f.snapshot.refundId, f.request),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  expect(f.calls()).toBe(1)
  expect(await context.db.connection.collection('refunds').countDocuments()).toBe(0)
})

it('refund status local: provider status reads are forbidden inside transaction', async () => {
  const transport = vi.fn<typeof fetch>()
  const provider = createSslcommerzAdapter(
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
  await expect(
    inTransaction(context.db.connection, () =>
      provider.queryRefund({ bankTranId: 'bank', refundRefId: 'refund' }),
    ),
  ).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
})

it('Package D: verified manual confirmation atomically completes source/order/unit counters and deduplicates outbox', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('paid')
  const body = {
    transferReference: 'synthetic-transfer',
    evidenceRef: 'synthetic-proof',
    reason: 'Confirmed protected original transfer',
  }
  await f.post('manual-confirmations', body, 'manual-proof').expect(200)
  await f.post('manual-confirmations', body, 'manual-proof').expect(200)
  const row = await refundModel(context.db.connection).findById(f.refundId).orFail(),
    attempt = await refundAttemptModel(context.db.connection)
      .findOne({ refundId: f.refundId })
      .orFail()
  expect(row.status).toBe('completed')
  expect(row.capacityStatus).toBe('completed')
  expect(attempt.status).toBe('confirmed')
  expect(attempt.manualEvidence?.destinationMasked).toBe('bank ****1234')
  const payment = await paymentModel(context.db.connection).findById(row.paymentId).orFail()
  expect(payment.merchandiseRefundHeldPoisha).toBe(0)
  expect(payment.merchandiseRefundCompletedPoisha).toBe(row.amountPoisha)
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.orderId })
    .orFail()
  expect(balance.unitCoverage.reduce((n, u) => n + u.refundCompletedPoisha, 0)).toBe(
    row.merchandiseAmountPoisha,
  )
  expect(
    await context.db.connection.collection('notifications').countDocuments({
      eventType: 'refund_update',
      'payload.refundId': row._id,
      'payload.refundStatus': 'completed',
    }),
  ).toBe(1)
})

it('Package D: gateway status alone remains uncertain; independent matching proof completes correction without merchandise projection', async () => {
  const f = await packageDFixture(true)
  await f.payout().expect(200)
  await f.post('reconcile', { reason: 'Status alone' }, 'status-alone').expect(200)
  expect(
    (await refundModel(context.db.connection).findById(f.refundId).orFail()).capacityStatus,
  ).toBe('reserved')
  await f.setProof('paid')
  await f.post('reconcile', { reason: 'Independent settlement' }, 'qualified').expect(200)
  const row = await refundModel(context.db.connection).findById(f.refundId).orFail(),
    payment = await paymentModel(context.db.connection).findById(row.paymentId).orFail()
  expect(row.status).toBe('completed')
  expect(payment.correctionRefundCompletedPoisha).toBe(row.amountPoisha)
  expect(payment.merchandiseRefundCompletedPoisha).toBe(0)
  expect(payment.paymentStatus).toBe('paid')
  expect(f.initiateRefund).toHaveBeenCalledTimes(1)
})

it('Package D: mismatched amount, method, consent and client-supplied payout facts cannot complete manual payout', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  const input = {
    transferReference: 'synthetic-transfer',
    evidenceRef: 'synthetic-proof',
    reason: 'Review',
  }
  await f.post('manual-confirmations', input, 'no-proof').expect(422)
  await f.setProof('paid', { amountPoisha: 1 })
  await f.post('manual-confirmations', input, 'bad-amount').expect(422)
  await f.setProof('paid', { method: 'manual_nagad' })
  await f.post('manual-confirmations', input, 'bad-method').expect(422)
  await f.setProof('paid', { consentAt: new Date(f.clock().getTime() + 10000) })
  await f.post('manual-confirmations', input, 'bad-consent').expect(422)
  await f
    .post('manual-confirmations', { ...input, confirmedAt: f.clock().toISOString() }, 'client-time')
    .expect(400)
  expect((await refundModel(context.db.connection).findById(f.refundId).orFail()).status).toBe(
    'processing',
  )
})

it('Package D: verified no-payout releases once; explicit retry reacquires balance and preserves original approval time', async () => {
  const f = await packageDFixture(true)
  await f.payout().expect(200)
  await f.setProof('no_payout')
  const approvedAt = (await refundModel(context.db.connection).findById(f.refundId).orFail())
    .approvedAt
  await f.post('reconcile', { reason: 'Verified terminal no payout' }, 'failed-proof').expect(200)
  let row = await refundModel(context.db.connection).findById(f.refundId).orFail()
  expect(row.status).toBe('failed')
  expect(row.capacityStatus).toBe('released')
  expect(
    (await paymentModel(context.db.connection).findById(row.paymentId).orFail())
      .correctionRefundHeldPoisha,
  ).toBe(0)
  f.advance()
  await f
    .post('payout-attempts', { method: 'gateway', reason: 'Authorized safe retry' }, 'retry')
    .expect(200)
  row = await refundModel(context.db.connection).findById(f.refundId).orFail()
  expect(row.approvedAt?.getTime()).toBe(approvedAt?.getTime())
  expect(row.capacityStatus).toBe('reserved')
  const attempts = await refundAttemptModel(context.db.connection)
    .find({ refundId: f.refundId })
    .sort({ attemptNumber: 1 })
  expect(attempts).toHaveLength(2)
  expect(attempts[0]?.status).toBe('failed')
  expect(attempts[0]?.refundTransId).not.toBe(attempts[1]?.refundTransId)
})

it('Package D: undispatched rejection releases entitlements; uncertain attempt cannot be rejected or blindly retried', async () => {
  const f = await packageDFixture()
  await f
    .post('review', { decision: 'reject', reason: 'Reviewed pre-dispatch rejection' }, 'reject')
    .expect(200)
  expect(
    (await refundModel(context.db.connection).findById(f.refundId).orFail()).capacityStatus,
  ).toBe('released')
  const other = await packageDFixture(true)
  await other.payout().expect(200)
  await other
    .post('review', { decision: 'reject', reason: 'Unsafe submitted release' }, 'reject-submitted')
    .expect(409)
  await other
    .post(
      'payout-attempts',
      { method: 'gateway', reason: 'Replay existing submitted identity' },
      'new-key',
    )
    .expect(200)
  expect(other.initiateRefund).toHaveBeenCalledTimes(1)
})

it('Package D: notification failure rolls back payout completion and all financial effects', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('paid')
  await context.db.connection
    .collection('notifications')
    .dropIndex('notifications_event_key_unique')
  try {
    await f
      .post(
        'manual-confirmations',
        {
          transferReference: 'synthetic-transfer',
          evidenceRef: 'synthetic-proof',
          reason: 'Completion must roll back',
        },
        'rollback',
      )
      .expect(500)
    const row = await refundModel(context.db.connection).findById(f.refundId).orFail()
    expect(row.status).toBe('processing')
    expect(row.capacityStatus).toBe('reserved')
    expect(
      (await paymentModel(context.db.connection).findById(row.paymentId).orFail())
        .merchandiseRefundCompletedPoisha,
    ).toBe(0)
    expect(
      (await refundAttemptModel(context.db.connection).findOne({ refundId: f.refundId }).orFail())
        .status,
    ).toBe('submitted')
  } finally {
    await createNotificationService(context.db.connection).initialize()
  }
})

it('Package D: reconciliation job checkpoints durable attempt identity and never initiates payout', async () => {
  const f = await packageDFixture(true)
  await f.payout().expect(200)
  await f.setProof('paid')
  f.advance(60001)
  const job = refundReconciliationJob(
    context.db.connection,
    f.domain(),
    { batchSize: 1, leaseMs: 60000, pollMs: 1000 },
    f.clock,
  )
  const result = await job.run()
  expect(result.acquired).toBe(true)
  expect(result.resolved).toBe(1)
  expect((await refundModel(context.db.connection).findById(f.refundId).orFail()).status).toBe(
    'completed',
  )
  await job.run()
  expect(f.initiateRefund).toHaveBeenCalledTimes(1)
})

it('Package D: concurrent manual confirmations settle once and completed-key payload changes conflict', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('paid')
  const body = {
    transferReference: 'synthetic-transfer',
    evidenceRef: 'synthetic-proof',
    reason: 'Concurrent protected completion',
  }
  const results = await Promise.all(
    ['one', 'two'].map((key) => f.post('manual-confirmations', body, key)),
  )
  expect(results.map((r) => r.status)).toEqual([200, 200])
  await f.post('manual-confirmations', { ...body, reason: 'Changed request' }, 'two').expect(409)
  const row = await refundModel(context.db.connection).findById(f.refundId).orFail()
  expect(
    (await paymentModel(context.db.connection).findById(row.paymentId).orFail())
      .merchandiseRefundCompletedPoisha,
  ).toBe(row.amountPoisha)
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ 'payload.refundId': row._id, 'payload.refundStatus': 'completed' }),
  ).toBe(1)
})

it('Package D: a verified transfer reference cannot fund a second refund', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('paid')
  const body = {
    transferReference: 'synthetic-transfer',
    evidenceRef: 'synthetic-proof',
    reason: 'Reference uniqueness',
  }
  await f.post('manual-confirmations', body, 'first-transfer').expect(200)
  const other = await packageDFixture()
  await other.payout().expect(200)
  await other.setProof('paid')
  await other.post('manual-confirmations', body, 'same-transfer').expect(409)
  expect(
    (await refundModel(context.db.connection).findById(other.refundId).orFail()).capacityStatus,
  ).toBe('reserved')
})

it('Package D: proof predating dispatch is denied but delayed settlement proof survives later read-only polls', async () => {
  const f = await packageDFixture(true)
  await f.payout().expect(200)
  await f.setProof('no_payout', { checkedAt: new Date(f.clock().getTime() - 10000) })
  await f.post('reconcile', { reason: 'Stale before dispatch' }, 'stale').expect(422)
  await f.setProof('paid')
  f.advance(60000)
  // A missing proof poll must not erase the stable external-dispatch timestamp.
  const proofDomain = composeRefundRecovery(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    { ...f.dependencies, verifyEvidence: async () => undefined },
    f.clock,
  )
  await proofDomain.reconcile(
    f.admin.credentials.customerToken,
    f.refundId,
    'No artifact yet',
    'missing-proof-poll',
  )
  await f.post('reconcile', { reason: 'Delayed independent artifact' }, 'delayed-proof').expect(200)
  expect((await refundModel(context.db.connection).findById(f.refundId).orFail()).status).toBe(
    'completed',
  )
})

it('Package D: worker lease exclusion and expiration protect financial effects before restart', async () => {
  const f = await packageDFixture(true)
  await f.payout().expect(200)
  await f.setProof('paid')
  f.advance(60000)
  const leases = jobLeaseService(context.db.connection, 'refund-reconciliation', 60000, f.clock),
    claim = await leases.acquire()
  expect(claim).not.toBeNull()
  const job = refundReconciliationJob(
    context.db.connection,
    f.domain(),
    { batchSize: 10, leaseMs: 60000, pollMs: 1000 },
    f.clock,
  )
  expect((await job.run()).acquired).toBe(false)
  f.advance(60001)
  const proof = f.dependencies.verifyEvidence
  const stale = composeRefundRecovery(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    {
      ...f.dependencies,
      verifyEvidence: async (input) => {
        const result = await proof(input)
        f.advance(60001)
        return result
      },
    },
    f.clock,
  )
  await expect(
    refundReconciliationJob(
      context.db.connection,
      stale,
      { batchSize: 10, leaseMs: 60000, pollMs: 1000 },
      f.clock,
    ).run(),
  ).rejects.toThrow()
  expect(
    (await refundModel(context.db.connection).findById(f.refundId).orFail()).capacityStatus,
  ).toBe('reserved')
  expect((await job.run()).resolved).toBe(1)
})

it('Package D: malformed proof is deferred without starving another ready attempt', async () => {
  const first = await packageDFixture(true)
  await first.payout().expect(200)
  await first.setProof('paid')
  const second = await packageDFixture(true)
  await second.payout().expect(200)
  await second.setProof('paid')
  second.advance(120000)
  const valid = second.dependencies.verifyEvidence
  const domain = composeRefundRecovery(
    context.db.connection,
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    {
      ...second.dependencies,
      verifyEvidence: async (input) =>
        input.refundId === first.refundId ? { bad: 'unqualified' } : valid(input),
    },
    second.clock,
  )
  const result = await refundReconciliationJob(
    context.db.connection,
    domain,
    { batchSize: 10, leaseMs: 60000, pollMs: 1000 },
    second.clock,
  ).run()
  expect(result.resolved).toBe(1)
  expect(result.blocked).toBe(1)
  const attempt = await refundAttemptModel(context.db.connection)
    .findOne({ refundId: first.refundId })
    .orFail()
  expect(attempt.status).toBe('uncertain')
  expect(attempt.failureCode).toBe('INVESTIGATION_REQUIRED')
  expect(
    (await refundModel(context.db.connection).findById(first.refundId).orFail()).capacityStatus,
  ).toBe('reserved')
  first.advance(180000)
  await first
    .post('reconcile', { reason: 'Qualified proof after investigation' }, 'after-investigation')
    .expect(200)
  expect(
    (await refundAttemptModel(context.db.connection).findById(attempt._id).orFail()).failureCode,
  ).toBeUndefined()
})

it('Package D: after-sales worker sends only verified refund facts and rejects tampered completed intent', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('paid')
  await f
    .post(
      'manual-confirmations',
      {
        transferReference: 'synthetic-transfer',
        evidenceRef: 'synthetic-proof',
        reason: 'Verified settlement',
      },
      'email-proof',
    )
    .expect(200)
  const store = createNotificationService(context.db.connection, f.clock),
    send = vi.fn().mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-mail' })
  const worker = createNotificationDeliveryService(
    store,
    { send },
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 100 },
    f.clock,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createRefundMessageService(
      refundNotificationProofAccess(
        context.db.connection,
        returnNotificationOrderAccess(context.db.connection),
        composeAuditAccess(context.db.connection),
      ),
    ),
  )
  await worker.runBatch()
  await worker.runBatch()
  const completed = send.mock.calls.filter((c) =>
    String(c[0]?.text).includes('independently verified as completed'),
  )
  expect(completed).toHaveLength(1)
  const recipient = (await orderModels(context.db.connection).orders.findById(f.orderId).orFail())
    .customerSnapshot.emailNormalized
  await context.db.connection.collection('notifications').insertOne({
    eventKey: `refund_update:${f.refundId}:completed:${'e'.repeat(64)}:v1`,
    orderId: new Types.ObjectId(f.orderId),
    recipient: { emailNormalized: recipient },
    eventType: 'refund_update',
    templateVersion: 'refund-update-v1',
    payload: {
      refundId: new Types.ObjectId(f.refundId),
      refundStatus: 'completed',
      operationKey: 'e'.repeat(64),
      occurredAt: f.clock(),
    },
    status: 'queued',
    attemptCount: 0,
    nextAttemptAt: f.clock(),
    createdAt: f.clock(),
    updatedAt: f.clock(),
  })
  const before = send.mock.calls.length
  await worker.runBatch()
  expect(send.mock.calls.length).toBe(before)
})

it('Package D: independent verifier cannot authorize a suspended administrator after external verification', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('paid')
  const verify = f.dependencies.verifyEvidence
  const root = packageCRoot(
    {
      ...f.dependencies,
      verifyEvidence: async (input) => {
        await context.identities.users.updateOne(
          { _id: f.admin.user._id },
          { $set: { status: 'suspended' } },
        )
        return verify(input)
      },
    },
    f.clock,
  )
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${f.refundId}/manual-confirmations`,
    {
      transferReference: 'synthetic-transfer',
      evidenceRef: 'synthetic-proof',
      reason: 'Reauthorize after verification',
    },
    'revoked-during-proof',
  ).expect(401)
  expect(
    (await refundModel(context.db.connection).findById(f.refundId).orFail()).capacityStatus,
  ).toBe('reserved')
})

it('Package D: manual no-payout release permits an explicit new numbered attempt without resetting approval', async () => {
  const f = await packageDFixture()
  await f.payout().expect(200)
  await f.setProof('no_payout')
  await f
    .post('reconcile', { reason: 'Independent no-transfer evidence' }, 'manual-no-payout')
    .expect(200)
  const approvedAt = (await refundModel(context.db.connection).findById(f.refundId).orFail())
    .approvedAt
  f.advance()
  await f
    .post(
      'payout-attempts',
      { method: 'manual_bank', reason: 'Explicit manual retry' },
      'manual-retry',
    )
    .expect(200)
  const attempts = await refundAttemptModel(context.db.connection)
    .find({ refundId: f.refundId })
    .sort({ attemptNumber: 1 })
  expect(attempts).toHaveLength(2)
  expect(attempts[0]?.status).toBe('failed')
  expect(attempts[1]?.status).toBe('submitted')
  expect(
    (await refundModel(context.db.connection).findById(f.refundId).orFail()).approvedAt?.getTime(),
  ).toBe(approvedAt?.getTime())
  expect(
    await context.db.connection.collection('notifications').countDocuments({
      'payload.refundId': new Types.ObjectId(f.refundId),
      'payload.refundStatus': 'approved',
    }),
  ).toBe(2)
  expect(
    await context.db.connection.collection('notifications').countDocuments({
      'payload.refundId': new Types.ObjectId(f.refundId),
      'payload.refundStatus': 'processing',
    }),
  ).toBe(2)
})

it('Package D: refunded partial COD cancellation remains Pending and never rewrites cancelled fulfillment', async () => {
  const f = await fundedCancellationFixture(true),
    asked = await f.ask()
  await f.cancellation.decide(
    f.admin.credentials.customerToken,
    asked.id,
    { decision: 'approve', reason: 'Partially collected cancellation' },
    'partial-cancel',
  )
  const row = await refundModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  let proof: RefundOutcomeProof | undefined
  const clock = () => new Date(Date.now() + 60000),
    root = packageCRoot(
      { options: refundDevelopmentPolicy, verifyEvidence: async () => proof },
      clock,
    )
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/payout-attempts`,
    { method: 'manual_bank', reason: 'Admit recorded partial refund' },
    'partial-start',
  ).expect(200)
  const attempt = await refundAttemptModel(context.db.connection)
      .findOne({ refundId: row._id })
      .orFail(),
    at = clock()
  proof = {
    refundId: row._id.toHexString(),
    orderId: f.id,
    sourceCollectionId: row.sourceCollectionId.toHexString(),
    attemptId: attempt._id.toHexString(),
    amountPoisha: row.amountPoisha,
    outcome: 'paid',
    checkedAt: at,
    paidAt: at,
    evidenceDigest: 'f'.repeat(64),
    provider: 'manual',
    method: 'manual_bank',
    transferReference: 'partial-cash-transfer',
    evidenceRef: 'synthetic:partial-cash-proof',
    destinationMasked: 'bank ****5678',
  }
  await packageCPost(
    root,
    f.admin,
    `/admin/refunds/${row._id}/manual-confirmations`,
    {
      transferReference: 'partial-cash-transfer',
      evidenceRef: 'synthetic:partial-cash-proof',
      reason: 'Independent partial transfer',
    },
    'partial-complete',
  ).expect(200)
  const payment = await paymentModel(context.db.connection).findById(row.paymentId).orFail()
  expect(payment.paymentStatus).toBe('pending')
  expect(payment.merchandiseRefundCompletedPoisha).toBe(1)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).fulfillmentStatus,
  ).toBe('cancelled')
})

it('Package D: actual configured server confirms only the exact protected digest-bound original transfer artifact', async () => {
  const f = await packageDFixture(false, 0),
    directory = await mkdtemp(join(tmpdir(), 'sportzone-d-proof-startup-'))
  const originalEnvironment = process.env
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    const registry = join(directory, 'registry.json'),
      artifact = join(directory, 'original-transfer.json')
    await writeFile(registry, JSON.stringify({ version: 1, entries: [] }), { mode: 0o600 })
    const env = {
      ...identityEnvironment(),
      SESSION_SECRET: authSecret,
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
      REFUND_OPERATIONS_ENABLED: 'true',
      REFUND_PAYOUT_EVIDENCE_FILE: registry,
    }
    process.env = { ...env }
    const config = { ...loadEnvironment(env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    const server = runtime.server
    const post = (suffix: string, body: object, key: string) =>
      request(server)
        .post(`/api/v1/admin/refunds/${f.refundId}/${suffix}`)
        .set('Origin', 'https://admin.example.test')
        .set('Cookie', f.admin.cookie)
        .set('X-CSRF-Token', f.admin.csrf)
        .set('Idempotency-Key', key)
        .send(body)
    await post(
      'payout-attempts',
      { method: 'manual_bank', reason: 'Admit protected transfer' },
      'actual-start',
    ).expect(200)
    const row = await refundModel(context.db.connection).findById(f.refundId).orFail(),
      attempt = await refundAttemptModel(context.db.connection)
        .findOne({ refundId: f.refundId })
        .orFail(),
      at = new Date()
    const fact = {
      refundId: f.refundId,
      orderId: f.orderId,
      sourceCollectionId: row.sourceCollectionId.toHexString(),
      attemptId: attempt._id.toHexString(),
      amountPoisha: row.amountPoisha,
      outcome: 'paid',
      method: 'manual_bank',
      provider: 'manual',
      checkedAt: at.toISOString(),
      paidAt: at.toISOString(),
      transferReference: 'configured-original-transfer',
      evidenceRef: 'synthetic:protected-receipt',
      destinationMasked: 'bank ****1234',
      consentEvidenceRef: 'synthetic:verified-consent',
      consentDigest: 'c'.repeat(64),
      consentAt: at.toISOString(),
    }
    const bytes = JSON.stringify(fact)
    await writeFile(artifact, bytes, { mode: 0o600 })
    await writeFile(
      registry,
      JSON.stringify({
        version: 1,
        entries: [
          {
            refundId: f.refundId,
            attemptId: attempt._id.toHexString(),
            artifactFile: 'original-transfer.json',
            evidenceDigest: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      }),
    )
    const input = {
      transferReference: fact.transferReference,
      evidenceRef: fact.evidenceRef,
      reason: 'Verify original protected transfer',
    }
    await post('manual-confirmations', input, 'actual-confirm').expect(200)
    await rm(artifact)
    await post('manual-confirmations', input, 'actual-confirm').expect(200)
    expect((await refundModel(context.db.connection).findById(f.refundId).orFail()).status).toBe(
      'completed',
    )
  } finally {
    await runtime?.close()
    process.env = originalEnvironment
    await rm(directory, { recursive: true, force: true })
  }
})

it('Package D: correction review binds the original command across promotion and never reapproves a changed payload', async () => {
  await initializeRefundAttemptPersistence(context.db.connection)
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ bank_tran_id: 'd-review-second-bank', val_id: 'd-review-second-validation' })
  expect(
    await f.processor().process({ ...f.claim, validationId: 'd-review-second-validation' }),
  ).toBe('committed')
  const row = await refundModel(context.db.connection).findOne({ orderId: f.result.id }).orFail(),
    admin = await customer('admin'),
    root = packageCRoot({ options: refundDevelopmentPolicy })
  const path = `/admin/refunds/${row._id}/review`,
    input = { decision: 'approve', reason: 'Original protected review', method: 'gateway' }
  await packageCPost(root, admin, path, input, 'same-review').expect(200)
  const before = (await refundModel(context.db.connection).findById(row._id).orFail()).approvedAt
  await packageCPost(root, admin, path, input, 'same-review').expect(200)
  await packageCPost(
    root,
    admin,
    path,
    { ...input, reason: 'Changed after promotion' },
    'same-review',
  ).expect(409)
  expect(
    (await refundModel(context.db.connection).findById(row._id).orFail()).approvedAt?.getTime(),
  ).toBe(before?.getTime())
  expect(
    await refundAttemptModel(context.db.connection).countDocuments({ refundId: row._id }),
  ).toBe(1)
})

it('Package D: a lost gateway acknowledgment recovers its qualified provider reference without resending payout', async () => {
  const f = await packageDFixture(true)
  f.initiateRefund.mockRejectedValueOnce(new Error('Synthetic lost gateway response'))
  const started = await f.payout().expect(200)
  expect(started.body.data.state).toBe('uncertain')
  expect(
    (await refundAttemptModel(context.db.connection).findOne({ refundId: f.refundId }).orFail())
      .refundRefId,
  ).toBeUndefined()
  await f.setProof('paid', { refundRefId: 'recovered-qualified-provider-ref' })
  await f
    .post('reconcile', { reason: 'Original settlement recovered reference' }, 'recover-original')
    .expect(200)
  const attempt = await refundAttemptModel(context.db.connection)
    .findOne({ refundId: f.refundId })
    .orFail()
  expect(attempt.status).toBe('confirmed')
  expect(attempt.refundRefId).toBe('recovered-qualified-provider-ref')
  expect(f.initiateRefund).toHaveBeenCalledTimes(1)
})

it('Package D: verified gateway failure can use protected consented manual fallback without resetting timing or losing attempt history', async () => {
  const f = await packageDFixture(true)
  await f.payout().expect(200)
  await f.setProof('no_payout')
  await f
    .post(
      'reconcile',
      { reason: 'Verified original gateway request cannot pay' },
      'fallback-failure',
    )
    .expect(200)
  const old = await refundModel(context.db.connection).findById(f.refundId).orFail(),
    beforeApproval = old.approvedAt?.getTime(),
    timing = old.toObject().timingSnapshot
  await f
    .post(
      'review',
      { decision: 'approve', method: 'manual_bank', reason: 'Unqualified fallback' },
      'unqualified-fallback',
    )
    .expect(503)
  let proof: RefundOutcomeProof | undefined
  const options = {
    ...refundDevelopmentPolicy,
    authorizations: [
      {
        orderId: f.orderId,
        basis: 'payment_correction' as const,
        approval: {
          policyVersion: old.policyVersion ?? '',
          method: 'manual_bank' as const,
          consentRequired: true,
          consentEvidenceRef: 'synthetic:fallback-consent',
          deliveryApproved: false,
        },
      },
    ],
  }
  const root = packageCRoot(
    { ...f.dependencies, options, verifyEvidence: async () => proof },
    f.clock,
  )
  const post = (suffix: string, body: object, key: string) =>
    packageCPost(root, f.admin, `/admin/refunds/${f.refundId}/${suffix}`, body, key)
  await post(
    'review',
    {
      decision: 'approve',
      method: 'manual_bank',
      consentEvidenceRef: 'synthetic:fallback-consent',
      reason: 'Protected original-policy fallback',
    },
    'approve-fallback',
  ).expect(200)
  f.advance()
  await post(
    'payout-attempts',
    { method: 'manual_bank', reason: 'Admit consented manual fallback' },
    'fallback-admit',
  ).expect(200)
  const attempt = await refundAttemptModel(context.db.connection)
    .findOne({ refundId: f.refundId })
    .sort({ attemptNumber: -1 })
    .orFail()
  expect(attempt.provider).toBe('manual')
  expect(attempt.refundTransId).toBeUndefined()
  f.advance()
  proof = {
    refundId: f.refundId,
    orderId: f.orderId,
    sourceCollectionId: old.sourceCollectionId.toHexString(),
    attemptId: attempt._id.toHexString(),
    amountPoisha: old.amountPoisha,
    outcome: 'paid',
    method: 'manual_bank',
    provider: 'manual',
    checkedAt: f.clock(),
    paidAt: f.clock(),
    evidenceDigest: 'f'.repeat(64),
    transferReference: 'qualified-fallback-transfer',
    evidenceRef: 'synthetic:fallback-proof',
    destinationMasked: 'bank ****9876',
    consentEvidenceRef: 'synthetic:fallback-consent',
    consentDigest: 'e'.repeat(64),
    consentAt: new Date(f.clock().getTime() - 500),
  }
  await post(
    'manual-confirmations',
    {
      transferReference: 'qualified-fallback-transfer',
      evidenceRef: 'synthetic:fallback-proof',
      reason: 'Independently verified fallback',
    },
    'fallback-confirm',
  ).expect(200)
  const row = await refundModel(context.db.connection).findById(f.refundId).orFail()
  expect(row.status).toBe('completed')
  expect(row.approvedAt?.getTime()).toBe(beforeApproval)
  expect(row.toObject().timingSnapshot).toEqual(timing)
  expect(
    await refundAttemptModel(context.db.connection).countDocuments({ refundId: f.refundId }),
  ).toBe(2)
  expect(f.initiateRefund).toHaveBeenCalledTimes(1)
})

import { Types } from 'mongoose'
import { expect, it, vi } from 'vitest'
import { refundReconciliationJob } from '../../../src/jobs/reconcile-refunds.job.js'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { createNotificationDeliveryService } from '../../../src/modules/notifications/notification-delivery.service.js'
import { createRefundMessageService } from '../../../src/modules/notifications/notification-template.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { returnNotificationOrderAccess } from '../../../src/modules/orders/order.service.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { refundNotificationProofAccess } from '../../../src/modules/refunds/payouts/refund-recovery.service.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { composeAuditAccess, composeRefundRecovery } from '../../../src/setup.js'
import { jobLeaseService } from '../../../src/shared/jobs/job-lease.service.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { packageDFixture } from '../../helpers/commerce/refunds.js'

registerCommerceFixture()

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

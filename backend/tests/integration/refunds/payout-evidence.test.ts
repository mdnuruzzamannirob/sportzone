import { Types } from 'mongoose'
import { expect, it, vi } from 'vitest'
import { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { manualEvidenceFixture } from '../../helpers/commerce/refunds.js'

registerCommerceFixture()

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

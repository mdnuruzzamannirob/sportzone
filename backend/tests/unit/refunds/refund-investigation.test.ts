import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  assessRefundRetry,
  createRefundInvestigationService,
} from '../../../src/modules/refunds/payouts/refund-investigation.service.js'
import { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'

const settings = {
  appEnv: 'test' as const,
  mode: 'sandbox' as const,
  storeId: 'synthetic-store',
  storePassword: 'synthetic-password',
  callbackOrigin: 'https://api.example.test',
  timeoutMs: 1000,
}
const merchantAccountKey = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
const expected = { bankTranId: 'bank', refundRefId: 'refund', merchantAccountKey }
const record = {
  APIConnect: 'DONE',
  status: 'refunded',
  bank_tran_id: 'bank',
  refund_ref_id: 'refund',
  refunded_on: '2026-10-31 12:00:00',
}
function service(response: unknown) {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
  return {
    verify: createRefundInvestigationService(createSslcommerzAdapter(settings, transport)),
    transport,
  }
}
describe('private refund status investigation', () => {
  it('preserves refunded as requiring independent identity/amount/time verification', async () => {
    const { verify, transport } = service(record)
    const result = await verify(expected)
    expect(result).toMatchObject({ state: 'independent_verification_required' })
    expect(JSON.stringify(result)).not.toContain('confirmed')
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('keeps processing pending and cancelled under investigation, never authorizing retry', async () => {
    expect(await service({ ...record, status: 'processing' }).verify(expected)).toMatchObject({
      state: 'pending',
    })
    expect(await service({ ...record, status: 'cancelled' }).verify(expected)).toMatchObject({
      state: 'investigate',
    })
    expect(await service({ ...record, status: 'unknown' }).verify(expected)).toEqual({
      state: 'investigate',
    })
  })
  it('rejects mismatched merchant and references without confirming', async () => {
    expect(
      await service(record).verify({ ...expected, merchantAccountKey: 'a'.repeat(64) }),
    ).toEqual({ state: 'investigate' })
    expect(await service({ ...record, bank_tran_id: 'another' }).verify(expected)).toEqual({
      state: 'investigate',
    })
    expect(await service({ ...record, refund_ref_id: 'another' }).verify(expected)).toEqual({
      state: 'investigate',
    })
  })
})
describe('private refund retry assessment', () => {
  const id = (value: string) => value.repeat(24)
  const initiatedAt = new Date('2026-10-31T00:00:00Z'),
    checkedAt = new Date('2026-10-31T00:01:00Z'),
    now = new Date('2026-10-31T00:02:00Z')
  const base = {
    refundId: id('1'),
    attemptId: id('2'),
    sourceCollectionId: id('3'),
    amountPoisha: 100,
    capacityStatus: 'reserved',
    attemptStatus: 'uncertain',
    initiatedAt,
    lastOperationAt: initiatedAt,
    otherOpenAttempts: 0,
    now,
  }
  const proof = {
    refundId: base.refundId,
    attemptId: base.attemptId,
    sourceCollectionId: base.sourceCollectionId,
    amountPoisha: 100,
    outcome: 'verified_no_payout',
    checkedAt,
    evidenceDigest: 'a'.repeat(64),
  }
  it('never treats a timeout, unknown result or pending attempt as safe retry', () => {
    expect(assessRefundRetry(base)).toEqual({ state: 'investigate' })
    expect(assessRefundRetry({ ...base, proof, attemptStatus: 'submitted' })).toEqual({
      state: 'investigate',
    })
    expect(assessRefundRetry({ ...base, proof, otherOpenAttempts: 1 })).toEqual({
      state: 'investigate',
    })
    expect(assessRefundRetry({ ...base, proof, capacityStatus: 'released' })).toEqual({
      state: 'investigate',
    })
  })
  it('requires bound, current verified no-payout evidence even for failed attempts', () => {
    for (const wrong of [
      { ...proof, refundId: id('4') },
      { ...proof, attemptId: id('4') },
      { ...proof, sourceCollectionId: id('4') },
      { ...proof, amountPoisha: 101 },
      { ...proof, checkedAt: new Date(0) },
      { ...proof, checkedAt: initiatedAt },
      { ...proof, checkedAt: new Date('2026-11-01') },
    ])
      expect(assessRefundRetry({ ...base, proof: wrong, attemptStatus: 'failed' })).toEqual({
        state: 'investigate',
      })
    expect(assessRefundRetry({ ...base, proof, attemptStatus: 'failed' })).toEqual({
      state: 'retry_review_required',
      evidenceDigest: proof.evidenceDigest,
    })
    expect(assessRefundRetry({ ...base, proof, attemptStatus: 'confirmed' })).toEqual({
      state: 'investigate',
    })
    expect(
      assessRefundRetry({
        ...base,
        proof,
        attemptStatus: 'confirmed',
        capacityStatus: 'completed',
      }),
    ).toEqual({ state: 'already_confirmed' })
  })
})

import { createHash } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { protectedRefundEvidence } from '../../../src/modules/refunds/payouts/refund-evidence.service.js'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sportzone-refund-evidence-'))
  roots.push(root)
  const fact = {
    refundId: 'a'.repeat(24),
    orderId: 'b'.repeat(24),
    sourceCollectionId: 'c'.repeat(24),
    attemptId: 'd'.repeat(24),
    amountPoisha: 1200,
    outcome: 'paid',
    method: 'manual_bank',
    provider: 'manual',
    checkedAt: '2026-11-02T01:00:00.000Z',
    paidAt: '2026-11-02T00:59:00.000Z',
    transferReference: 'synthetic-transfer',
    evidenceRef: 'synthetic-record',
    destinationMasked: 'bank ****1234',
    consentDigest: 'e'.repeat(64),
    consentAt: '2026-11-01T00:00:00.000Z',
  }
  const artifact = join(root, 'receipt.json'),
    path = join(root, 'registry.json'),
    bytes = JSON.stringify(fact),
    evidenceDigest = createHash('sha256').update(bytes).digest('hex')
  await writeFile(artifact, bytes, { mode: 0o600 })
  const registry = {
    version: 1,
    entries: [
      {
        refundId: fact.refundId,
        attemptId: fact.attemptId,
        artifactFile: 'receipt.json',
        evidenceDigest,
      },
    ],
  }
  await writeFile(path, JSON.stringify(registry), { mode: 0o600 })
  return { fact, artifact, path, registry, verify: protectedRefundEvidence(path) }
}
it('binds the independent artifact digest and exact refund/attempt identity without provider effects', async () => {
  const f = await fixture(),
    result = await f.verify({ refundId: f.fact.refundId, attemptId: f.fact.attemptId })
  expect(result?.amountPoisha).toBe(1200)
  expect(result?.paidAt).toEqual(new Date(f.fact.paidAt))
  expect(await f.verify({ refundId: 'f'.repeat(24), attemptId: f.fact.attemptId })).toBeUndefined()
})
it('rejects mutated artifacts and unsafe public-readable evidence files', async () => {
  const f = await fixture()
  await writeFile(f.artifact, JSON.stringify({ ...f.fact, amountPoisha: 1 }))
  await expect(
    f.verify({ refundId: f.fact.refundId, attemptId: f.fact.attemptId }),
  ).rejects.toThrow('digest mismatch')
  await chmod(f.path, 0o644)
  await expect(
    f.verify({ refundId: f.fact.refundId, attemptId: f.fact.attemptId }),
  ).rejects.toThrow('Invalid protected source')
})
it('refuses duplicate registry identities and invalid protected path configuration', async () => {
  const f = await fixture()
  await writeFile(
    f.path,
    JSON.stringify({ ...f.registry, entries: [...f.registry.entries, ...f.registry.entries] }),
  )
  await expect(
    f.verify({ refundId: f.fact.refundId, attemptId: f.fact.attemptId }),
  ).rejects.toThrow('Ambiguous proof')
  await expect(
    protectedRefundEvidence('relative.json')({
      refundId: f.fact.refundId,
      attemptId: f.fact.attemptId,
    }),
  ).rejects.toThrow('Invalid protected path')
})

it('rejects zone-less provider-like timestamp strings even when artifact integrity matches', async () => {
  const f = await fixture(),
    bytes = JSON.stringify({ ...f.fact, checkedAt: '2026-11-02 01:00:00' })
  await writeFile(f.artifact, bytes)
  await writeFile(
    f.path,
    JSON.stringify({
      ...f.registry,
      entries: f.registry.entries.map((e) => ({
        ...e,
        evidenceDigest: createHash('sha256').update(bytes).digest('hex'),
      })),
    }),
  )
  await expect(
    f.verify({ refundId: f.fact.refundId, attemptId: f.fact.attemptId }),
  ).rejects.toThrow()
})

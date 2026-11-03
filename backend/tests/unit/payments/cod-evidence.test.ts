import { createHash } from 'node:crypto'
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { protectedCodCollectionEvidence } from '../../../src/modules/payments/collections/cod-evidence.service.js'

const temporary: string[] = []
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sportzone-cod-proof-'))
  temporary.push(root)
  const artifactPath = join(root, 'original.txt'),
    path = join(root, 'receipts.json')
  const bytes = 'SYNTHETIC TEST RECEIPT ONLY'
  await writeFile(artifactPath, bytes, { mode: 0o600 })
  const input = {
    paymentId: 'a'.repeat(24),
    amountPoisha: 12345,
    collectionReference: 'synthetic-original',
    evidenceRef: 'synthetic:private-receipt',
    reason: 'Test only',
  }
  const row = {
    paymentId: input.paymentId,
    amountPoisha: input.amountPoisha,
    collectionReference: input.collectionReference,
    evidenceRef: input.evidenceRef,
    collectedAt: '2026-10-01T00:00:00Z',
    verifiedAt: '2026-10-02T00:00:00Z',
    verifiedBy: 'Synthetic test operator',
    artifactPath,
    digest: createHash('sha256').update(bytes).digest('hex'),
  }
  const save = (receipts = [row]) =>
    writeFile(path, JSON.stringify({ version: 1, receipts }), { mode: 0o600 })
  await save()
  return {
    root,
    path,
    artifactPath,
    input,
    row,
    save,
    verify: protectedCodCollectionEvidence(path, () => new Date('2026-11-01T00:00:00Z')),
  }
}
it('verifies protected original bytes and emits only the existing bound proof DTO', async () => {
  const f = await fixture(),
    result = await f.verify(f.input)
  expect(result.amountPoisha).toBe(12345)
  expect(result.collectedAt).toEqual(new Date(f.row.collectedAt))
  expect(result).not.toHaveProperty('artifactPath')
  expect(result).not.toHaveProperty('verifiedBy')
})
it('rejects amount, payment and evidence substitution before returning any proof', async () => {
  const f = await fixture()
  for (const changed of [
    { amountPoisha: 1 },
    { paymentId: 'b'.repeat(24) },
    { evidenceRef: '/etc/passwd' },
  ])
    await expect(f.verify({ ...f.input, ...changed })).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    })
})
it('rejects unknown receipts and changed original bytes', async () => {
  const f = await fixture()
  await expect(f.verify({ ...f.input, collectionReference: 'missing' })).rejects.toMatchObject({
    code: 'BUSINESS_RULE_VIOLATION',
  })
  await writeFile(f.artifactPath, 'TAMPERED SYNTHETIC ORIGINAL')
  await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
})
it('rejects ambiguous sources and future or reversed verification times', async () => {
  const f = await fixture()
  await f.save([f.row, f.row])
  await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  for (const verifiedAt of ['2027-01-01T00:00:00Z', '2026-09-01T00:00:00Z']) {
    await f.save([{ ...f.row, verifiedAt }])
    await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  }
})
it('rejects shared-readable source, shared-readable original and symlink original', async () => {
  const f = await fixture()
  await chmod(f.path, 0o644)
  await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  await chmod(f.path, 0o600)
  await chmod(f.artifactPath, 0o644)
  await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  await chmod(f.artifactPath, 0o600)
  const link = join(f.root, 'link')
  await symlink(f.artifactPath, link)
  await f.save([{ ...f.row, artifactPath: link }])
  await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
})
it('rejects missing, relative and oversized source without leaking paths', async () => {
  const f = await fixture()
  for (const path of [join(f.root, 'missing'), 'relative.json'])
    await expect(protectedCodCollectionEvidence(path)(f.input)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  await writeFile(f.path, Buffer.alloc(1000001))
  await expect(f.verify(f.input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
})

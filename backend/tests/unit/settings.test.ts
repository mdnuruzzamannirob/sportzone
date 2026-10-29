import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { loadPolicyApprovals } from '../../src/config/settings.js'
import { settingsPatch } from '../../src/modules/settings/settings.schema.js'
import {
  policyDraftInput,
  policyDraftPatch,
  policyKey,
} from '../../src/modules/settings/policy.schema.js'
it('rejects unsafe public contact, internal destinations, private configuration and invalid thresholds', () => {
  for (const value of [
    {},
    { lowStockThreshold: -1 },
    { lowStockThreshold: 1.5 },
    { lowStockThreshold: Number.MAX_SAFE_INTEGER + 1 },
    { contact: {} },
    { contact: { email: 'invalid' } },
    { contact: { password: 'private' } },
    { contact: { website: 'https://user:password@example.test' } },
    { activePolicyVersions: { terms: 'fake' } },
    { paymentChannels: {} },
    ...['//foreign.test', '/\\foreign.test', 'https://foreign.test', '/\nforeign'].map((href) => ({
      homepageBanner: { assetId: 'a'.repeat(24), title: 'Synthetic', alt: 'Synthetic', href },
    })),
  ])
    expect(settingsPatch.safeParse(value).success).toBe(false)
  expect(settingsPatch.parse({ homepageBanner: null })).toEqual({ homepageBanner: null })
})
it('accepts all policy types as bounded plain text but forbids client-assigned approval or identity', () => {
  for (const type of [
    'shipping',
    'cancellation',
    'returns',
    'refunds',
    'privacy',
    'terms',
    'complaints',
  ])
    expect(policyDraftInput.safeParse({ type, content: 'Synthetic\nplain text' }).success).toBe(
      true,
    )
  for (const body of [
    { type: 'terms', content: '<b>HTML</b>' },
    { type: 'terms', content: 'x\u0000' },
    { type: 'terms', content: 'x'.repeat(50001) },
    { type: 'terms', content: 'Synthetic', status: 'approved' },
  ])
    expect(policyDraftInput.safeParse(body).success).toBe(false)
  expect(policyDraftPatch.safeParse({}).success).toBe(false)
  expect(policyDraftPatch.safeParse({ version: 'client-version' }).success).toBe(false)
  expect(policyKey.safeParse('x'.repeat(129)).success).toBe(false)
})
it('fails closed without a protected evidence register and validates its bounded unique records', async () => {
  expect(await loadPolicyApprovals({})).toEqual([])
  const dir = await mkdtemp(join(tmpdir(), 'sportzone-settings-'))
  const path = join(dir, 'approvals.json'),
    env = { POLICY_APPROVALS_FILE: path }
  const proof = {
    evidenceRef: 'synthetic:approval',
    type: 'terms',
    version: 'synthetic',
    contentDigest: 'a'.repeat(64),
    effectiveAt: '2026-01-01T00:00:00Z',
    approvedAt: '2026-01-01T00:00:00Z',
    approvedBy: 'Synthetic reviewer',
  }
  try {
    await expect(loadPolicyApprovals(env)).rejects.toThrow('Invalid backend configuration')
    await writeFile(path, JSON.stringify([proof]))
    expect(await loadPolicyApprovals(env)).toEqual([proof])
    for (const invalid of [
      [proof, proof],
      [{ ...proof, contentDigest: 'wrong' }],
      [{ ...proof, approvedAt: '2999-01-01T00:00:00Z' }],
      [{ ...proof, privateSecret: 'forbidden' }],
    ]) {
      await writeFile(path, JSON.stringify(invalid))
      await expect(loadPolicyApprovals(env)).rejects.toThrow('Invalid backend configuration')
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

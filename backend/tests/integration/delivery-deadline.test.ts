import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { loadDeliveryDeadlinePolicy } from '../../src/config/delivery.js'
import { deliveryDeadlineDigest } from '../../src/modules/orders/delivery-deadline.service.js'
import { deliveryDeadlineRule } from '../../src/modules/orders/delivery-deadline.schema.js'
const rule = () =>
  deliveryDeadlineRule.parse({
    version: 'synthetic-only',
    timezone: 'Asia/Dhaka',
    effectiveFrom: '2026-01-01T00:00:00Z',
    target: { startEvent: 'confirmedAt', calendarDays: 14 },
    legalCaps: [],
  })
const manifest = () => {
  const value = rule()
  return {
    rule: value,
    review: {
      evidenceRef: 'synthetic:review',
      approvedAt: '2026-01-01T00:00:00Z',
      approvedBy: 'Synthetic test reviewer',
      ruleDigest: deliveryDeadlineDigest(value),
    },
  }
}
it('loads a bounded exact rule/review manifest while absence remains unconfigured', async () => {
  expect(await loadDeliveryDeadlinePolicy({})).toBeUndefined()
  const dir = await mkdtemp(join(tmpdir(), 'sportzone-deadline-')),
    path = join(dir, 'rule.json')
  try {
    const body = manifest()
    await writeFile(path, JSON.stringify(body))
    expect(await loadDeliveryDeadlinePolicy({ DELIVERY_DEADLINE_POLICY_FILE: path })).toEqual(body)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
it('rejects missing/invalid/oversized manifests, wrong digest, future review and unknown fields with sanitized errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sportzone-deadline-')),
    path = join(dir, 'rule.json'),
    env = { DELIVERY_DEADLINE_POLICY_FILE: path }
  try {
    await expect(loadDeliveryDeadlinePolicy(env)).rejects.toMatchObject({
      fields: ['DELIVERY_DEADLINE_POLICY_FILE'],
    })
    const original = manifest()
    for (const raw of [
      'invalid JSON',
      'x'.repeat(100001),
      JSON.stringify({ ...original, review: { ...original.review, ruleDigest: 'a'.repeat(64) } }),
      JSON.stringify({
        ...original,
        review: { ...original.review, approvedAt: '2999-01-01T00:00:00Z' },
      }),
      JSON.stringify({ ...original, secret: 'synthetic-only' }),
      JSON.stringify({ rule: original.rule }),
    ]) {
      await writeFile(path, raw)
      await expect(loadDeliveryDeadlinePolicy(env)).rejects.toMatchObject({
        fields: ['DELIVERY_DEADLINE_POLICY_FILE'],
        message: 'Invalid backend configuration.',
      })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
it('runs compiled technical preflight without DB/network and fails closed for absent or ineligible rules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sportzone-deadline-')),
    path = join(dir, 'rule.json')
  const run = (file?: string) =>
    spawnSync(process.execPath, ['scripts/check-delivery-deadline.mjs'], {
      env: file ? { DELIVERY_DEADLINE_POLICY_FILE: file } : {},
      encoding: 'utf8',
      timeout: 15000,
    })
  try {
    const missing = run()
    expect(missing.status).toBe(1)
    expect(JSON.parse(missing.stdout)).toMatchObject({
      status: 'under_review',
      ruleVersion: 'unconfigured',
    })
    const body = manifest()
    await writeFile(path, JSON.stringify(body))
    const ready = run(path)
    expect(ready.status, ready.stderr).toBe(0)
    expect(JSON.parse(ready.stdout)).toEqual({
      event: 'delivery_deadline_preflight',
      status: 'awaiting_start',
      startEvent: 'confirmedAt',
      ruleVersion: body.rule.version,
    })
    expect(ready.stdout).not.toContain('Synthetic test reviewer')
    body.rule.effectiveFrom = '2999-01-01T00:00:00Z'
    body.review.ruleDigest = deliveryDeadlineDigest(body.rule)
    await writeFile(path, JSON.stringify(body))
    expect(run(path).status).toBe(1)
    await writeFile(path, 'invalid JSON')
    const invalid = run(path)
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).not.toContain(path)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

import { afterEach, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOrderOperationsOptions } from '../../src/config/order-operations.js'
import { deliveryDeadlineDigest } from '../../src/modules/orders/delivery-deadline.service.js'
const directories: string[] = []
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sportzone-operations-config-'))
  directories.push(root)
  const rule = {
    version: 'synthetic-reviewed',
    timezone: 'Asia/Dhaka',
    effectiveFrom: '2026-01-01T00:00:00Z',
    target: { startEvent: 'confirmedAt', calendarDays: 14 },
    legalCaps: [],
  }
  const deadline = {
    rule,
    review: {
      ruleDigest: deliveryDeadlineDigest(rule),
      approvedAt: '2026-01-01T00:00:00Z',
      approvedBy: 'Synthetic reviewer',
      evidenceRef: 'synthetic:policy',
    },
  }
  const authorization = {
    orderId: 'a'.repeat(24),
    requestId: 'b'.repeat(24),
    approvedAt: '2026-01-01T00:00:00Z',
    approvedBy: 'Synthetic operator',
    evidenceRef: 'synthetic:cancellation',
    approval: {
      policyVersion: 'synthetic-policy',
      method: 'manual_bank',
      consentRequired: false,
      deliveryApproved: true,
    },
  }
  const cash = join(root, 'cash.json'),
    policy = join(root, 'policy.json'),
    delivery = join(root, 'delivery.json')
  await writeFile(cash, JSON.stringify({ version: 1, receipts: [] }), { mode: 0o600 })
  await writeFile(policy, JSON.stringify({ version: 1, authorizations: [authorization] }), {
    mode: 0o600,
  })
  await writeFile(delivery, JSON.stringify(deadline), { mode: 0o600 })
  const env = {
    APP_ENV: 'test',
    ORDER_OPERATIONS_ENABLED: 'true',
    CUSTOMER_AUTH_ENABLED: 'true',
    ADMIN_AUTH_ENABLED: 'true',
    CUSTOMER_ORDER_READ_ENABLED: 'true',
    DELIVERY_DEADLINE_POLICY_FILE: delivery,
    COD_COLLECTION_EVIDENCE_FILE: cash,
    CANCELLATION_REFUND_AUTHORIZATIONS_FILE: policy,
  }
  return { env, authorization, policy, cash }
}
it('loads explicit protected policy, receipt and bound cancellation sources without fabricated defaults', async () => {
  const f = await fixture(),
    loaded = await loadOrderOperationsOptions(f.env)
  expect(loaded?.deadline.rule.version).toBe('synthetic-reviewed')
  expect(loaded?.cashReceiptFile).toBe(f.cash)
  expect(loaded?.cancellationAuthorizations).toEqual([f.authorization])
  expect(await loadOrderOperationsOptions({})).toBeUndefined()
  expect(
    await loadOrderOperationsOptions({ ...f.env, ORDER_OPERATIONS_ENABLED: 'false' }),
  ).toBeUndefined()
})
it('refuses deployed activation, missing auth/read admission and invalid booleans', async () => {
  const f = await fixture()
  for (const changed of [
    { APP_ENV: 'staging' },
    { APP_ENV: 'production' },
    { ADMIN_AUTH_ENABLED: 'false' },
    { CUSTOMER_ORDER_READ_ENABLED: 'false' },
    { ORDER_OPERATIONS_ENABLED: 'yes' },
  ])
    await expect(loadOrderOperationsOptions({ ...f.env, ...changed })).rejects.toThrow(
      'Invalid backend configuration.',
    )
})
it('refuses absent deadline, missing sources, public-readable sources and ambiguous authority', async () => {
  const f = await fixture()
  for (const changed of [
    { DELIVERY_DEADLINE_POLICY_FILE: '' },
    { COD_COLLECTION_EVIDENCE_FILE: '' },
  ])
    await expect(loadOrderOperationsOptions({ ...f.env, ...changed })).rejects.toThrow(
      'Invalid backend configuration.',
    )
  await chmod(f.policy, 0o644)
  await expect(loadOrderOperationsOptions(f.env)).rejects.toThrow('Invalid backend configuration.')
  await chmod(f.policy, 0o600)
  await writeFile(
    f.policy,
    JSON.stringify({ version: 1, authorizations: [f.authorization, f.authorization] }),
  )
  await expect(loadOrderOperationsOptions(f.env)).rejects.toThrow('Invalid backend configuration.')
})
it('refuses future or malformed approvals and oversized source without disclosing its contents', async () => {
  const f = await fixture()
  await writeFile(
    f.policy,
    JSON.stringify({
      version: 1,
      authorizations: [{ ...f.authorization, approvedAt: '2999-01-01T00:00:00Z' }],
    }),
  )
  await expect(loadOrderOperationsOptions(f.env)).rejects.toThrow('Invalid backend configuration.')
  await writeFile(f.policy, 'not json')
  await expect(loadOrderOperationsOptions(f.env)).rejects.toThrow('Invalid backend configuration.')
  await writeFile(f.cash, Buffer.alloc(1000001))
  await expect(loadOrderOperationsOptions(f.env)).rejects.toThrow('Invalid backend configuration.')
})

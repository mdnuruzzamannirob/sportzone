import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  loadRefundOperationsOptions,
  refundOperationsOptions,
} from '../../../src/config/refunds.js'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const env = { APP_ENV: 'test', ADMIN_AUTH_ENABLED: 'true', REFUND_OPERATIONS_ENABLED: 'true' }
it('refund operations are default off and opt-in local/test uses the development policy only', async () => {
  expect(await loadRefundOperationsOptions({})).toBeUndefined()
  expect(
    await loadRefundOperationsOptions({ ...env, REFUND_OPERATIONS_ENABLED: 'false' }),
  ).toBeUndefined()
  expect(await loadRefundOperationsOptions(env)).toEqual({
    policyVersion: 'sportzone-refunds-v1',
    authorizations: [],
  })
})
it('refund operations reject deployed activation, missing admin identity and malformed flags', async () => {
  for (const override of [
    { APP_ENV: 'production' },
    { APP_ENV: 'staging' },
    { ADMIN_AUTH_ENABLED: 'false' },
    { REFUND_OPERATIONS_ENABLED: 'yes' },
  ])
    await expect(loadRefundOperationsOptions({ ...env, ...override })).rejects.toThrow(
      'Invalid backend configuration.',
    )
})
it('refund policy files require protected permissions, exact basis identity and unambiguous authorizations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sportzone-refund-policy-'))
  roots.push(root)
  const path = join(root, 'policy.json'),
    authorization = {
      orderId: 'a'.repeat(24),
      basis: 'shortage',
      basisRefId: 'b'.repeat(24),
      approval: {
        policyVersion: 'synthetic',
        method: 'manual_bank',
        consentRequired: true,
        consentEvidenceRef: 'synthetic-consent',
        deliveryApproved: false,
      },
    },
    options = { policyVersion: 'v1', authorizations: [authorization] }
  await writeFile(path, JSON.stringify(options), { mode: 0o600 })
  expect(await loadRefundOperationsOptions({ ...env, REFUND_POLICY_FILE: path })).toEqual(options)
  expect(
    refundOperationsOptions.safeParse({
      ...options,
      authorizations: [authorization, authorization],
    }).success,
  ).toBe(false)
  expect(
    refundOperationsOptions.safeParse({
      ...options,
      authorizations: [{ ...authorization, basis: 'payment_correction' }],
    }).success,
  ).toBe(false)
  await writeFile(path, JSON.stringify({ ...options, waiveCollections: true }))
  await expect(loadRefundOperationsOptions({ ...env, REFUND_POLICY_FILE: path })).rejects.toThrow(
    'Invalid backend configuration.',
  )
  await writeFile(path, JSON.stringify(options))
  await chmod(path, 0o644)
  await expect(loadRefundOperationsOptions({ ...env, REFUND_POLICY_FILE: path })).rejects.toThrow(
    'Invalid backend configuration.',
  )
})

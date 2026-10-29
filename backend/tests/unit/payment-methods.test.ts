import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  loadPaymentChannelApprovals,
  loadPaymentInitiationOptions,
} from '../../src/config/payments.js'
import { ConfigurationError } from '../../src/shared/errors/configuration-error.js'
import {
  paymentMethodsQuery,
  type PaymentChannelApproval,
} from '../../src/modules/payments/payment-eligibility.schema.js'
import { verifiedMerchantChannels } from '../../src/modules/payments/payment-eligibility.service.js'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const evidence = 'Synthetic merchant channel verification only; no live acceptance.'
let paths: string[] = []
afterEach(async () => {
  for (const path of paths) await rm(path, { recursive: true, force: true })
  paths = []
})
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'sportzone-channel-'))
  paths.push(dir)
  const path = join(dir, 'approval.json')
  await writeFile(join(dir, 'evidence.txt'), evidence)
  const now = Date.now()
  const row: PaymentChannelApproval = {
    appEnv: 'test',
    mode: 'sandbox',
    channel: 'bkash',
    merchantAccountKey: hash('sandbox\0synthetic-store'),
    gatewayKey: 'bkash',
    minPoisha: 1000,
    maxPoisha: 50000,
    verifiedAt: new Date(now - 1000).toISOString(),
    validUntil: new Date(now + 60000).toISOString(),
    approvedBy: 'Synthetic reviewer',
    evidenceRef: 'synthetic:merchant-evidence',
    evidenceFile: 'evidence.txt',
    evidenceDigest: hash(evidence),
  }
  const env = {
    APP_ENV: 'test',
    SSLCOMMERZ_ADAPTER_ENABLED: 'true',
    SSLCOMMERZ_MODE: 'sandbox',
    SSLCOMMERZ_STORE_ID: 'synthetic-store',
    SSLCOMMERZ_STORE_PASSWORD: 'synthetic-password',
    SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test',
    SSLCOMMERZ_TIMEOUT_MS: '1000',
    PAYMENT_CHANNEL_APPROVALS_FILE: path,
  }
  await writeFile(path, JSON.stringify([row]))
  return { path, env, row, now, dir }
}
it('requires no credential/file for absent approvals and verifies operator evidence before loading capabilities', async () => {
  expect(await loadPaymentChannelApprovals({})).toEqual([])
  const { env, row } = await fixture()
  expect(await loadPaymentChannelApprovals(env)).toEqual([row])
})
it.each([
  { appEnv: 'staging' },
  { mode: 'live' },
  { merchantAccountKey: 'a'.repeat(64) },
  { verifiedAt: '2099-01-01T00:00:00Z' },
  { validUntil: '2000-01-01T00:00:00Z' },
  { channel: 'visacard' },
  { evidenceDigest: 'a'.repeat(64) },
  { evidenceFile: '../evidence.txt' },
  { evidenceFile: 'missing.txt' },
  { minPoisha: 999 },
  { maxPoisha: 50000001 },
  { minPoisha: 50001 },
  { approvedBy: '' },
  { evidenceRef: '' },
  { gatewayKey: '' },
])('fails closed on invalid/mismatched evidence %j', async (patch) => {
  const { env, path, row } = await fixture()
  await writeFile(path, JSON.stringify([{ ...row, ...patch }]))
  await expect(loadPaymentChannelApprovals(env)).rejects.toBeInstanceOf(ConfigurationError)
})
it('refuses duplicate qualifications, malformed/oversized manifests and disabled adapter composition', async () => {
  const { env, path, row } = await fixture()
  for (const body of [JSON.stringify([row, row]), '{bad-json', 'x'.repeat(1000001)]) {
    await writeFile(path, body)
    await expect(loadPaymentChannelApprovals(env)).rejects.toBeInstanceOf(ConfigurationError)
  }
  await writeFile(path, JSON.stringify([row]))
  await expect(
    loadPaymentChannelApprovals({ ...env, SSLCOMMERZ_ADAPTER_ENABLED: 'false' }),
  ).rejects.toBeInstanceOf(ConfigurationError)
  await expect(
    loadPaymentChannelApprovals({ ...env, APP_ENV: 'production' }),
  ).rejects.toBeInstanceOf(ConfigurationError)
})
it('rejects empty/tampered/oversized underlying artifacts independently of valid-looking metadata', async () => {
  const { env, dir } = await fixture()
  for (const bytes of ['', 'tampered', 'x'.repeat(1000001)]) {
    await writeFile(join(dir, 'evidence.txt'), bytes)
    await expect(loadPaymentChannelApprovals(env)).rejects.toBeInstanceOf(ConfigurationError)
  }
})
it('expires approved capabilities on the read clock without treating configuration as eternal activation', async () => {
  const { row, now } = await fixture()
  let at = now
  const read = verifiedMerchantChannels([row], () => new Date(at))
  // Lifetime filtering is pure; this capability never accesses a session or provider.
  expect(await read()).toEqual([
    { channel: 'bkash', active: true, minPoisha: 1000, maxPoisha: 50000 },
  ])
  at = Date.parse(row.validUntil)
  expect(await read()).toEqual([])
  at = Date.parse(row.verifiedAt) - 1
  expect(await read()).toEqual([])
})
it.each(['-1', '1.1', '1e3', '+1', '01', '9007199254740992', ['1000', '2000']])(
  'rejects ambiguous advisory amount %j',
  (amountPoisha) => {
    expect(paymentMethodsQuery.safeParse({ amountPoisha }).success).toBe(false)
  },
)

it('keeps initiation disabled by default and refuses unsafe/deployed activation without required prerequisites', () => {
  expect(loadPaymentInitiationOptions({})).toBeUndefined()
  const env = {
    APP_ENV: 'test',
    PAYMENT_INITIATION_ENABLED: 'true',
    CUSTOMER_AUTH_ENABLED: 'true',
    SSLCOMMERZ_ADAPTER_ENABLED: 'true',
    SSLCOMMERZ_MODE: 'sandbox',
    SSLCOMMERZ_STORE_ID: 'synthetic-store',
    SSLCOMMERZ_STORE_PASSWORD: 'synthetic-password',
    SSLCOMMERZ_CALLBACK_ORIGIN: 'https://api.example.test',
    SSLCOMMERZ_TIMEOUT_MS: '1000',
    PAYMENT_CHANNEL_APPROVALS_FILE: '/synthetic/reviewed.json',
  }
  expect(loadPaymentInitiationOptions(env)?.mode).toBe('sandbox')
  for (const patch of [
    { PAYMENT_INITIATION_ENABLED: 'yes' },
    { APP_ENV: 'staging' },
    { APP_ENV: 'production', SSLCOMMERZ_MODE: 'live' },
    { CUSTOMER_AUTH_ENABLED: 'false' },
    { SSLCOMMERZ_ADAPTER_ENABLED: 'false' },
    { PAYMENT_CHANNEL_APPROVALS_FILE: '' },
  ])
    expect(() => loadPaymentInitiationOptions({ ...env, ...patch })).toThrow(ConfigurationError)
})

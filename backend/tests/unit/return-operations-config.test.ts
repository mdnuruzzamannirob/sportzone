import { configuredReturnMedia } from '../../src/setup.js'
import { afterEach, expect, it } from 'vitest'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadReturnOperationsOptions } from '../../src/config/returns.js'
const directories: string[] = []
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
})
const env = {
  APP_ENV: 'test',
  RETURN_OPERATIONS_ENABLED: 'true',
  CUSTOMER_AUTH_ENABLED: 'true',
  ADMIN_AUTH_ENABLED: 'true',
}
it('return operations default off; explicit local/test uses only the PRD development baseline', async () => {
  expect(await loadReturnOperationsOptions({})).toBeUndefined()
  expect(
    await loadReturnOperationsOptions({ ...env, RETURN_OPERATIONS_ENABLED: 'false' }),
  ).toBeUndefined()
  expect(await loadReturnOperationsOptions(env)).toEqual({
    policyVersion: 'sportzone-returns-v1',
    exceptions: [],
  })
})
it('return operations refuse production/staging activation, missing auth and malformed switches', async () => {
  for (const addition of [
    { APP_ENV: 'production' },
    { APP_ENV: 'staging' },
    { CUSTOMER_AUTH_ENABLED: 'false' },
    { ADMIN_AUTH_ENABLED: 'false' },
    { RETURN_OPERATIONS_ENABLED: 'yes' },
  ])
    await expect(loadReturnOperationsOptions({ ...env, ...addition })).rejects.toThrow(
      'Invalid backend configuration.',
    )
})
it('return operations load protected exact exceptions and refuse ambiguity, public files or body-like policy overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sportzone-return-policy-'))
  directories.push(root)
  const path = join(root, 'policy.json')
  const exception = {
    orderId: 'a'.repeat(24),
    claimType: 'physical_return',
    exceptionBasis: 'Synthetic approved rights exception',
  }
  await writeFile(
    path,
    JSON.stringify({ policyVersion: 'synthetic-exceptions-v1', exceptions: [exception] }),
    { mode: 0o600 },
  )
  expect(
    (await loadReturnOperationsOptions({ ...env, RETURN_POLICY_FILE: path }))?.exceptions,
  ).toEqual([exception])
  await writeFile(path, JSON.stringify({ policyVersion: 'v1', exceptions: [exception, exception] }))
  await expect(loadReturnOperationsOptions({ ...env, RETURN_POLICY_FILE: path })).rejects.toThrow(
    'Invalid backend configuration.',
  )
  await writeFile(
    path,
    JSON.stringify({ policyVersion: 'v1', exceptions: [], waiveAllOwnership: true }),
  )
  await expect(loadReturnOperationsOptions({ ...env, RETURN_POLICY_FILE: path })).rejects.toThrow(
    'Invalid backend configuration.',
  )
  await chmod(path, 0o644)
  await expect(loadReturnOperationsOptions({ ...env, RETURN_POLICY_FILE: path })).rejects.toThrow(
    'Invalid backend configuration.',
  )
})

it('configured return media stays opt-in/local and requires complete canonical provider/scanner configuration', () => {
  expect(configuredReturnMedia({})).toBeUndefined()
  expect(() =>
    configuredReturnMedia({ ...env, MEDIA_ENABLED: 'true', APP_ENV: 'production' }),
  ).toThrow()
  expect(() =>
    configuredReturnMedia({ ...env, MEDIA_ENABLED: 'true', RETURN_OPERATIONS_ENABLED: 'false' }),
  ).toThrow()
  expect(() => configuredReturnMedia({ ...env, MEDIA_ENABLED: 'true' })).toThrow(
    'Invalid backend configuration.',
  )
})

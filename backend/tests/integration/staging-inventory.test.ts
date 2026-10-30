import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from 'node:crypto'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
beforeAll(async () => {
  fixture = await isolatedDatabase()
})
afterAll(async () => {
  await fixture?.close()
})
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
function run(extra: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    ['--import', './scripts/staging-inventory.mjs', '-e', "console.log('application_started')"],
    {
      env: {
        APP_ENV: 'staging',
        MONGODB_URI: fixture.replica.getUri(),
        MONGODB_DB_NAME: `${fixture.connection.name}_staging`,
        REPORT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        ...extra,
      },
      encoding: 'utf8',
      timeout: 20000,
    },
  )
}
it('emits only an authenticated encrypted read-only inventory before application startup', async () => {
  const result = run()
  expect(result.status).toBe(0)
  const [line, marker] = result.stdout.trim().split('\n')
  expect(marker).toBe('application_started')
  if (!line) throw new Error('Encrypted inventory missing')
  const envelope = JSON.parse(line)
  expect(envelope.event).toBe('encrypted_staging_inventory')
  expect(result.stdout).not.toContain(fixture.connection.name)
  const key = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.key, 'base64'),
  )
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const report = JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      cipher.final(),
    ]).toString(),
  )
  expect(report.databaseName).toBe(`${fixture.connection.name}_staging`)
  expect(report.collections).toHaveLength(3)
  expect(report.collections.every((row: { exists: boolean }) => !row.exists)).toBe(true)
  expect(
    await fixture.connection.getClient().db(report.databaseName).listCollections().toArray(),
  ).toEqual([])
})
it('refuses production, active features and missing encryption key before startup', () => {
  for (const env of [
    { APP_ENV: 'production' },
    { MEDIA_ENABLED: 'true' },
    { REPORT_PUBLIC_KEY: '' },
  ]) {
    const result = run(env)
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain('application_started')
    expect(result.stdout).not.toContain('encrypted_staging_inventory')
    expect(result.stderr).not.toContain(fixture.replica.getUri())
  }
})

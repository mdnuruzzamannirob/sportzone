import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('operator artifacts are encrypted, authenticatable and collision-safe without plaintext output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sportzone-operator-report-'))
  const source = join(directory, 'private.json'),
    target = join(directory, 'encrypted.json')
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const bytes = '{"privateOperatorMarker":"synthetic-inventory-only"}'
  const run = () =>
    spawnSync(process.execPath, ['scripts/encrypt-operator-report.mjs', source, target], {
      env: { REPORT_PUBLIC_KEY: key },
      encoding: 'utf8',
      timeout: 10000,
    })
  try {
    writeFileSync(source, bytes)
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain('synthetic-inventory-only')
    const encoded = readFileSync(target, 'utf8'),
      encrypted = JSON.parse(encoded)
    expect(encoded).not.toContain('synthetic-inventory-only')
    const symmetric = privateDecrypt(
      { key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(encrypted.key, 'base64'),
    )
    const decipher = createDecipheriv('aes-256-gcm', symmetric, Buffer.from(encrypted.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'))
    expect(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final(),
      ]).toString(),
    ).toBe(bytes)
    expect(run().status).toBe(1)
    expect(readFileSync(target, 'utf8')).toBe(encoded)
    const corrupt = createDecipheriv('aes-256-gcm', symmetric, Buffer.from(encrypted.iv, 'base64'))
    corrupt.setAuthTag(Buffer.alloc(16))
    corrupt.update(Buffer.from(encrypted.ciphertext, 'base64'))
    expect(() => corrupt.final()).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('missing operator public key produces no report artifact', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sportzone-missing-report-key-'))
  try {
    const source = join(directory, 'private.json'),
      target = join(directory, 'encrypted.json')
    writeFileSync(source, 'synthetic-private-marker')
    const result = spawnSync(
      process.execPath,
      ['scripts/encrypt-operator-report.mjs', source, target],
      { env: {}, encoding: 'utf8', timeout: 10000 },
    )
    expect(result.status).toBe(1)
    expect(existsSync(target)).toBe(false)
    expect(result.stderr).not.toContain('synthetic-private-marker')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

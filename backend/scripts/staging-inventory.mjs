import { createPublicKey, randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../dist/config/database.js'
import { inspectCatalogRollout } from '../dist/modules/catalog/catalog-rollout.service.js'

// Explicit staging operator preload: default read-only, apply only with a reviewed manifest.
// Healthcheck child processes must never execute a rollout or repeat the operator inventory.
let connection, directory
if (!process.argv[1]?.endsWith('/scripts/container-health.mjs')) {
  try {
    if (
      process.env.APP_ENV !== 'staging' ||
      !/^[a-z][a-z0-9_]{0,54}_staging$/.test(process.env.MONGODB_DB_NAME || '') ||
      Object.entries(process.env).some(
        ([key, value]) => key.endsWith('_ENABLED') && value === 'true',
      )
    )
      throw new Error('Staging with feature admission disabled required.')
    const key = createPublicKey({
      key: Buffer.from(process.env.REPORT_PUBLIC_KEY || '', 'base64'),
      format: 'der',
      type: 'spki',
    })
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048)
      throw new Error('Operator public key required.')
    const apply = process.env.STAGING_CATALOG_APPLY === 'true'
    if (
      (process.env.STAGING_CATALOG_APPLY !== undefined && !apply) ||
      Boolean(process.env.STAGING_CATALOG_APPROVAL) !== apply
    )
      throw new Error('Explicit reviewed apply configuration required.')
    let report,
      failed = false
    if (apply) {
      directory = await mkdtemp(join(tmpdir(), 'sportzone-reviewed-catalog-'))
      const approval = join(directory, 'approval.json'),
        result = join(directory, 'result.json')
      await writeFile(approval, process.env.STAGING_CATALOG_APPROVAL, { mode: 0o600 })
      try {
        await promisify(execFile)(
          process.execPath,
          ['scripts/staging-catalog.mjs', '--apply', approval, result],
          {
            env: { ...process.env, NODE_OPTIONS: '' },
            timeout: 60000,
            maxBuffer: 65536,
          },
        )
      } catch {
        failed = true
      }
      report = JSON.parse(await readFile(result, 'utf8'))
    } else {
      connection = await openDatabase(process.env.MONGODB_URI, process.env.MONGODB_DB_NAME)
      report = await inspectCatalogRollout(connection)
    }
    const symmetric = randomBytes(32),
      iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', symmetric, iv)
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report)), cipher.final()])
    console.log(
      JSON.stringify({
        event: 'encrypted_staging_inventory',
        operation: apply ? 'apply' : 'inventory',
        version: 1,
        algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
        key: publicEncrypt(
          { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
          symmetric,
        ).toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }),
    )
    if (failed) throw new Error('Reviewed catalog operation failed; retain encrypted result.')
  } catch {
    console.error('Staging catalog operation failed; no plaintext diagnostics emitted.')
    throw new Error('Staging inventory prerequisite failed.')
  } finally {
    await connection?.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}

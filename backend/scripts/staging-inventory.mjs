import { createPublicKey, randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto'
import { openDatabase } from '../dist/config/database.js'
import { inspectCatalogRollout } from '../dist/modules/catalog/catalog-rollout.service.js'

// Explicit staging-only Node preload. Read-only; no HTTP route, DDL or raw diagnostic output.
let connection
try {
  if (
    process.env.APP_ENV !== 'staging' ||
    !/^[a-z][a-z0-9_]{0,54}_staging$/.test(process.env.MONGODB_DB_NAME || '') ||
    Object.entries(process.env).some(([key, value]) => key.endsWith('_ENABLED') && value === 'true')
  )
    throw new Error('Staging with feature admission disabled required.')
  const key = createPublicKey({
    key: Buffer.from(process.env.REPORT_PUBLIC_KEY || '', 'base64'),
    format: 'der',
    type: 'spki',
  })
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048)
    throw new Error('Operator public key required.')
  connection = await openDatabase(process.env.MONGODB_URI, process.env.MONGODB_DB_NAME)
  const report = await inspectCatalogRollout(connection)
  const symmetric = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', symmetric, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report)), cipher.final()])
  console.log(
    JSON.stringify({
      event: 'encrypted_staging_inventory',
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
} catch {
  console.error('Read-only staging inventory failed; no plaintext diagnostics emitted.')
  throw new Error('Staging inventory prerequisite failed.')
} finally {
  await connection?.close()
}

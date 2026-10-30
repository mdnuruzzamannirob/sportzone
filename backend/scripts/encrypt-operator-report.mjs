import { randomBytes, createCipheriv, createPublicKey, publicEncrypt, constants } from 'node:crypto'
import { readFile, open } from 'node:fs/promises'

// Keep private staging diagnostics out of public repository Actions artifacts.
try {
  if (process.argv.length !== 4 || !process.env.REPORT_PUBLIC_KEY)
    throw new Error('Input required.')
  const key = createPublicKey({
    key: Buffer.from(process.env.REPORT_PUBLIC_KEY, 'base64'),
    format: 'der',
    type: 'spki',
  })
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048)
    throw new Error('Operator RSA key required.')
  const bytes = await readFile(process.argv[2])
  if (bytes.length > 1024 * 1024) throw new Error('Report too large.')
  const symmetric = randomBytes(32),
    iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', symmetric, iv)
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
  const result = {
    version: 1,
    algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
    key: publicEncrypt(
      { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      symmetric,
    ).toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
  const file = await open(process.argv[3], 'wx', 0o600)
  try {
    await file.writeFile(`${JSON.stringify(result)}\n`)
  } finally {
    await file.close()
  }
  console.log('Encrypted operator report written; no plaintext diagnostics emitted.')
} catch {
  console.error('Operator report encryption failed; no plaintext artifact is permitted.')
  process.exitCode = 1
}

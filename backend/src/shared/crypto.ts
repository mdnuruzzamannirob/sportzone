import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

type EncryptedEnvelope = {
  algorithm: 'AES-256-GCM'
  keyVersion: string
  nonce: Buffer
  ciphertext: Buffer
  authTag: Buffer
}

type EncryptionContext = (keyVersion: string) => Buffer

interface EncryptionKeyring {
  seal(plaintext: Buffer, context: EncryptionContext): EncryptedEnvelope
  open(envelope: EncryptedEnvelope, context: EncryptionContext): Buffer
}

// Callers own normalization and field order; this hashes the exact JSON representation.
function jsonDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function createEncryptionKeyring(
  activeVersion: string,
  keys: Readonly<Record<string, string>>,
): EncryptionKeyring {
  if (
    !/^[A-Za-z0-9_-]{1,32}$/.test(activeVersion) ||
    !Object.hasOwn(keys, activeVersion) ||
    Object.keys(keys).length > 8 ||
    Object.keys(keys).length < 1 ||
    Object.entries(keys).some(
      ([version, key]) =>
        !/^[A-Za-z0-9_-]{1,32}$/.test(version) ||
        !/^[a-f0-9]{64}$/.test(key) ||
        /^(.)\1+$/.test(key),
    ) ||
    new Set(Object.values(keys)).size !== Object.keys(keys).length
  )
    throw new Error('Invalid encryption key ring.')

  const ring = new Map(
    Object.entries(keys).map(([version, key]) => [version, Buffer.from(key, 'hex')]),
  )

  function seal(plaintext: Buffer, context: EncryptionContext): EncryptedEnvelope {
    const key = ring.get(activeVersion)
    if (!key) throw new Error('Encryption key unavailable.')
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: 16,
    })
    cipher.setAAD(context(activeVersion))
    return {
      algorithm: 'AES-256-GCM',
      keyVersion: activeVersion,
      nonce,
      ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]),
      authTag: cipher.getAuthTag(),
    }
  }

  function open(envelope: EncryptedEnvelope, context: EncryptionContext): Buffer {
    const key = ring.get(envelope.keyVersion)
    if (
      !key ||
      envelope.algorithm !== 'AES-256-GCM' ||
      envelope.nonce.length !== 12 ||
      envelope.authTag.length !== 16
    )
      throw new Error('Encrypted material unavailable.')
    const decipher = createDecipheriv('aes-256-gcm', key, envelope.nonce, {
      authTagLength: 16,
    })
    decipher.setAAD(context(envelope.keyVersion))
    decipher.setAuthTag(envelope.authTag)
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()])
  }

  return { seal, open }
}

export { createEncryptionKeyring, jsonDigest }
export type { EncryptedEnvelope, EncryptionKeyring }

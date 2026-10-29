import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { ConfigurationError } from '../../../shared/errors/configuration-error.js'

export const proofPattern = /^[A-Za-z0-9_-]{43}$/
export const proofHash = (
  proof: string,
  purpose:
    | 'password_reset'
    | 'email_change'
    | 'admin_password_reset'
    | 'guest_order_access' = 'password_reset',
) =>
  createHash('sha256')
    .update(
      `sportzone:${purpose === 'password_reset' ? 'password-reset' : purpose === 'email_change' ? 'email-change' : purpose === 'guest_order_access' ? 'guest-order-access' : 'admin-password-reset'}:v1:${proof}`,
    )
    .digest('hex')
export type ProofBinding = {
  id: string
  email: string
  expiresAt: Date
  revision: number
  targetEmail?: string
  audience?: 'admin'
} & (
  | { userId: string; purpose?: 'password_reset' | 'email_change'; orderId?: never }
  | { userId?: never; orderId: string; purpose: 'guest_order_access' }
)
export type ProofEnvelope = {
  algorithm: 'AES-256-GCM'
  keyVersion: string
  nonce: Buffer
  ciphertext: Buffer
  authTag: Buffer
}
export function createProofEncryption(
  activeVersion: string,
  keys: Readonly<Record<string, string>>,
) {
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
    throw new ConfigurationError(['proof_encryption_keys'])
  const ring = new Map(
    Object.entries(keys).map(([version, key]) => [version, Buffer.from(key, 'hex')]),
  )
  const aad = (binding: ProofBinding, version: string) => {
    if (binding.purpose === 'email_change' && !binding.targetEmail)
      throw new Error('Invalid proof binding.')
    return Buffer.from(
      JSON.stringify([
        `sportzone:${binding.purpose ?? 'password_reset'}:v1`,
        binding.id,
        binding.purpose === 'guest_order_access' ? binding.orderId : binding.userId,
        binding.email,
        binding.expiresAt.toISOString(),
        binding.revision,
        version,
        ...(binding.purpose === 'email_change' ? [binding.targetEmail] : []),
        ...(binding.audience === 'admin' ? ['admin'] : []),
      ]),
    )
  }
  return {
    encrypt(proof: string, binding: ProofBinding): ProofEnvelope {
      if (!proofPattern.test(proof)) throw new Error('Invalid proof material.')
      const key = ring.get(activeVersion)
      if (!key) throw new Error('Proof key unavailable.')
      const nonce = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, nonce, {
        authTagLength: 16,
      })
      cipher.setAAD(aad(binding, activeVersion))
      return {
        algorithm: 'AES-256-GCM',
        keyVersion: activeVersion,
        nonce,
        ciphertext: Buffer.concat([cipher.update(proof, 'utf8'), cipher.final()]),
        authTag: cipher.getAuthTag(),
      }
    },
    decrypt(envelope: ProofEnvelope, binding: ProofBinding) {
      // All errors deliberately hide key IDs, ciphertext, destination and proof material.
      try {
        const key = ring.get(envelope.keyVersion)
        if (
          !key ||
          envelope.algorithm !== 'AES-256-GCM' ||
          envelope.nonce.length !== 12 ||
          envelope.authTag.length !== 16 ||
          envelope.ciphertext.length !== 43
        )
          throw new Error()
        const decipher = createDecipheriv('aes-256-gcm', key, envelope.nonce, {
          authTagLength: 16,
        })
        decipher.setAAD(aad(binding, envelope.keyVersion))
        decipher.setAuthTag(envelope.authTag)
        const proof = Buffer.concat([
          decipher.update(envelope.ciphertext),
          decipher.final(),
        ]).toString('utf8')
        if (!proofPattern.test(proof)) throw new Error()
        return proof
      } catch {
        throw new Error('Proof delivery material unavailable.')
      }
    },
  }
}
export type ProofEncryption = ReturnType<typeof createProofEncryption>

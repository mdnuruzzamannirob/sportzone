import { createHash } from 'node:crypto'
import {
  createEncryptionKeyring,
  type EncryptionKeyring,
  type EncryptedEnvelope,
} from '../../../shared/crypto.js'
import { ConfigurationError } from '../../../shared/errors/configuration-error.js'

const proofPattern = /^[A-Za-z0-9_-]{43}$/
const proofHash = (
  proof: string,
  purpose:
    | 'password_reset'
    | 'email_verify'
    | 'email_change'
    | 'admin_password_reset'
    | 'guest_order_access' = 'password_reset',
) =>
  createHash('sha256')
    .update(
      `sportzone:${purpose === 'password_reset' ? 'password-reset' : purpose === 'email_verify' ? 'email-verify' : purpose === 'email_change' ? 'email-change' : purpose === 'guest_order_access' ? 'guest-order-access' : 'admin-password-reset'}:v1:${proof}`,
    )
    .digest('hex')
type ProofBinding = {
  id: string
  email: string
  expiresAt: Date
  revision: number
  targetEmail?: string
  audience?: 'admin'
} & (
  | {
      userId: string
      purpose?: 'password_reset' | 'email_change' | 'email_verify'
      orderId?: never
    }
  | { userId?: never; orderId: string; purpose: 'guest_order_access' }
)
type ProofEnvelope = EncryptedEnvelope

// Binding and proof validation stay auth-owned; the shared keyring only implements AEAD mechanics.
function createProofCodec(keyring: EncryptionKeyring) {
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
      return keyring.seal(Buffer.from(proof, 'utf8'), (version) => aad(binding, version))
    },
    decrypt(envelope: ProofEnvelope, binding: ProofBinding) {
      // All errors deliberately hide key IDs, ciphertext, destination and proof material.
      try {
        if (envelope.ciphertext.length !== 43) throw new Error()
        const proof = keyring.open(envelope, (version) => aad(binding, version)).toString('utf8')
        if (!proofPattern.test(proof)) throw new Error()
        return proof
      } catch {
        throw new Error('Proof delivery material unavailable.')
      }
    },
  }
}

// Retain the existing isolated-caller factory; runtime configuration supplies the keyring directly.
function createProofEncryption(activeVersion: string, keys: Readonly<Record<string, string>>) {
  let keyring: EncryptionKeyring
  try {
    keyring = createEncryptionKeyring(activeVersion, keys)
  } catch {
    throw new ConfigurationError(['proof_encryption_keys'])
  }
  return { ...keyring, ...createProofCodec(keyring) }
}

type ProofEncryption = ReturnType<typeof createProofEncryption>

export { proofPattern, proofHash, createProofCodec, createProofEncryption }
export type { ProofBinding, ProofEnvelope, ProofEncryption }

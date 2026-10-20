import { randomBytes, createCipheriv, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadEmailChangeOptions } from '../src/config/recovery.js'
import { loadEnvironment } from '../src/config/environment.js'
import {
  createProofEncryption,
  proofHash,
  type ProofBinding,
} from '../src/modules/auth/proof-envelope.js'
import { testEnvironment } from './support/environment.js'
const keys = { current: randomBytes(32).toString('hex') }
const encryption = createProofEncryption('current', keys)
const proof = randomBytes(32).toString('base64url')
const binding: ProofBinding = {
  id: 'a'.repeat(24),
  userId: 'b'.repeat(24),
  email: 'old@example.test',
  targetEmail: 'new@example.test',
  purpose: 'email_change',
  revision: 1,
  expiresAt: new Date('2030-01-01'),
}
const environment = () => ({
  ...testEnvironment(),
  CUSTOMER_AUTH_ENABLED: 'true',
  CUSTOMER_SESSION_TTL_SECONDS: '600',
  ADMIN_SESSION_TTL_SECONDS: '300',
  BROWSER_CONTEXT_TTL_SECONDS: '120',
  SESSION_COOKIE_SAME_SITE: 'lax',
  EMAIL_CHANGE_ENABLED: 'true',
  EMAIL_CHANGE_TTL_SECONDS: '900',
  EMAIL_CHANGE_COOLDOWN_SECONDS: '60',
  EMAIL_CHANGE_RESPONSE_FLOOR_MS: '100',
  AUTH_PROOF_ACTIVE_KEY_VERSION: 'current',
  AUTH_PROOF_KEYS_JSON: JSON.stringify(keys),
  STOREFRONT_ORIGIN: 'https://shop.example.test',
  CORS_ALLOWED_ORIGINS: 'https://shop.example.test,http://localhost:5173',
})
describe('email-change purpose separation and configuration', () => {
  it('round trips email proof and refuses another target, original address, purpose or principal', () => {
    const envelope = encryption.encrypt(proof, binding)
    expect(encryption.decrypt(envelope, binding)).toBe(proof)
    for (const changed of [
      { ...binding, targetEmail: 'other@example.test' },
      { ...binding, email: 'other@example.test' },
      { ...binding, purpose: 'password_reset' as const },
      { ...binding, userId: 'c'.repeat(24) },
    ])
      expect(() => encryption.decrypt(envelope, changed)).toThrow(
        'Proof delivery material unavailable.',
      )
    expect(() =>
      encryption.encrypt(proof, {
        id: binding.id,
        userId: binding.userId,
        email: binding.email,
        revision: binding.revision,
        expiresAt: binding.expiresAt,
        purpose: 'email_change',
      }),
    ).toThrow()
  })
  it('separates proof digests without changing prior password-reset digests', () => {
    expect(proofHash(proof)).toBe(proofHash(proof, 'password_reset'))
    expect(proofHash(proof, 'email_change')).not.toBe(proofHash(proof))
    const reset: ProofBinding = {
      id: binding.id,
      userId: binding.userId,
      email: binding.email,
      revision: binding.revision,
      expiresAt: binding.expiresAt,
    }
    expect(encryption.decrypt(encryption.encrypt(proof, reset), reset)).toBe(
      proof,
    )
    expect(() =>
      encryption.decrypt(encryption.encrypt(proof, reset), binding),
    ).toThrow()
  })
  it('reads the exact prior reset envelope and verifier encoding', () => {
    const nonce = randomBytes(12),
      cipher = createCipheriv(
        'aes-256-gcm',
        Buffer.from(keys.current, 'hex'),
        nonce,
      )
    cipher.setAAD(
      Buffer.from(
        JSON.stringify([
          'sportzone:password_reset:v1',
          binding.id,
          binding.userId,
          binding.email,
          binding.expiresAt.toISOString(),
          binding.revision,
          'current',
        ]),
      ),
    )
    const envelope = {
      algorithm: 'AES-256-GCM' as const,
      keyVersion: 'current',
      nonce,
      ciphertext: Buffer.concat([cipher.update(proof, 'utf8'), cipher.final()]),
      authTag: cipher.getAuthTag(),
    }
    const reset = {
      id: binding.id,
      userId: binding.userId,
      email: binding.email,
      expiresAt: binding.expiresAt,
      revision: binding.revision,
    }
    expect(encryption.decrypt(envelope, reset)).toBe(proof)
    expect(proofHash(proof)).toBe(
      createHash('sha256')
        .update(`sportzone:password-reset:v1:${proof}`)
        .digest('hex'),
    )
  })
  it('allows email-change-only activation without password-reset settings', () => {
    const options = loadEmailChangeOptions(environment())
    expect(options.ttlSeconds).toBe(900)
    const config = loadEnvironment(environment())
    expect(config.EMAIL_CHANGE_ENABLED).toBe(true)
    expect(config.PASSWORD_RECOVERY_ENABLED).toBe(false)
    expect(loadEnvironment(testEnvironment()).EMAIL_CHANGE_ENABLED).toBe(false)
  })
  for (const [name, value] of [
    ['EMAIL_CHANGE_TTL_SECONDS', ''],
    ['EMAIL_CHANGE_TTL_SECONDS', '59'],
    ['EMAIL_CHANGE_TTL_SECONDS', '1801'],
    ['EMAIL_CHANGE_COOLDOWN_SECONDS', '0'],
    ['EMAIL_CHANGE_COOLDOWN_SECONDS', '3601'],
    ['EMAIL_CHANGE_RESPONSE_FLOOR_MS', '0'],
    ['EMAIL_CHANGE_RESPONSE_FLOOR_MS', '5001'],
    ['STOREFRONT_ORIGIN', 'http://localhost:3000'],
    ['STOREFRONT_ORIGIN', 'https://shop.example.test/path'],
    ['AUTH_PROOF_ACTIVE_KEY_VERSION', 'missing'],
    ['AUTH_PROOF_KEYS_JSON', 'malformed'],
    ['AUTH_PROOF_KEYS_JSON', '{}'],
  ])
    it(`refuses invalid ${name} with a safe error`, () => {
      expect(() =>
        loadEmailChangeOptions({ ...environment(), [name ?? '']: value }),
      ).toThrow('Invalid backend configuration.')
      expect(() =>
        loadEnvironment({ ...environment(), [name ?? '']: value }),
      ).toThrow('Invalid backend configuration.')
    })
  it('requires customer auth and independent proof keys', () => {
    expect(() =>
      loadEnvironment({ ...environment(), CUSTOMER_AUTH_ENABLED: 'false' }),
    ).toThrow()
    expect(() =>
      loadEmailChangeOptions({
        ...environment(),
        SESSION_SECRET: keys.current,
      }),
    ).toThrow()
  })
})

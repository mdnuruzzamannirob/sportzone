import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createProofEncryption,
  proofHash,
  type ProofBinding,
} from '../../src/modules/auth/verification/proof.crypto.js'
import { loadRecoveryOptions } from '../../src/modules/auth/recovery/password-recovery.service.js'
import { loadEnvironment } from '../../src/config/env.js'
import { testEnvironment } from '../helpers/environment.js'
const keys = {
  current: randomBytes(32).toString('hex'),
  old: randomBytes(32).toString('hex'),
}
const proof = randomBytes(32).toString('base64url')
const binding: ProofBinding = {
  id: 'a'.repeat(24),
  userId: 'b'.repeat(24),
  email: 'synthetic@example.test',
  expiresAt: new Date('2030-01-01'),
  revision: 1,
}
const encryption = createProofEncryption('current', keys)
const environment = () => ({
  ...testEnvironment(),
  CUSTOMER_AUTH_ENABLED: 'true',
  CUSTOMER_SESSION_TTL_SECONDS: '600',
  ADMIN_SESSION_TTL_SECONDS: '300',
  BROWSER_CONTEXT_TTL_SECONDS: '120',
  SESSION_COOKIE_SAME_SITE: 'lax',
  PASSWORD_RECOVERY_ENABLED: 'true',
  STOREFRONT_ORIGIN: 'https://shop.example.test',
  CORS_ALLOWED_ORIGINS: 'https://shop.example.test,http://localhost:5173',
  PASSWORD_RESET_TTL_SECONDS: '900',
  PASSWORD_RESET_RESPONSE_FLOOR_MS: '100',
  PASSWORD_RESET_COOLDOWN_SECONDS: '60',
  AUTH_PROOF_ACTIVE_KEY_VERSION: 'current',
  AUTH_PROOF_KEYS_JSON: JSON.stringify(keys),
})
describe('reset proof encryption and explicit configuration', () => {
  it('round trips random proofs with fresh 96-bit nonces and 128-bit tags', () => {
    const first = encryption.encrypt(proof, binding),
      second = encryption.encrypt(proof, binding)
    expect(first.nonce.length).toBe(12)
    expect(first.authTag.length).toBe(16)
    expect(first.nonce.equals(second.nonce)).toBe(false)
    expect(first.ciphertext.toString()).not.toContain(proof)
    expect(encryption.decrypt(first, binding)).toBe(proof)
    expect(proofHash(proof)).toMatch(/^[a-f0-9]{64}$/)
  })
  for (const field of ['id', 'userId', 'email', 'expiresAt', 'revision'] as const)
    it(`authenticates ${field} binding`, () => {
      const changed = {
        ...binding,
        [field]:
          field === 'revision' ? 2 : field === 'expiresAt' ? new Date('2030-01-02') : 'changed',
      }
      expect(() => encryption.decrypt(encryption.encrypt(proof, binding), changed)).toThrow(
        'Proof delivery material unavailable.',
      )
    })
  for (const field of ['nonce', 'ciphertext', 'authTag'] as const)
    it(`rejects tampered ${field}`, () => {
      const envelope = encryption.encrypt(proof, binding)
      envelope[field][0] = (envelope[field][0] ?? 0) ^ 1
      expect(() => encryption.decrypt(envelope, binding)).toThrow(
        'Proof delivery material unavailable.',
      )
    })
  it('permits retained old versions and refuses lost or replaced keys', () => {
    const envelope = createProofEncryption('old', keys).encrypt(proof, binding)
    expect(encryption.decrypt(envelope, binding)).toBe(proof)
    expect(() =>
      createProofEncryption('current', { current: keys.current }).decrypt(envelope, binding),
    ).toThrow()
    expect(() =>
      createProofEncryption('old', {
        old: randomBytes(32).toString('hex'),
      }).decrypt(envelope, binding),
    ).toThrow()
  })
  it('accepts explicit valid options and startup activation', () => {
    expect(loadRecoveryOptions(environment()).ttlSeconds).toBe(900)
    expect(loadEnvironment(environment()).PASSWORD_RECOVERY_ENABLED).toBe(true)
  })
  for (const [field, value] of [
    ['PASSWORD_RESET_TTL_SECONDS', ''],
    ['PASSWORD_RESET_TTL_SECONDS', '1801'],
    ['PASSWORD_RESET_TTL_SECONDS', '59'],
    ['PASSWORD_RESET_RESPONSE_FLOOR_MS', '0'],
    ['PASSWORD_RESET_RESPONSE_FLOOR_MS', '5001'],
    ['PASSWORD_RESET_COOLDOWN_SECONDS', '0'],
    ['PASSWORD_RESET_COOLDOWN_SECONDS', '3601'],
    ['STOREFRONT_ORIGIN', 'http://localhost:3000'],
    ['STOREFRONT_ORIGIN', 'https://shop.example.test/path'],
    ['AUTH_PROOF_ACTIVE_KEY_VERSION', 'missing'],
    ['AUTH_PROOF_KEYS_JSON', '{}'],
    ['AUTH_PROOF_KEYS_JSON', 'invalid'],
  ])
    it(`refuses invalid ${field} without exposing its value`, () => {
      expect(() => loadRecoveryOptions({ ...environment(), [field ?? '']: value })).toThrow(
        'Invalid backend configuration.',
      )
    })
  it('refuses envelope/session key reuse and activation without customer auth', () => {
    expect(() => loadRecoveryOptions({ ...environment(), SESSION_SECRET: keys.current })).toThrow()
    expect(() => loadEnvironment({ ...environment(), CUSTOMER_AUTH_ENABLED: 'false' })).toThrow()
  })
  it('rejects weak, duplicate and unbounded key rings', () => {
    expect(() => createProofEncryption('current', { current: '0'.repeat(64) })).toThrow()
    expect(() =>
      createProofEncryption('current', {
        current: keys.current,
        other: keys.current,
      }),
    ).toThrow()
    expect(() => createProofEncryption('missing', keys)).toThrow()
  })
})

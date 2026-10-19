import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadAdminRecoveryOptions } from '../src/config/recovery.js'
import { loadEnvironment } from '../src/config/environment.js'
import {
  createProofEncryption,
  proofHash,
  type ProofBinding,
} from '../src/modules/auth/proof-envelope.js'
import { testEnvironment } from './support/environment.js'
const key = randomBytes(32).toString('hex')
const environment = () => ({
  ...testEnvironment(),
  ADMIN_AUTH_ENABLED: 'true',
  CUSTOMER_SESSION_TTL_SECONDS: '600',
  ADMIN_SESSION_TTL_SECONDS: '300',
  BROWSER_CONTEXT_TTL_SECONDS: '120',
  SESSION_COOKIE_SAME_SITE: 'lax',
  ADMIN_PASSWORD_RESET_TTL_SECONDS: '900',
  ADMIN_PASSWORD_RESET_COOLDOWN_SECONDS: '60',
  ADMIN_PASSWORD_RESET_RESPONSE_FLOOR_MS: '100',
  AUTH_PROOF_ACTIVE_KEY_VERSION: 'current',
  AUTH_PROOF_KEYS_JSON: JSON.stringify({ current: key }),
  ADMIN_ORIGIN: 'https://admin.example.test',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://admin.example.test',
})
describe('administrator proof/configuration isolation', () => {
  it('enables admin without customer/recovery settings and uses only the fixed admin origin', () => {
    const config = loadEnvironment(environment())
    expect(config.ADMIN_AUTH_ENABLED).toBe(true)
    expect(config.CUSTOMER_AUTH_ENABLED).toBe(false)
    expect(loadAdminRecoveryOptions(environment()).storefrontOrigin).toBe(
      'https://admin.example.test',
    )
    expect(loadEnvironment(testEnvironment()).ADMIN_AUTH_ENABLED).toBe(false)
  })
  it('separates admin reset hashes and authenticated encryption from customer proofs', () => {
    const proof = randomBytes(32).toString('base64url'),
      crypto = createProofEncryption('current', { current: key })
    const binding: ProofBinding = {
      id: 'a'.repeat(24),
      userId: 'b'.repeat(24),
      email: 'synthetic@example.test',
      expiresAt: new Date('2030-01-01'),
      revision: 1,
    }
    expect(proofHash(proof, 'admin_password_reset')).not.toBe(proofHash(proof))
    const admin = { ...binding, audience: 'admin' as const }
    expect(crypto.decrypt(crypto.encrypt(proof, admin), admin)).toBe(proof)
    expect(() =>
      crypto.decrypt(crypto.encrypt(proof, binding), admin),
    ).toThrow()
    expect(() =>
      crypto.decrypt(crypto.encrypt(proof, admin), binding),
    ).toThrow()
  })
  for (const [field, value] of [
    ['ADMIN_PASSWORD_RESET_TTL_SECONDS', ''],
    ['ADMIN_PASSWORD_RESET_TTL_SECONDS', '59'],
    ['ADMIN_PASSWORD_RESET_TTL_SECONDS', '1801'],
    ['ADMIN_PASSWORD_RESET_COOLDOWN_SECONDS', '0'],
    ['ADMIN_PASSWORD_RESET_COOLDOWN_SECONDS', '3601'],
    ['ADMIN_PASSWORD_RESET_RESPONSE_FLOOR_MS', '0'],
    ['ADMIN_PASSWORD_RESET_RESPONSE_FLOOR_MS', '5001'],
    ['ADMIN_ORIGIN', 'http://localhost:5173'],
    ['ADMIN_ORIGIN', 'https://admin.example.test/path'],
    ['AUTH_PROOF_KEYS_JSON', '{}'],
    ['AUTH_PROOF_ACTIVE_KEY_VERSION', 'missing'],
  ])
    it(`rejects invalid ${field} safely`, () => {
      expect(() =>
        loadAdminRecoveryOptions({ ...environment(), [field ?? '']: value }),
      ).toThrow('Invalid backend configuration.')
      expect(() =>
        loadEnvironment({ ...environment(), [field ?? '']: value }),
      ).toThrow('Invalid backend configuration.')
    })
  it('requires explicit session policy and rejects shared proof/session keys', () => {
    expect(() =>
      loadEnvironment({ ...environment(), ADMIN_SESSION_TTL_SECONDS: '' }),
    ).toThrow()
    expect(() =>
      loadEnvironment({
        ...environment(),
        SESSION_COOKIE_SAME_SITE: undefined,
      }),
    ).toThrow()
    expect(() =>
      loadAdminRecoveryOptions({ ...environment(), SESSION_SECRET: key }),
    ).toThrow()
  })
})

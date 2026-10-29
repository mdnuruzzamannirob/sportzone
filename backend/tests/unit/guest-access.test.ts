import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  guestChallengeInput,
  guestExchangeInput,
} from '../../src/modules/auth/guest-access/guest-access.schema.js'
import { readGuestCookie } from '../../src/modules/auth/guest-access/guest-session.service.js'
import {
  proofHash,
  createProofEncryption,
} from '../../src/modules/auth/verification/proof.crypto.js'
import { loadEnvironment } from '../../src/config/env.js'
import { identityEnvironment } from '../helpers/environment.js'
import { reservationExpiryOptions } from '../../src/jobs/expire-reservations.job.js'
const valid = { orderNumber: ' SZ-SYNTHETIC ', email: ' Synthetic@Example.test ' }
it('normalizes lookup while rejecting ownership injection and non-high-entropy exchange proofs', () => {
  expect(guestChallengeInput.parse(valid)).toEqual({
    orderNumber: 'SZ-SYNTHETIC',
    email: 'synthetic@example.test',
  })
  expect(guestChallengeInput.safeParse({ ...valid, orderId: 'a'.repeat(24) }).success).toBe(false)
  expect(guestExchangeInput.safeParse({ challengeToken: '123456' }).success).toBe(false)
  expect(
    guestExchangeInput.safeParse({ challengeToken: randomBytes(32).toString('base64url') }).success,
  ).toBe(true)
})
it('accepts one exact opaque guest cookie and cannot substitute another credential namespace', () => {
  const token = randomBytes(32).toString('base64url')
  expect(readGuestCookie(`sz_guest_order_sid=${token}`)).toBe(token)
  for (const cookie of [
    `sz_customer_sid=${token}`,
    `sz_admin_sid=${token}`,
    `sz_browser_ctx=${token}`,
    `sz_guest_order_sid=${token}; sz_guest_order_sid=${token}`,
    'sz_guest_order_sid=123456',
  ])
    expect(readGuestCookie(cookie)).toBeUndefined()
})
it('domain-separates guest proof hash and AEAD identity from account proofs and other orders', () => {
  const proof = randomBytes(32).toString('base64url'),
    encryption = createProofEncryption('fixture', { fixture: randomBytes(32).toString('hex') })
  const binding = {
    id: 'a'.repeat(24),
    purpose: 'guest_order_access' as const,
    orderId: 'b'.repeat(24),
    email: 'synthetic@example.test',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    revision: 1,
  }
  const encrypted = encryption.encrypt(proof, binding)
  expect(encryption.decrypt(encrypted, binding)).toBe(proof)
  expect(proofHash(proof, 'guest_order_access')).not.toBe(proofHash(proof))
  for (const change of [
    { orderId: 'c'.repeat(24) },
    { id: 'd'.repeat(24) },
    { email: 'foreign@example.test' },
    { revision: 2 },
  ])
    expect(() => encryption.decrypt(encrypted, { ...binding, ...change })).toThrow()
  expect(() =>
    encryption.decrypt(encrypted, {
      id: binding.id,
      userId: binding.orderId,
      email: binding.email,
      expiresAt: binding.expiresAt,
      revision: binding.revision,
    }),
  ).toThrow()
})
it('requires explicit bounded guest lifetimes, protected HTTPS configuration and customer-auth prerequisites', () => {
  const env = {
    ...identityEnvironment(),
    ADMIN_AUTH_ENABLED: 'false',
    GUEST_ACCESS_ENABLED: 'true',
    GUEST_ORDER_ACCESS_TTL_SECONDS: '300',
    GUEST_ORDER_ACCESS_COOLDOWN_SECONDS: '60',
    GUEST_ORDER_ACCESS_RESPONSE_FLOOR_MS: '100',
    GUEST_ORDER_SESSION_TTL_SECONDS: '600',
  }
  expect(loadEnvironment(env).identity?.guest?.sessionTtlSeconds).toBe(600)
  for (const changed of [
    { GUEST_ORDER_SESSION_TTL_SECONDS: '' },
    { GUEST_ORDER_ACCESS_TTL_SECONDS: '0' },
    { GUEST_ORDER_ACCESS_RESPONSE_FLOOR_MS: '0' },
    { GUEST_ORDER_SESSION_TTL_SECONDS: '604801' },
    { CUSTOMER_AUTH_ENABLED: 'false' },
    {
      STOREFRONT_ORIGIN: 'http://localhost:3000',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://admin.example.test',
    },
  ])
    expect(() => loadEnvironment({ ...env, ...changed })).toThrow()
  expect(loadEnvironment({ ...env, GUEST_ACCESS_ENABLED: 'false' }).identity?.guest).toBeUndefined()
})
it('requires explicit bounded expiry lease and batch options without invented operating defaults', () => {
  for (const input of [
    {},
    { batchSize: 0, leaseMs: 1000 },
    { batchSize: 101, leaseMs: 1000 },
    { batchSize: 1, leaseMs: 999 },
    { batchSize: 1, leaseMs: 3600001 },
  ])
    expect(reservationExpiryOptions.safeParse(input).success).toBe(false)
  expect(reservationExpiryOptions.parse({ batchSize: 10, leaseMs: 30000 })).toEqual({
    batchSize: 10,
    leaseMs: 30000,
  })
})

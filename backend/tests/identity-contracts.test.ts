import { readFileSync } from 'node:fs'
import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApp } from '../src/app.js'
import { validate } from '../src/common/middleware/validation.js'
import {
  createIdentityContracts,
  isChallengeCurrent,
  parseIdentityResponse,
} from '../src/modules/auth/auth.validation.js'
import { ApiError, type ErrorCode } from '../src/common/errors.js'
import { respond } from '../src/common/responses.js'

// Synthetic service policies, never installed as production password/phone/area rules.
const contracts = createIdentityContracts({
  newPassword: z.string().min(14).max(128),
  phone: z.string().regex(/^01[3-9]\d{8}$/),
  servesArea: (district, area) =>
    district === 'fixture_district' && area === 'fixture_area',
})
const objectId = '000000000000000000000001'
const address = {
  recipient: 'Fixture recipient',
  phone: '01700000000',
  districtKey: 'fixture_district',
  areaKey: 'fixture_area',
  street: 'Synthetic street',
}
const account = {
  id: objectId,
  name: 'Fixture account',
  email: 'fixture@example.test',
  emailVerified: false,
  addresses: [],
  status: 'active',
}
function operation(method: string, path: string) {
  const result = contracts.operations.find(
    (item) => item.method === method && item.path === path,
  )
  if (!result) throw new Error('Unknown fixture contract')
  return result
}
const credentials = { email: 'fixture@example.test', password: ' fixture secret ' }
function validBody(path: string, method: string): unknown {
  if (method === 'GET') return undefined
  if (path.endsWith('/register')) return { name: 'Fixture', ...credentials }
  if (path.endsWith('/login')) return credentials
  if (path.endsWith('/confirm'))
    return path.includes('password-resets')
      ? { token: 'fixture_proof', newPassword: credentials.password }
      : { token: 'fixture_proof' }
  if (path.endsWith('password-resets') || path.endsWith('email-verifications'))
    return { email: credentials.email }
  if (path === '/me') return { name: 'Fixture' }
  if (path === '/me/email-changes') return { newEmail: credentials.email }
  if (path === '/me/password-change')
    return { currentPassword: 'old', newPassword: credentials.password }
  if (path === '/me/addresses') return address
  if (method === 'PATCH') return { street: 'Updated fixture' }
  return {}
}
function validResult(path: string, method: string): unknown {
  if (path.endsWith('/csrf'))
    return { csrfToken: 'fixture_csrf', expiresAt: '2026-10-18T00:10:00Z' }
  if (path.endsWith('/register')) return { account, verificationRequired: true }
  if (path.endsWith('/login')) return { account, csrfToken: 'fixture_csrf' }
  if (path.endsWith('/session')) return { account }
  if (path.endsWith('/logout')) return { revoked: true, csrfToken: 'fixture_csrf' }
  if (path.endsWith('/confirm')) {
    if (path.includes('password-resets')) return { reset: true }
    if (path.includes('email-verifications')) return { verified: true }
    return account
  }
  if (path.endsWith('password-resets') || path.endsWith('email-verifications'))
    return { accepted: true }
  if (path === '/me') return account
  if (path === '/me/email-changes') return { verificationSent: true }
  if (path === '/me/password-change') return { changed: true, csrfToken: 'fixture_csrf' }
  if (path === '/me/deletion-requests')
    return { requestId: objectId, status: 'requested' }
  if (method === 'DELETE') return undefined
  if (method === 'GET') return []
  return { ...address, id: objectId, isDefault: false }
}

describe('identity request/response contracts', () => {
  it.each(contracts.operations)(
    '$method $path has valid exact request/response and protection metadata',
    (item) => {
      expect(item.request.safeParse(validBody(item.path, item.method)).success).toBe(true)
      expect(item.response.safeParse(validResult(item.path, item.method)).success).toBe(
        true,
      )
      expect(item.csrf).toBe(item.method !== 'GET')
      expect(item.namespace).toBe(
        item.path.startsWith('/admin/') ? 'admin' : 'storefront',
      )
      expect(item.query.safeParse({ role: 'admin' }).success).toBe(false)
      expect(
        item.params.safeParse(
          item.path.includes('{addressId}') ? { addressId: objectId } : {},
        ).success,
      ).toBe(true)
    },
  )
  it('matches all 26 API identity method/path declarations without adding live routes', async () => {
    const spec = readFileSync(new URL('../../docs/API.md', import.meta.url), 'utf8')
    const table = spec.slice(
      spec.indexOf('### 9.1 Authentication'),
      spec.indexOf('**Identity input registry**'),
    )
    const declared = [...table.matchAll(/^\|[ \t]+`(GET|POST|PATCH|DELETE)`[ \t]+\|[ \t]+`([^`]+)`/gm)]
      .map((m) => `${m[1]} ${m[2]}`)
      .sort()
    expect(
      contracts.operations.map((item) => `${item.method} ${item.path}`).sort(),
    ).toEqual(declared)
    expect(declared).toHaveLength(26)
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send(credentials)
    expect(response.status).toBe(404)
  })
  it('normalizes identity, preserves exact password and applies supplied new-password policy', () => {
    expect(
      contracts.credentials.parse({ ...credentials, email: ' Fixture@Example.Test ' }),
    ).toEqual(credentials)
    expect(
      contracts.register.safeParse({ name: 'Fixture', ...credentials, password: 'short' })
        .success,
    ).toBe(false)
    expect(
      contracts.credentials.parse({ ...credentials, password: 'short' }).password,
    ).toBe('short')
  })
  it('rejects a new-password policy that silently transforms the credential', () => {
    const transforming = createIdentityContracts({
      newPassword: z.string().trim(),
      phone: z.string(),
      servesArea: () => true,
    })
    expect(
      transforming.register.safeParse({ name: 'Fixture', ...credentials }).success,
    ).toBe(false)
  })
  it.each(['role', 'status', 'userId', 'securityRevision', 'passwordHash', '$set'])(
    'rejects registration mass assignment: %s',
    (key) => {
      expect(
        contracts.register.safeParse({ name: 'Fixture', ...credentials, [key]: 'admin' })
          .success,
      ).toBe(false)
    },
  )
  it.each([null, [], { $ne: null }, '', 'x'.repeat(255)])(
    'rejects malformed email %j',
    (email) => {
      expect(contracts.credentials.safeParse({ ...credentials, email }).success).toBe(
        false,
      )
    },
  )
  it('uses Unicode character name bounds and forbids empty/noncanonical proof shapes', () => {
    expect(
      contracts.register.safeParse({ ...credentials, name: '🏏'.repeat(120) }).success,
    ).toBe(true)
    expect(
      contracts.register.safeParse({ ...credentials, name: '🏏'.repeat(121) }).success,
    ).toBe(false)
    const schema = operation('POST', '/auth/email-verifications/confirm').request
    for (const token of ['', 'proof with spaces', 'x'.repeat(129), null, { $ne: null }])
      expect(schema.safeParse({ token }).success).toBe(false)
  })
  it('validates supported complete addresses and leaves partial coverage checks to merged state', () => {
    expect(contracts.addressInput.safeParse(address).success).toBe(true)
    expect(
      contracts.addressInput.safeParse({ ...address, areaKey: 'unsupported' }).success,
    ).toBe(false)
    expect(
      contracts.addressInput.safeParse({ ...address, phone: 'invalid' }).success,
    ).toBe(false)
    expect(
      contracts.addressInput.safeParse({ ...address, zoneId: 'forged' }).success,
    ).toBe(false)
    expect(contracts.addressPatch.safeParse({ areaKey: 'new_area' }).success).toBe(true)
    expect(
      contracts.addressInput.safeParse({ ...address, areaKey: 'new_area' }).success,
    ).toBe(false)
    for (const patch of [{}, { street: null }, { id: objectId }, { isDefault: 'true' }])
      expect(contracts.addressPatch.safeParse(patch).success).toBe(false)
  })
  it.each([
    'passwordHash',
    'securityRevision',
    'tokenHash',
    'csrfSecretHash',
    'deliveryEnvelope',
    'role',
  ])('rejects response leakage: %s', (key) => {
    expect(contracts.account.safeParse({ ...account, [key]: 'private' }).success).toBe(
      false,
    )
  })
  it('rejects oversized/duplicate/default-conflicting addresses and internal account statuses', () => {
    const saved = { ...address, id: objectId, isDefault: true }
    for (const addresses of [
      Array(11).fill(saved),
      [saved, saved],
      [saved, { ...saved, id: '000000000000000000000002' }],
    ])
      expect(contracts.account.safeParse({ ...account, addresses }).success).toBe(false)
    for (const status of ['deactivated', 'deletion_pending'])
      expect(contracts.account.safeParse({ ...account, status }).success).toBe(false)
  })
  it('requires immutable true acknowledgement shapes and UTC expiries', () => {
    expect(
      operation('POST', '/auth/password-resets').response.safeParse({ accepted: false })
        .success,
    ).toBe(false)
    expect(
      operation('POST', '/auth/password-resets').response.safeParse({
        accepted: true,
        exists: true,
      }).success,
    ).toBe(false)
    expect(
      operation('GET', '/auth/csrf').response.safeParse({
        csrfToken: 'fixture',
        expiresAt: '2026-10-18T06:10:00+06:00',
      }).success,
    ).toBe(false)
  })
})

describe('proof replay and logout contract preconditions', () => {
  const now = new Date('2026-10-18T00:00:00Z')
  const state = {
    purpose: 'password_reset' as const,
    scopeId: objectId,
    scopeRevisionAtIssue: 2,
    expiresAt: new Date('2026-10-18T00:10:00Z'),
    attemptCount: 0,
  }
  const expected = {
    purpose: 'password_reset' as const,
    scopeId: objectId,
    scopeRevision: 2,
    maxAttempts: 5,
  }
  it('accepts a fresh matching precondition without consuming or authenticating', () => {
    expect(isChallengeCurrent(state, expected, now)).toBe(true)
    expect(state).not.toHaveProperty('consumedAt')
  })
  it.each([
    { consumedAt: now },
    { invalidatedAt: now },
    { expiresAt: now },
    { expiresAt: new Date('invalid') },
    { scopeRevisionAtIssue: 1 },
    { attemptCount: 5 },
    { attemptCount: -1 },
    { attemptCount: 0.5 },
    { scopeId: 'other' },
    { purpose: 'guest_order_access' as const },
  ])('rejects stale/replayed proof state %j', (change) => {
    expect(isChallengeCurrent({ ...state, ...change }, expected, now)).toBe(false)
  })
  it('rejects reissue revisions, wrong role-bound principal and invalid policy/clock', () => {
    expect(isChallengeCurrent(state, { ...expected, scopeRevision: 3 }, now)).toBe(false)
    expect(
      isChallengeCurrent(state, { ...expected, scopeId: 'admin_principal' }, now),
    ).toBe(false)
    expect(isChallengeCurrent(state, { ...expected, maxAttempts: 0 }, now)).toBe(false)
    expect(isChallengeCurrent(state, expected, new Date('invalid'))).toBe(false)
  })
  it.each(['/auth/logout', '/admin/auth/logout'])(
    'repeat logout %s retains same safe shape while rotating tokens',
    (path) => {
      const item = operation('POST', path)
      expect(item.replay).toBe('idempotent_logout')
      for (const csrfToken of ['new_context_one', 'new_context_two'])
        expect(item.response.parse({ revoked: true, csrfToken })).toEqual({
          revoked: true,
          csrfToken,
        })
      expect(item.csrf).toBe(true)
    },
  )
  it('marks all four proof-confirmation routes single-use', () => {
    expect(
      contracts.operations.filter((item) => item.replay === 'single_use'),
    ).toHaveLength(4)
  })
})

describe('contract transport and safe errors', () => {
  it('applies validators before service handoff and validates response envelopes through Express', async () => {
    const router = Router()
    const contract = operation('POST', '/auth/register')
    router.post(
      '/fixture',
      validate(contract.request, 'body', (input, _req, res) => {
        const parsed = contracts.register.parse(input)
        respond(
          res,
          parseIdentityResponse(contract.response, {
            account: { ...account, name: parsed.name },
            verificationRequired: true,
          }),
          contract.status,
        )
      }),
    )
    const app = createApp({ apiRouter: router })
    const good = await request(app)
      .post('/api/v1/fixture')
      .send({ ...credentials, name: 'Fixture' })
    expect(good.status).toBe(201)
    expect(good.body.meta.requestId).toBe(good.headers['x-request-id'])
    expect(good.headers['cache-control']).toBe('no-store')
    const bad = await request(app)
      .post('/api/v1/fixture')
      .send({ ...credentials, name: 'Fixture', role: 'admin' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('VALIDATION_FAILED')
    expect(JSON.stringify(bad.body)).not.toContain(credentials.password)
  })
  it('redacts invalid server output as INTERNAL_ERROR rather than blaming the caller', async () => {
    const router = Router()
    router.get('/fixture', (_req, res) => {
      respond(
        res,
        parseIdentityResponse(contracts.account, {
          ...account,
          passwordHash: 'synthetic_private_hash',
        }),
      )
    })
    const response = await request(createApp({ apiRouter: router })).get(
      '/api/v1/fixture',
    )
    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(response.body)).not.toContain('synthetic_private_hash')
    expect(response.body.error.details).toBeUndefined()
  })
  it.each<[ErrorCode, number]>([
    ['INVALID_CREDENTIALS', 401],
    ['AUTH_REQUIRED', 401],
    ['GUEST_PROOF_REQUIRED', 401],
    ['CSRF_INVALID', 403],
    ['FORBIDDEN', 403],
    ['RATE_LIMITED', 429],
  ])('%s returns the registered safe status/envelope', async (code, status) => {
    const router = Router()
    router.post('/fixture', () => {
      throw new ApiError(code)
    })
    const response = await request(createApp({ apiRouter: router })).post(
      '/api/v1/fixture',
    )
    expect(response.status).toBe(status)
    expect(response.body.error).toEqual({ code, message: new ApiError(code).message })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id'])
  })
})

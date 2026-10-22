import { describe, expect, it } from 'vitest'
import { ConfigurationError, loadEnvironment } from '../../src/config/env.js'
import { identityEnvironment, testEnvironment } from '../helpers/environment.js'

describe('P03-019 typed runtime configuration', () => {
  it('captures frozen typed policy once without retaining a live environment dependency', () => {
    const input = identityEnvironment()
    const config = loadEnvironment(input)
    input.AUTH_PROOF_KEYS_JSON = 'invalid'
    input.CUSTOMER_SESSION_TTL_SECONDS = 'invalid'
    expect(config.identity?.sessions.customerTtlSeconds).toBe(3600)
    expect(config.identity?.browser.contextTtlSeconds).toBe(300)
    expect(config.identity?.recovery?.storefrontOrigin).toBe('https://shop.example.test')
    expect(config.identity?.adminRecovery?.storefrontOrigin).toBe('https://admin.example.test')
    expect(config.identity?.emailChange?.ttlSeconds).toBe(600)
    for (const value of [
      config.identity,
      config.identity?.sessions,
      config.identity?.browser,
      config.identity?.recovery,
    ])
      expect(Object.isFrozen(value)).toBe(true)
  })
  it('keeps inactive proof providers optional for health-only startup', () => {
    expect(
      loadEnvironment({
        ...testEnvironment(),
        AUTH_PROOF_KEYS_JSON: 'not configured',
      }).identity,
    ).toBeUndefined()
  })
  it('rejects unsafe enabled origins at the boundary with value-free diagnostics', () => {
    const input = {
      ...identityEnvironment(),
      API_PUBLIC_ORIGIN: 'http://untrusted.example.test',
    }
    expect(() => loadEnvironment(input)).toThrow(ConfigurationError)
    try {
      loadEnvironment(input)
    } catch (error) {
      expect(String(error)).not.toContain('untrusted.example.test')
    }
  })
})

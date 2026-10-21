import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  readContextCookie,
  loadBrowserSecurityOptions,
  validateBrowserSecurityOptions,
} from '../src/modules/auth/browser-security.service.js'
const options = {
  secret: randomBytes(32).toString('hex'),
  contextTtlSeconds: 120,
  storefrontOrigin: 'https://shop.example.test',
  adminOrigin: 'https://admin.example.test',
}
describe('browser security configuration and wire format', () => {
  it('accepts canonical separate HTTPS origins and returns frozen configuration', () => {
    expect(Object.isFrozen(validateBrowserSecurityOptions(options, true))).toBe(
      true,
    )
  })
  it.each([0, -1, 1801, 1.2, NaN, Infinity])(
    'rejects unbounded context lifetime %s',
    (contextTtlSeconds) => {
      expect(() =>
        validateBrowserSecurityOptions({ ...options, contextTtlSeconds }, true),
      ).toThrow()
    },
  )
  it.each([
    '*',
    'null',
    'https://shop.example.test/',
    'https://shop.example.test/path',
    'http://shop.example.test',
    'https://user:pass@shop.example.test',
  ])('rejects unsafe origin %s', (storefrontOrigin) => {
    expect(() =>
      validateBrowserSecurityOptions({ ...options, storefrontOrigin }, true),
    ).toThrow()
  })
  it('rejects same origins and weak secrets without leaking their values', () => {
    expect(() =>
      validateBrowserSecurityOptions(
        { ...options, adminOrigin: options.storefrontOrigin },
        true,
      ),
    ).toThrow()
    expect(() =>
      validateBrowserSecurityOptions(
        { ...options, secret: 'a'.repeat(64) },
        true,
      ),
    ).toThrow('Invalid browser security configuration.')
  })
  it('permits loopback HTTP only under the existing local insecure cookie policy', () => {
    const local = {
      ...options,
      storefrontOrigin: 'http://localhost:3000',
      adminOrigin: 'http://localhost:5173',
    }
    expect(() => validateBrowserSecurityOptions(local, false)).not.toThrow()
    expect(() => validateBrowserSecurityOptions(local, true)).toThrow()
  })
  it('loads exact allowlist and explicit TTL, and redacts configuration failures', () => {
    const env = {
      SESSION_SECRET: options.secret,
      BROWSER_CONTEXT_TTL_SECONDS: '120',
      STOREFRONT_ORIGIN: options.storefrontOrigin,
      ADMIN_ORIGIN: options.adminOrigin,
      CORS_ALLOWED_ORIGINS: `${options.storefrontOrigin},${options.adminOrigin}`,
    }
    expect(loadBrowserSecurityOptions(env, true).contextTtlSeconds).toBe(120)
    for (const change of [
      { BROWSER_CONTEXT_TTL_SECONDS: '' },
      { BROWSER_CONTEXT_TTL_SECONDS: '01' },
      { CORS_ALLOWED_ORIGINS: '*' },
      { SESSION_SECRET: 'sensitive-invalid-value' },
    ]) {
      expect(() =>
        loadBrowserSecurityOptions({ ...env, ...change }, true),
      ).toThrow('Invalid backend configuration.')
    }
  })
  it('strictly separates and rejects ambiguous cookie namespaces', () => {
    const a = 'a'.repeat(43),
      b = 'b'.repeat(43)
    expect(
      readContextCookie(
        `sz_browser_ctx=${a}; sz_admin_browser_ctx=${b}`,
        'admin',
      ),
    ).toBe(b)
    expect(
      readContextCookie(
        `sz_browser_ctx=${a}; sz_browser_ctx=${a}`,
        'storefront',
      ),
    ).toBeUndefined()
    expect(
      readContextCookie(`sz_browser_ctx=${a}%20`, 'storefront'),
    ).toBeUndefined()
    expect(readContextCookie(undefined, 'storefront')).toBeUndefined()
  })
})

import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ConfigurationError } from '../../src/config/env.js'
import { readSessionCookie } from '../../src/modules/auth/sessions/session.http.js'
import { loadSessionOptions } from '../../src/modules/auth/sessions/session.service.js'
function environment() {
  return {
    SESSION_SECRET: randomBytes(32).toString('hex'),
    APP_ENV: 'test',
    API_PUBLIC_ORIGIN: 'http://localhost:4000',
    CUSTOMER_SESSION_TTL_SECONDS: '600',
    ADMIN_SESSION_TTL_SECONDS: '300',
    SESSION_COOKIE_SAME_SITE: 'lax',
  }
}
describe('session policy configuration', () => {
  it('requires explicit policy and converts bounded seconds without defaults', () => {
    expect(loadSessionOptions(environment())).toMatchObject({
      customerTtlSeconds: 600,
      adminTtlSeconds: 300,
      sameSite: 'lax',
      appEnvironment: 'test',
    })
  })
  it.each([
    'CUSTOMER_SESSION_TTL_SECONDS',
    'ADMIN_SESSION_TTL_SECONDS',
    'SESSION_COOKIE_SAME_SITE',
    'SESSION_SECRET',
    'API_PUBLIC_ORIGIN',
    'APP_ENV',
  ])('rejects missing %s without exposing values', (key) => {
    const input: NodeJS.ProcessEnv = environment()
    delete input[key]
    try {
      loadSessionOptions(input)
      expect.fail('Must reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError)
      expect(error instanceof ConfigurationError && error.fields).toContain(key)
      expect(String(error)).not.toContain(input.SESSION_SECRET)
    }
  })
  it.each(['0', '-1', '1.5', ' 60', '1e3', 'Infinity', '9007199254740991'])(
    'rejects invalid lifetime %s',
    (value) => {
      expect(() =>
        loadSessionOptions({
          ...environment(),
          CUSTOMER_SESSION_TTL_SECONDS: value,
        }),
      ).toThrow(ConfigurationError)
    },
  )
  it.each(['none', '', 'Lax'])('rejects unapproved SameSite %s', (value) => {
    expect(() => loadSessionOptions({ ...environment(), SESSION_COOKIE_SAME_SITE: value })).toThrow(
      ConfigurationError,
    )
  })
  it.each([
    ['production', 'http://localhost:4000'],
    ['staging', 'https://localhost'],
    ['local', 'http://untrusted.example.test'],
    ['test', 'https://api.example.test/path'],
    ['test', 'https://user:secret@api.example.test'],
    ['test', 'https://api.example.test?query=secret'],
  ])('rejects unsafe %s origin %s', (APP_ENV, API_PUBLIC_ORIGIN) => {
    expect(() => loadSessionOptions({ ...environment(), APP_ENV, API_PUBLIC_ORIGIN })).toThrow(
      ConfigurationError,
    )
  })
  it('accepts explicit HTTPS deployed policy and strict SameSite', () => {
    expect(
      loadSessionOptions({
        ...environment(),
        APP_ENV: 'production',
        API_PUBLIC_ORIGIN: 'https://api.example.test',
        SESSION_COOKIE_SAME_SITE: 'strict',
      }).sameSite,
    ).toBe('strict')
  })
})
describe('route-selected cookie parsing', () => {
  const customer = 'c'.repeat(43),
    admin = 'a'.repeat(43)
  it('chooses only its namespace and ignores unrelated cookies', () => {
    const header = `other=value; sz_customer_sid=${customer}; sz_admin_sid=${admin}`
    expect(readSessionCookie(header, 'customer')).toBe(customer)
    expect(readSessionCookie(header, 'admin')).toBe(admin)
  })
  it.each([
    undefined,
    '',
    'sz_customer_sid',
    'sz_customer_sid=',
    'sz_customer_sid="quoted"',
    'sz_customer_sid=%41',
    `sz_customer_sid=${'x'.repeat(44)}`,
    `sz_customer_sid=${customer}=`,
    `sz_customer_sid=${customer}; sz_customer_sid=${customer}`,
    `sz_customer_sid=${customer}; sz_customer_sid=invalid`,
    `sz_admin_sid=${admin}`,
  ])('fails closed for missing/ambiguous/malformed credential %s', (header) => {
    expect(readSessionCookie(header, 'customer')).toBeUndefined()
  })
})

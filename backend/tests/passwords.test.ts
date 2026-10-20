import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  newPasswordPolicy,
  verifyPassword,
} from '../src/modules/auth/passwords.js'
import { loadEnvironment } from '../src/config/environment.js'
import { testEnvironment } from './support/environment.js'
describe('approved password policy and bounded adaptive hashing', () => {
  it.each([
    'short',
    'x'.repeat(129),
    '😀'.repeat(129),
    `${'x'.repeat(12)}\ud800`,
  ])('rejects new password outside approved bounds', (password) => {
    expect(newPasswordPolicy.safeParse(password).success).toBe(false)
  })
  it.each(['x'.repeat(12), ' '.repeat(12), 'বাংলাদেশ খেলাধুলা', '😀'.repeat(128)])(
    'preserves approved password bytes',
    (password) => {
      expect(newPasswordPolicy.parse(password)).toBe(password)
    },
  )
  it('uses random salt, approved scrypt cost, constant-length verification and no trimming', async () => {
    const password = '  exact password bytes  '
    const a = await hashPassword(password),
      b = await hashPassword(password)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^scrypt\$v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
    expect(a).not.toContain(password)
    expect(await verifyPassword(password, a)).toBe(true)
    expect(await verifyPassword(password.trim(), a)).toBe(false)
    expect(await verifyPassword(password, undefined)).toBe(false)
    expect(await verifyPassword(password, a.replace('131072', '1'))).toBe(false)
    expect(await verifyPassword('x'.repeat(4097), a)).toBe(false)
  })
  it('rejects KDF saturation instead of queuing unbounded password work', async () => {
    const result = await Promise.allSettled([
      hashPassword('synthetic password one'),
      hashPassword('synthetic password two'),
      hashPassword('synthetic password three'),
    ])
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect(result.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'SERVICE_UNAVAILABLE' },
    })
  })
  it('requires all policies before customer auth startup can be enabled', () => {
    expect(loadEnvironment(testEnvironment()).CUSTOMER_AUTH_ENABLED).toBe(false)
    expect(() =>
      loadEnvironment({ ...testEnvironment(), CUSTOMER_AUTH_ENABLED: 'true' }),
    ).toThrow()
    expect(
      loadEnvironment({
        ...testEnvironment(),
        CUSTOMER_AUTH_ENABLED: 'true',
        CUSTOMER_SESSION_TTL_SECONDS: '600',
        ADMIN_SESSION_TTL_SECONDS: '300',
        SESSION_COOKIE_SAME_SITE: 'lax',
        BROWSER_CONTEXT_TTL_SECONDS: '120',
      }).CUSTOMER_AUTH_ENABLED,
    ).toBe(true)
  })
})

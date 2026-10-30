import { validateSessionOptions } from '../modules/auth/sessions/session.service.js'
import { validateBrowserSecurityOptions } from '../modules/auth/sessions/browser-security.service.js'
import {
  loadRecoveryOptions,
  loadEmailChangeOptions,
  loadAdminRecoveryOptions,
  loadGuestAccessOptions,
} from './security.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
export { ConfigurationError } from '../shared/errors/configuration-error.js'
import { z } from 'zod'

const secret = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .refine((value) => !/^(.)\1+$/.test(value))
const origin = z.string().transform((value, ctx) => {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error()
    return url.origin
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid origin' })
    return z.NEVER
  }
})
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
    PORT: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.int().min(1).max(65535))
      .default(4000),
    API_BIND_HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
    RELEASE_ID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    MONGODB_URI: z
      .string()
      .min(1)
      .refine((value) => /^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(value)),
    MONGODB_DB_NAME: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,62}$/)
      .refine((value) => !['admin', 'local', 'config'].includes(value)),
    CUSTOMER_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CUSTOMER_ORDER_READ_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    ADMIN_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    ADMIN_PASSWORD_RESET_TTL_SECONDS: z.string().optional(),
    ADMIN_PASSWORD_RESET_COOLDOWN_SECONDS: z.string().optional(),
    ADMIN_PASSWORD_RESET_RESPONSE_FLOOR_MS: z.string().optional(),
    GUEST_ACCESS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PASSWORD_RECOVERY_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    EMAIL_CHANGE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    EMAIL_CHANGE_TTL_SECONDS: z.string().optional(),
    EMAIL_CHANGE_COOLDOWN_SECONDS: z.string().optional(),
    EMAIL_CHANGE_RESPONSE_FLOOR_MS: z.string().optional(),
    PASSWORD_RESET_TTL_SECONDS: z.string().optional(),
    PASSWORD_RESET_COOLDOWN_SECONDS: z.string().optional(),
    PASSWORD_RESET_RESPONSE_FLOOR_MS: z.string().optional(),
    AUTH_PROOF_ACTIVE_KEY_VERSION: z.string().optional(),
    AUTH_PROOF_KEYS_JSON: z.string().optional(),
    CUSTOMER_SESSION_TTL_SECONDS: z.string().optional(),
    ADMIN_SESSION_TTL_SECONDS: z.string().optional(),
    SESSION_COOKIE_SAME_SITE: z.enum(['lax', 'strict']).optional(),
    BROWSER_CONTEXT_TTL_SECONDS: z.string().optional(),
    SESSION_SECRET: secret,
    HEALTH_MONITOR_TOKEN: secret,
    API_PUBLIC_ORIGIN: origin,
    STOREFRONT_ORIGIN: origin,
    ADMIN_ORIGIN: origin,
    CORS_ALLOWED_ORIGINS: z
      .string()
      .transform((value) => value.split(','))
      .pipe(z.array(origin).length(2)),
  })
  .superRefine((value, ctx) => {
    if (
      value.CUSTOMER_ORDER_READ_ENABLED &&
      (!value.CUSTOMER_AUTH_ENABLED || !['local', 'test'].includes(value.APP_ENV))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['CUSTOMER_ORDER_READ_ENABLED'],
        message: 'Reviewed local/test customer authentication required',
      })
    if (value.GUEST_ACCESS_ENABLED && !value.CUSTOMER_AUTH_ENABLED)
      ctx.addIssue({
        code: 'custom',
        path: ['GUEST_ACCESS_ENABLED'],
        message: 'Customer auth infrastructure required',
      })
    if (value.PASSWORD_RECOVERY_ENABLED) {
      if (!value.CUSTOMER_AUTH_ENABLED)
        ctx.addIssue({
          code: 'custom',
          path: ['PASSWORD_RECOVERY_ENABLED'],
          message: 'Customer authentication required',
        })
    }
    if (value.EMAIL_CHANGE_ENABLED) {
      if (!value.CUSTOMER_AUTH_ENABLED)
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_CHANGE_ENABLED'],
          message: 'Customer authentication required',
        })
    }
    if (value.CUSTOMER_AUTH_ENABLED || value.ADMIN_AUTH_ENABLED) {
      for (const field of [
        'CUSTOMER_SESSION_TTL_SECONDS',
        'ADMIN_SESSION_TTL_SECONDS',
        'BROWSER_CONTEXT_TTL_SECONDS',
      ] as const) {
        const number = Number(value[field])
        if (
          !/^[1-9]\d*$/.test(value[field] ?? '') ||
          !Number.isSafeInteger(number) ||
          number >
            (field === 'BROWSER_CONTEXT_TTL_SECONDS'
              ? 1800
              : Math.floor(Number.MAX_SAFE_INTEGER / 1000))
        )
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Explicit bounded lifetime required',
          })
      }
      if (!value.SESSION_COOKIE_SAME_SITE)
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_COOKIE_SAME_SITE'],
          message: 'Explicit policy required',
        })
    }
    const expected =
      value.APP_ENV === 'local' ? 'development' : value.APP_ENV === 'test' ? 'test' : 'production'
    if (value.NODE_ENV !== expected)
      ctx.addIssue({
        code: 'custom',
        path: ['NODE_ENV'],
        message: 'Environment mismatch',
      })
    if (value.SESSION_SECRET === value.HEALTH_MONITOR_TOKEN)
      ctx.addIssue({
        code: 'custom',
        path: ['HEALTH_MONITOR_TOKEN'],
        message: 'Separate credentials required',
      })
    if (
      new Set(value.CORS_ALLOWED_ORIGINS).size !== 2 ||
      !value.CORS_ALLOWED_ORIGINS.includes(value.STOREFRONT_ORIGIN) ||
      !value.CORS_ALLOWED_ORIGINS.includes(value.ADMIN_ORIGIN)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'Origin mismatch',
      })
    if (['staging', 'production'].includes(value.APP_ENV)) {
      for (const field of ['API_PUBLIC_ORIGIN', 'STOREFRONT_ORIGIN', 'ADMIN_ORIGIN'] as const) {
        const url = new URL(value[field])
        if (
          url.protocol !== 'https:' ||
          ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname) ||
          url.hostname.endsWith('.localhost')
        )
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Secure deployed origin required',
          })
      }
    }
  })
export type IdentityConfig = Readonly<{
  sessions: ReturnType<typeof validateSessionOptions>
  browser: ReturnType<typeof validateBrowserSecurityOptions>
  recovery?: ReturnType<typeof loadRecoveryOptions>
  emailChange?: ReturnType<typeof loadEmailChangeOptions>
  adminRecovery?: ReturnType<typeof loadAdminRecoveryOptions>
  guest?: ReturnType<typeof loadGuestAccessOptions>
}>
export type RuntimeConfig = Readonly<z.output<typeof schema> & { identity?: IdentityConfig }>
export function loadEnvironment(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = schema.safeParse(environment)
  if (!parsed.success)
    throw new ConfigurationError(
      [
        ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'configuration'))),
      ].sort(),
    )
  const config = parsed.data
  if (!config.CUSTOMER_AUTH_ENABLED && !config.ADMIN_AUTH_ENABLED) return Object.freeze(config)
  // Read raw boundary values once, with the canonical origins validated above.
  const input = {
    ...environment,
    API_PUBLIC_ORIGIN: config.API_PUBLIC_ORIGIN,
    STOREFRONT_ORIGIN: config.STOREFRONT_ORIGIN,
    ADMIN_ORIGIN: config.ADMIN_ORIGIN,
  }
  const sessions = Object.freeze(
    validateSessionOptions({
      secret: config.SESSION_SECRET,
      customerTtlSeconds: Number(config.CUSTOMER_SESSION_TTL_SECONDS),
      adminTtlSeconds: Number(config.ADMIN_SESSION_TTL_SECONDS),
      sameSite: config.SESSION_COOKIE_SAME_SITE,
      appEnvironment: config.APP_ENV,
      apiOrigin: config.API_PUBLIC_ORIGIN,
    }),
  )
  let browser: ReturnType<typeof validateBrowserSecurityOptions>
  try {
    browser = validateBrowserSecurityOptions(
      {
        secret: config.SESSION_SECRET,
        contextTtlSeconds: Number(config.BROWSER_CONTEXT_TTL_SECONDS),
        storefrontOrigin: config.STOREFRONT_ORIGIN,
        adminOrigin: config.ADMIN_ORIGIN,
      },
      new URL(config.API_PUBLIC_ORIGIN).protocol === 'https:',
    )
  } catch {
    throw new ConfigurationError(['browser_security_configuration'])
  }
  const identity: IdentityConfig = Object.freeze({
    sessions,
    browser,
    ...(config.GUEST_ACCESS_ENABLED ? { guest: Object.freeze(loadGuestAccessOptions(input)) } : {}),
    ...(config.PASSWORD_RECOVERY_ENABLED
      ? { recovery: Object.freeze(loadRecoveryOptions(input)) }
      : {}),
    ...(config.EMAIL_CHANGE_ENABLED
      ? { emailChange: Object.freeze(loadEmailChangeOptions(input)) }
      : {}),
    ...(config.ADMIN_AUTH_ENABLED
      ? { adminRecovery: Object.freeze(loadAdminRecoveryOptions(input)) }
      : {}),
  })
  return Object.freeze({ ...config, identity })
}

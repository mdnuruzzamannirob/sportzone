import { z } from 'zod'
import { createEncryptionKeyring, type EncryptionKeyring } from '../shared/crypto.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'

const securitySecretSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .refine((value) => !/^(.)\1+$/.test(value))

const ttl = z
  .int()
  .positive()
  .max(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
const sessionOptionsSchema = z
  .strictObject({
    secret: securitySecretSchema,
    customerTtlSeconds: ttl,
    adminTtlSeconds: ttl,
    sameSite: z.enum(['lax', 'strict']),
    appEnvironment: z.enum(['local', 'test', 'staging', 'production']),
    apiOrigin: z.string().refine((value) => {
      try {
        const url = new URL(value)
        return ['https:', 'http:'].includes(url.protocol) && url.origin === value
      } catch {
        return false
      }
    }),
  })
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value.apiOrigin)
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (
        (url.protocol === 'http:' &&
          (!loopback || !['local', 'test'].includes(value.appEnvironment))) ||
        (['staging', 'production'].includes(value.appEnvironment) && loopback)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['apiOrigin'],
          message: 'Secure API origin required',
        })
    } catch {
      /* The field refinement reports malformed origins without values. */
    }
  })
type SessionOptions = z.infer<typeof sessionOptionsSchema>
const sessionFields: Record<string, string> = {
  secret: 'SESSION_SECRET',
  customerTtlSeconds: 'CUSTOMER_SESSION_TTL_SECONDS',
  adminTtlSeconds: 'ADMIN_SESSION_TTL_SECONDS',
  sameSite: 'SESSION_COOKIE_SAME_SITE',
  appEnvironment: 'APP_ENV',
  apiOrigin: 'API_PUBLIC_ORIGIN',
}
function validateSessionOptions(value: unknown): SessionOptions {
  const parsed = sessionOptionsSchema.safeParse(value)
  if (!parsed.success)
    throw new ConfigurationError(
      [
        ...new Set(
          parsed.error.issues.map(
            (issue) => sessionFields[String(issue.path[0])] ?? 'session_configuration',
          ),
        ),
      ].sort(),
    )
  return parsed.data
}
// Raw-boundary adapter for isolated callers; the runtime consumes prevalidated typed options.
function loadSessionOptions(environment: NodeJS.ProcessEnv): SessionOptions {
  const seconds = (value: string | undefined) =>
    value && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
  return validateSessionOptions({
    secret: environment.SESSION_SECRET,
    customerTtlSeconds: seconds(environment.CUSTOMER_SESSION_TTL_SECONDS),
    adminTtlSeconds: seconds(environment.ADMIN_SESSION_TTL_SECONDS),
    sameSite: environment.SESSION_COOKIE_SAME_SITE,
    appEnvironment: environment.APP_ENV,
    apiOrigin: environment.API_PUBLIC_ORIGIN,
  })
}
type BrowserSecurityOptions = {
  secret: string
  contextTtlSeconds: number
  storefrontOrigin: string
  adminOrigin: string
}
function validateBrowserSecurityOptions(input: BrowserSecurityOptions, secure: boolean) {
  if (
    !/^[a-f0-9]{64}$/.test(input.secret) ||
    /^(.)\1+$/.test(input.secret) ||
    !Number.isSafeInteger(input.contextTtlSeconds) ||
    input.contextTtlSeconds < 1 ||
    input.contextTtlSeconds > 1800
  )
    throw new Error('Invalid browser security configuration.')
  for (const origin of [input.storefrontOrigin, input.adminOrigin]) {
    let url: URL
    try {
      url = new URL(origin)
    } catch {
      throw new Error('Invalid browser security origin.')
    }
    if (
      url.origin !== origin ||
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' &&
        (secure || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      throw new Error('Invalid browser security origin.')
  }
  if (input.storefrontOrigin === input.adminOrigin)
    throw new Error('Browser origins must be distinct.')
  return Object.freeze({ ...input })
}
function loadBrowserSecurityOptions(
  environment: NodeJS.ProcessEnv,
  secure: boolean,
): BrowserSecurityOptions {
  try {
    const allowed = (environment.CORS_ALLOWED_ORIGINS ?? '').split(',')
    if (
      allowed.length !== 2 ||
      new Set(allowed).size !== 2 ||
      !allowed.includes(environment.STOREFRONT_ORIGIN ?? '') ||
      !allowed.includes(environment.ADMIN_ORIGIN ?? '')
    )
      throw new Error('Invalid origin allowlist.')
    return validateBrowserSecurityOptions(
      {
        secret: environment.SESSION_SECRET ?? '',
        contextTtlSeconds: /^[1-9]\d*$/.test(environment.BROWSER_CONTEXT_TTL_SECONDS ?? '')
          ? Number(environment.BROWSER_CONTEXT_TTL_SECONDS)
          : NaN,
        storefrontOrigin: environment.STOREFRONT_ORIGIN ?? '',
        adminOrigin: environment.ADMIN_ORIGIN ?? '',
      },
      secure,
    )
  } catch {
    throw new ConfigurationError(['browser_security_configuration'])
  }
}
type RecoveryOptions = {
  ttlSeconds: number
  cooldownSeconds: number
  responseFloorMs: number
  storefrontOrigin: string
  encryption: EncryptionKeyring
}
function loadProofOptions(
  environment: NodeJS.ProcessEnv,
  prefix:
    | 'EMAIL_VERIFICATION'
    | 'PASSWORD_RESET'
    | 'EMAIL_CHANGE'
    | 'ADMIN_PASSWORD_RESET'
    | 'GUEST_ORDER_ACCESS',
): RecoveryOptions {
  try {
    const integer = (key: string, min: number, max: number) => {
      const raw = environment[key] ?? ''
      const value = Number(raw)
      if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max)
        throw new Error()
      return value
    }
    const configuredOrigin =
      prefix === 'ADMIN_PASSWORD_RESET' ? environment.ADMIN_ORIGIN : environment.STOREFRONT_ORIGIN
    const origin = new URL(configuredOrigin ?? '')
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== configuredOrigin ||
      origin.username ||
      origin.password
    )
      throw new Error()
    const parsed: unknown = JSON.parse(environment.AUTH_PROOF_KEYS_JSON ?? '')
    const keys = z.record(z.string(), z.string()).parse(parsed)
    if (
      Object.values(keys).some(
        (key) => key === environment.SESSION_SECRET || key === environment.HEALTH_MONITOR_TOKEN,
      )
    )
      throw new Error()
    return {
      ttlSeconds: integer(`${prefix}_TTL_SECONDS`, 60, 1800),
      cooldownSeconds: integer(`${prefix}_COOLDOWN_SECONDS`, 60, 3600),
      responseFloorMs: integer(`${prefix}_RESPONSE_FLOOR_MS`, 100, 5000),
      storefrontOrigin: origin.origin,
      encryption: createEncryptionKeyring(environment.AUTH_PROOF_ACTIVE_KEY_VERSION ?? '', keys),
    }
  } catch {
    throw new ConfigurationError([
      prefix === 'EMAIL_VERIFICATION'
        ? 'email_verification_configuration'
        : prefix === 'PASSWORD_RESET'
          ? 'password_recovery_configuration'
          : prefix === 'EMAIL_CHANGE'
            ? 'email_change_configuration'
            : prefix === 'ADMIN_PASSWORD_RESET'
              ? 'admin_recovery_configuration'
              : 'guest_access_configuration',
    ])
  }
}

const loadRecoveryOptions = (environment: NodeJS.ProcessEnv) =>
  loadProofOptions(environment, 'PASSWORD_RESET')
const loadEmailChangeOptions = (environment: NodeJS.ProcessEnv) =>
  loadProofOptions(environment, 'EMAIL_CHANGE')

const loadAdminRecoveryOptions = (environment: NodeJS.ProcessEnv) =>
  loadProofOptions(environment, 'ADMIN_PASSWORD_RESET')

type GuestAccessOptions = RecoveryOptions & { sessionTtlSeconds: number }
function loadGuestAccessOptions(environment: NodeJS.ProcessEnv): GuestAccessOptions {
  const proof = loadProofOptions(environment, 'GUEST_ORDER_ACCESS')
  const raw = environment.GUEST_ORDER_SESSION_TTL_SECONDS ?? '',
    sessionTtlSeconds = Number(raw)
  if (
    !/^[1-9]\d*$/.test(raw) ||
    !Number.isSafeInteger(sessionTtlSeconds) ||
    sessionTtlSeconds < 60 ||
    sessionTtlSeconds > 604800
  )
    throw new ConfigurationError(['guest_session_configuration'])
  return { ...proof, sessionTtlSeconds }
}

const loadEmailVerificationOptions = (environment: NodeJS.ProcessEnv) =>
  loadProofOptions(environment, 'EMAIL_VERIFICATION')

export type { BrowserSecurityOptions, GuestAccessOptions, RecoveryOptions, SessionOptions }
export {
  loadAdminRecoveryOptions,
  loadBrowserSecurityOptions,
  loadEmailChangeOptions,
  loadEmailVerificationOptions,
  loadGuestAccessOptions,
  loadRecoveryOptions,
  loadSessionOptions,
  securitySecretSchema,
  validateBrowserSecurityOptions,
  validateSessionOptions,
}

import { z } from 'zod'
import { ConfigurationError } from './errors.js'
import {
  createProofEncryption,
  type ProofEncryption,
} from '../modules/auth/proof-envelope.js'

export type RecoveryOptions = {
  ttlSeconds: number
  cooldownSeconds: number
  responseFloorMs: number
  storefrontOrigin: string
  encryption: ProofEncryption
}
function loadProofOptions(
  environment: NodeJS.ProcessEnv,
  prefix: 'PASSWORD_RESET' | 'EMAIL_CHANGE',
): RecoveryOptions {
  try {
    const integer = (key: string, min: number, max: number) => {
      const raw = environment[key] ?? ''
      const value = Number(raw)
      if (
        !/^[1-9]\d*$/.test(raw) ||
        !Number.isSafeInteger(value) ||
        value < min ||
        value > max
      )
        throw new Error()
      return value
    }
    const origin = new URL(environment.STOREFRONT_ORIGIN ?? '')
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== environment.STOREFRONT_ORIGIN ||
      origin.username ||
      origin.password
    )
      throw new Error()
    const parsed: unknown = JSON.parse(environment.AUTH_PROOF_KEYS_JSON ?? '')
    const keys = z.record(z.string(), z.string()).parse(parsed)
    if (
      Object.values(keys).some(
        (key) =>
          key === environment.SESSION_SECRET ||
          key === environment.HEALTH_MONITOR_TOKEN,
      )
    )
      throw new Error()
    return {
      ttlSeconds: integer(`${prefix}_TTL_SECONDS`, 60, 1800),
      cooldownSeconds: integer(`${prefix}_COOLDOWN_SECONDS`, 60, 3600),
      responseFloorMs: integer(`${prefix}_RESPONSE_FLOOR_MS`, 100, 5000),
      storefrontOrigin: origin.origin,
      encryption: createProofEncryption(
        environment.AUTH_PROOF_ACTIVE_KEY_VERSION ?? '',
        keys,
      ),
    }
  } catch {
    throw new ConfigurationError([
      prefix === 'PASSWORD_RESET'
        ? 'password_recovery_configuration'
        : 'email_change_configuration',
    ])
  }
}

export const loadRecoveryOptions = (environment: NodeJS.ProcessEnv) =>
  loadProofOptions(environment, 'PASSWORD_RESET')
export const loadEmailChangeOptions = (environment: NodeJS.ProcessEnv) =>
  loadProofOptions(environment, 'EMAIL_CHANGE')

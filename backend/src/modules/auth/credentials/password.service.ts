import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '../../../shared/errors/app-error.js'

// Owner accepted 19 October 2026. Do not normalize or trim credentials.
const minScalars = 12,
  maxScalars = 128,
  maxBytes = 512
export const newPasswordPolicy = z
  .string()
  .refine(
    (value) =>
      !/[\uD800-\uDFFF]/u.test(value) &&
      [...value].length >= minScalars &&
      [...value].length <= maxScalars &&
      Buffer.byteLength(value, 'utf8') <= maxBytes,
  )
  .meta({
    minLength: minScalars,
    maxLength: maxScalars,
    description: `No normalization; at most ${maxBytes} UTF-8 bytes, no unpaired surrogates. Runtime policy remains authoritative.`,
  })
const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const
let running = 0
function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (running >= 2) return Promise.reject(new ApiError('SERVICE_UNAVAILABLE'))
  running++
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => {
      running--
      if (error) reject(new ApiError('SERVICE_UNAVAILABLE'))
      else resolve(key)
    })
  })
}
export async function hashPassword(password: string) {
  if (!newPasswordPolicy.safeParse(password).success) throw new ApiError('VALIDATION_FAILED')
  const salt = randomBytes(16),
    key = await derive(password, salt)
  return `scrypt$v1$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`
}
// Fixed valid-cost fallback: missing/disabled/unsupported records still execute a KDF.
const dummySalt = Buffer.alloc(16),
  dummyKey = Buffer.alloc(64)
export async function verifyPassword(password: string, encoded: string | undefined) {
  if (!password || /[\uD800-\uDFFF]/u.test(password) || Buffer.byteLength(password, 'utf8') > 4096)
    return false
  const match = encoded?.match(/^scrypt\$v1\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/)
  const salt = match?.[1] ? Buffer.from(match[1], 'hex') : dummySalt
  const expected = match?.[2] ? Buffer.from(match[2], 'hex') : dummyKey
  const actual = await derive(password, salt)
  return timingSafeEqual(expected, actual) && Boolean(match)
}

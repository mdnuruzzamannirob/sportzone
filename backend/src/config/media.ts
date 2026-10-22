import { validateClamAvOptions } from '../providers/antivirus/clamav.schema.js'
import { validateCloudinaryOptions } from '../providers/cloudinary/cloudinary.schema.js'
import { z } from 'zod'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
export const mediaPolicySchema = z.strictObject({
  maxBytes: z
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
  maxPixels: z.int().min(1).max(100_000_000),
  allowedFormats: z
    .array(z.enum(['png', 'jpg', 'webp']))
    .min(1)
    .max(3),
  temporaryTtlSeconds: z
    .int()
    .min(60)
    .max(7 * 86400),
  privateUrlTtlSeconds: z.int().min(1).max(300),
})
export type MediaPolicy = z.infer<typeof mediaPolicySchema>
export function validateMediaPolicy(input: unknown): Readonly<MediaPolicy> {
  const parsed = mediaPolicySchema.safeParse(input)
  if (!parsed.success) throw new ConfigurationError(['media_policy'])
  return Object.freeze({ ...parsed.data, allowedFormats: [...new Set(parsed.data.allowedFormats)] })
}
// No policy defaults or activation from an unapproved environment configuration.
export function loadMediaConfiguration(environment: NodeJS.ProcessEnv) {
  let policy: unknown
  try {
    policy = JSON.parse(environment.MEDIA_POLICY_JSON ?? '')
  } catch {
    throw new ConfigurationError(['media_policy'])
  }
  const partial = mediaPolicySchema.omit({ temporaryTtlSeconds: true }).safeParse(policy)
  if (!partial.success) throw new ConfigurationError(['media_policy'])
  if (environment.MEDIA_ENABLED !== 'true' || environment.MEDIA_SCANNER !== 'clamav')
    throw new ConfigurationError(['media_activation'])
  return {
    policy: validateMediaPolicy({
      ...partial.data,
      temporaryTtlSeconds: Number(environment.MEDIA_TEMP_TTL_SECONDS),
    }),
    scanner: validateClamAvOptions({
      host: environment.MEDIA_SCANNER_HOST ?? '',
      port: Number(environment.MEDIA_SCANNER_PORT),
      timeoutMs: Number(environment.MEDIA_SCANNER_TIMEOUT_MS),
    }),
    cloud: validateCloudinaryOptions({
      cloudName: environment.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: environment.CLOUDINARY_API_KEY ?? '',
      apiSecret: environment.CLOUDINARY_API_SECRET ?? '',
      timeoutMs: Number(environment.MEDIA_PROVIDER_TIMEOUT_MS),
    }),
  }
}

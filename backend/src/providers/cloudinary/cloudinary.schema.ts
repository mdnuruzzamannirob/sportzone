import { z } from 'zod'
import { ConfigurationError } from '../../shared/errors/configuration-error.js'

const optionsSchema = z.strictObject({
  cloudName: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  apiKey: z.string().regex(/^[0-9]{1,64}$/),
  apiSecret: z
    .string()
    .min(8)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
  timeoutMs: z.int().min(1).max(60000),
})
export type CloudinaryOptions = z.infer<typeof optionsSchema>
export function validateCloudinaryOptions(input: unknown): Readonly<CloudinaryOptions> {
  const parsed = optionsSchema.safeParse(input)
  if (!parsed.success) throw new ConfigurationError(['cloudinary_configuration'])
  return Object.freeze(parsed.data)
}
export const identity = /^sportzone\/[a-f0-9]{24}$/
export const assetSchema = z.object({
  public_id: z.string(),
  resource_type: z.literal('image'),
  type: z.enum(['upload', 'authenticated']),
  format: z.enum(['png', 'jpg', 'webp']),
  bytes: z.int().positive(),
  width: z.int().positive(),
  height: z.int().positive(),
  context: z.object({
    custom: z.object({ media_digest: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
})

export const deletionSchema = z.object({ result: z.enum(['ok', 'not found']) })

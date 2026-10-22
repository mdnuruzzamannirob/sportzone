import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ConfigurationError } from '../../config/errors.js'
import { assertOutsideTransaction } from '../../db/transaction.js'
import type {
  MediaFormat,
  MediaLookup,
  MediaProvider,
} from '../../modules/media/media.types.js'
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
export function validateCloudinaryOptions(
  input: unknown,
): Readonly<CloudinaryOptions> {
  const parsed = optionsSchema.safeParse(input)
  if (!parsed.success)
    throw new ConfigurationError(['cloudinary_configuration'])
  return Object.freeze(parsed.data)
}
const identity = /^sportzone\/[a-f0-9]{24}$/
const assetSchema = z.object({
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
async function body(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing provider response')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const item = await reader.read()
    if (item.done) break
    size += item.value.length
    if (size > 65536) {
      await reader.cancel()
      throw new Error('Provider response limit')
    }
    chunks.push(item.value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export function createCloudinaryAdapter(
  input: CloudinaryOptions,
  transport: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
): MediaProvider {
  const options = validateCloudinaryOptions(input)
  const root = `https://api.cloudinary.com/v1_1/${options.cloudName}`
  const auth = `Basic ${Buffer.from(`${options.apiKey}:${options.apiSecret}`).toString('base64')}`
  const safeId = (value: string) => {
    if (!identity.test(value)) throw new Error('Invalid media identity')
    return value
  }
  const request = (url: string, init: RequestInit) =>
    transport(url, {
      ...init,
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: 'error',
    })
  async function asset(
    response: Response,
    publicId: string,
    delivery: 'upload' | 'authenticated',
  ): Promise<MediaLookup> {
    if (response.status !== 200) {
      await response.body?.cancel()
      return { kind: 'uncertain' }
    }
    const parsed = assetSchema.safeParse(await body(response))
    if (
      !parsed.success ||
      parsed.data.public_id !== publicId ||
      parsed.data.type !== delivery
    )
      return { kind: 'uncertain' }
    const value = parsed.data
    return {
      kind: 'found',
      asset: {
        publicId,
        delivery,
        format: value.format,
        size: value.bytes,
        width: value.width,
        height: value.height,
        digest: value.context.custom.media_digest,
      },
    }
  }
  return {
    async upload(input) {
      assertOutsideTransaction()
      safeId(input.publicId)
      try {
        const form = new FormData()
        form.set(
          'file',
          new Blob([Uint8Array.from(input.file)], {
            type:
              input.format === 'jpg' ? 'image/jpeg' : `image/${input.format}`,
          }),
          `asset.${input.format}`,
        )
        form.set('public_id', input.publicId)
        form.set('type', input.delivery)
        form.set('overwrite', 'false')
        form.set('unique_filename', 'false')
        form.set('use_filename', 'false')
        form.set('context', `media_digest=${input.digest}`)
        return await asset(
          await request(`${root}/image/upload`, { method: 'POST', body: form }),
          input.publicId,
          input.delivery,
        )
      } catch {
        return { kind: 'uncertain' }
      }
    },
    async lookup(publicId, delivery) {
      assertOutsideTransaction()
      safeId(publicId)
      try {
        const response = await request(
          `${root}/resources/image/${delivery}/${encodeURIComponent(publicId)}?context=true`,
          { method: 'GET' },
        )
        if (response.status === 404) {
          await response.body?.cancel()
          return { kind: 'missing' }
        }
        return await asset(response, publicId, delivery)
      } catch {
        return { kind: 'uncertain' }
      }
    },
    async remove(publicId, delivery) {
      assertOutsideTransaction()
      safeId(publicId)
      try {
        const response = await request(`${root}/image/destroy`, {
          method: 'POST',
          body: new URLSearchParams({
            public_id: publicId,
            type: delivery,
            invalidate: 'true',
          }),
        })
        if (response.status !== 200) {
          await response.body?.cancel()
          return 'uncertain'
        }
        const parsed = z
          .object({ result: z.enum(['ok', 'not found']) })
          .safeParse(await body(response))
        return parsed.success ? 'deleted' : 'uncertain'
      } catch {
        return 'uncertain'
      }
    },
    publicUrl(publicId: string, format: MediaFormat) {
      safeId(publicId)
      return `https://res.cloudinary.com/${options.cloudName}/image/upload/${publicId}.${format}`
    },
    privateUrl(publicId, format, expiresAt) {
      safeId(publicId)
      const timestamp = Math.floor(clock().getTime() / 1000)
      const expires_at = Math.floor(expiresAt.getTime() / 1000)
      if (
        !Number.isSafeInteger(expires_at) ||
        expires_at <= timestamp ||
        expires_at > timestamp + 300
      )
        throw new Error('Invalid delivery lifetime')
      const params = {
        expires_at: String(expires_at),
        format,
        public_id: publicId,
        timestamp: String(timestamp),
        type: 'authenticated',
      }
      const canonical = Object.entries(params)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, value]) => `${key}=${value}`)
        .join('&')
      const signature = createHash('sha1')
        .update(canonical + options.apiSecret)
        .digest('hex')
      return `${root}/image/download?${new URLSearchParams({ ...params, api_key: options.apiKey, signature })}`
    },
  }
}

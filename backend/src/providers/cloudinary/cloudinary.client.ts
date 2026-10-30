import { createHash } from 'node:crypto'
import type { MediaFormat, MediaLookup, MediaProvider } from '../../modules/media/media.types.js'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import {
  assetSchema,
  deletionSchema,
  identity,
  validateCloudinaryOptions,
  type CloudinaryOptions,
} from './cloudinary.schema.js'
export {
  validateCloudinaryOptions,
  type CloudinaryOptions,
} from './cloudinary.schema.js'
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
    if (!parsed.success || parsed.data.public_id !== publicId || parsed.data.type !== delivery)
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
            type: input.format === 'jpg' ? 'image/jpeg' : `image/${input.format}`,
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
        const parsed = deletionSchema.safeParse(await body(response))
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

// Read-only credential/reachability probe. This does not qualify upload or delivery security.
export async function checkCloudinaryConnection(
  input: CloudinaryOptions,
  transport: typeof fetch = fetch,
): Promise<'verified' | 'unauthorized' | 'unavailable'> {
  assertOutsideTransaction()
  const options = validateCloudinaryOptions(input)
  try {
    const response = await transport(`https://api.cloudinary.com/v1_1/${options.cloudName}/ping`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${options.apiKey}:${options.apiSecret}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: 'error',
    })
    if (response.status !== 200) {
      await response.body?.cancel()
      return [401, 403].includes(response.status) ? 'unauthorized' : 'unavailable'
    }
    const result = await body(response)
    return result !== null &&
      typeof result === 'object' &&
      'status' in result &&
      result.status === 'ok'
      ? 'verified'
      : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

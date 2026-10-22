import type { MediaPolicy } from '../../src/config/media.js'
import type {
  MediaFile,
  MediaProvider,
  ProviderAsset,
} from '../../src/modules/media/media.types.js'
export const mediaPolicy: MediaPolicy = {
  maxBytes: 1024,
  maxPixels: 10000,
  allowedFormats: ['png', 'jpg', 'webp'],
  temporaryTtlSeconds: 60,
  privateUrlTtlSeconds: 30,
}
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=',
  'base64',
)
export const imageFile = (): MediaFile => ({
  name: 'synthetic.png',
  mimeType: 'image/png',
  bytes: Uint8Array.from(png),
})
export function fakeMediaProvider() {
  const assets = new Map<string, ProviderAsset>()
  const state = {
    uploads: 0,
    deletes: 0,
    uncertainUpload: false,
    uncertainDelete: false,
    unknownLookup: false,
    wrongMetadata: false,
  }
  const adapter: MediaProvider = {
    async upload(input) {
      state.uploads++
      if (assets.has(input.publicId)) return { kind: 'uncertain' }
      const asset: ProviderAsset = {
        publicId: input.publicId,
        delivery: input.delivery,
        format: input.format,
        size: input.file.length,
        width: state.wrongMetadata ? 1000000 : 1,
        height: 1,
        digest: input.digest,
      }
      assets.set(input.publicId, asset)
      return state.uncertainUpload ? { kind: 'uncertain' } : { kind: 'found', asset }
    },
    async lookup(publicId, delivery) {
      if (state.unknownLookup) return { kind: 'uncertain' }
      const asset = assets.get(publicId)
      return asset && asset.delivery === delivery ? { kind: 'found', asset } : { kind: 'missing' }
    },
    async remove(publicId) {
      state.deletes++
      if (state.uncertainDelete) return 'uncertain'
      assets.delete(publicId)
      return 'deleted'
    },
    publicUrl: (publicId) => `https://res.cloudinary.com/synthetic/image/upload/${publicId}.png`,
    privateUrl: (publicId, _format, expiresAt) =>
      `https://api.cloudinary.com/synthetic/${publicId}?expires_at=${expiresAt.getTime()}`,
  }
  return { assets, state, adapter }
}

import type { Connection, Types } from 'mongoose'
import type { MediaProvider } from './media.types.js'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { mediaModel } from './media.model.js'

export type PublicImageCandidate = {
  targetId: Types.ObjectId
  targetType: 'product' | 'category'
  publicId: string
  alt: string
}
// Read-only publication boundary: never reuse a caller/stored URL or sign private delivery.
export function publicMediaService(
  connection: Connection,
  provider?: Pick<MediaProvider, 'publicUrl'>,
) {
  return async (candidates: readonly PublicImageCandidate[]) => {
    const images = new Map<string, { url: string; alt: string }>()
    if (!provider || !candidates.length) return images
    if (candidates.length > 100) throw new RangeError('Public media batch is too large')
    const model = mediaModel(connection)
    try {
      await verifyDeclaredIndexes(model)
    } catch {
      return images
    }
    const rows = await model
      .find({
        publicId: { $in: candidates.map((candidate) => candidate.publicId) },
        assetKind: 'public_media',
        access: 'public',
        status: 'attached',
        scanStatus: 'clean',
      })
      .select('publicId format references')
      .maxTimeMS(3000)
      .lean()
    for (const candidate of candidates) {
      const row = rows.find(
        (row) =>
          row.publicId === candidate.publicId &&
          row.references.some(
            (ref) =>
              ref.targetType === candidate.targetType && ref.targetId.equals(candidate.targetId),
          ),
      )
      if (!row) continue
      if (!candidate.alt.trim() || [...candidate.alt].length > 120) continue
      const generated = provider.publicUrl(row.publicId, row.format)
      if (!URL.canParse(generated)) continue
      const url = new URL(generated)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        continue
      images.set(candidate.targetId.toHexString(), { url: url.href, alt: candidate.alt })
    }
    return images
  }
}

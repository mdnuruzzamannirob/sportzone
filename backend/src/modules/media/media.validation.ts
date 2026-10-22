import { createHash } from 'node:crypto'
import { ApiError } from '../../common/errors.js'
import type { MediaPolicy } from '../../config/media.js'
import type { MediaFile, MediaFormat } from './media.types.js'
function dimensions(bytes: Buffer, format: MediaFormat) {
  if (
    format === 'png' &&
    bytes.length >= 24 &&
    bytes.toString('ascii', 12, 16) === 'IHDR'
  )
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] as const
  if (format === 'jpg') {
    for (let offset = 2; offset + 4 < bytes.length; ) {
      if (bytes[offset] !== 255) break
      const marker = bytes[offset + 1],
        length = bytes.readUInt16BE(offset + 2)
      if (length < 2 || offset + 2 + length > bytes.length) break
      if (
        marker !== undefined &&
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      )
        return [
          bytes.readUInt16BE(offset + 7),
          bytes.readUInt16BE(offset + 5),
        ] as const
      offset += length + 2
    }
  }
  if (format === 'webp' && bytes.length >= 25) {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8X' && bytes.length >= 30)
      return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1] as const
    if (
      chunk === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))
    )
      return [
        bytes.readUInt16LE(26) & 16383,
        bytes.readUInt16LE(28) & 16383,
      ] as const
    if (chunk === 'VP8L' && bytes[20] === 47) {
      const packed = bytes.readUInt32LE(21)
      return [(packed & 16383) + 1, ((packed >>> 14) & 16383) + 1] as const
    }
  }
  throw new ApiError('VALIDATION_FAILED')
}
export function inspectFile(file: MediaFile, policy: MediaPolicy) {
  if (
    !(file.bytes instanceof Uint8Array) ||
    file.bytes.length < 12 ||
    file.bytes.length > policy.maxBytes ||
    file.name.length > 200 ||
    /[/\\]/.test(file.name)
  )
    throw new ApiError('VALIDATION_FAILED')
  const bytes = Buffer.from(file.bytes)
  let format: MediaFormat
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    format = 'png'
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    format = 'jpg'
  else if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    format = 'webp'
  else throw new ApiError('VALIDATION_FAILED')
  const [width, height] = dimensions(bytes, format)
  if (width <= 0 || height <= 0 || width > policy.maxPixels / height)
    throw new ApiError('VALIDATION_FAILED')
  const extension = file.name.toLowerCase().split('.').at(-1)
  const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
  if (
    !policy.allowedFormats.includes(format) ||
    file.mimeType !== mimeType ||
    (format === 'jpg'
      ? !['jpg', 'jpeg'].includes(extension ?? '')
      : extension !== format)
  )
    throw new ApiError('VALIDATION_FAILED')
  return {
    format,
    mimeType,
    size: bytes.length,
    digest: createHash('sha256').update(bytes).digest('hex'),
  }
}

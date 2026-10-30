import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import {
  createCloudinaryAdapter,
  checkCloudinaryConnection,
} from '../../src/providers/cloudinary/cloudinary.client.js'
import { validateMediaPolicy, loadMediaConfiguration } from '../../src/config/media.js'
import { inspectFile } from '../../src/modules/media/media.schema.js'
import { imageFile, mediaPolicy } from '../helpers/media.js'
const options = {
  cloudName: 'synthetic',
  apiKey: '12345',
  apiSecret: 'synthetic_secret_only',
  timeoutMs: 1000,
}
const publicId = 'sportzone/012345678901234567890123',
  digest = 'a'.repeat(64)
const metadata = {
  public_id: publicId,
  resource_type: 'image',
  type: 'authenticated',
  format: 'png',
  bytes: 68,
  width: 1,
  height: 1,
  context: { custom: { media_digest: digest } },
}
it('verifies extension, MIME, signature and configured bounds; rejects SVG/path/oversize', () => {
  expect(inspectFile(imageFile(), mediaPolicy)).toMatchObject({
    format: 'png',
    mimeType: 'image/png',
    size: imageFile().bytes.length,
  })
  for (const patch of [
    { name: 'wrong.jpg' },
    { mimeType: 'image/jpeg' },
    { name: '../image.png' },
    { bytes: new Uint8Array(2000) },
    { name: 'x.svg', mimeType: 'image/svg+xml', bytes: Buffer.from('<svg onload="bad()"></svg>') },
  ])
    expect(() => inspectFile({ ...imageFile(), ...patch }, mediaPolicy)).toThrow()
  expect(() => validateMediaPolicy({ ...mediaPolicy, maxBytes: 0 })).toThrow()
  expect(() => loadMediaConfiguration({ MEDIA_ENABLED: 'true' })).toThrow()
  expect(() =>
    loadMediaConfiguration({
      MEDIA_ENABLED: 'false',
      MEDIA_POLICY_JSON: JSON.stringify(mediaPolicy),
    }),
  ).toThrow()
})
it('checks image dimensions before external upload, including truncated and oversized image headers', () => {
  const oversized = Buffer.from(imageFile().bytes)
  oversized.writeUInt32BE(10001, 16)
  expect(() => inspectFile({ ...imageFile(), bytes: oversized }, mediaPolicy)).toThrow()
  expect(() =>
    inspectFile({ ...imageFile(), bytes: oversized.subarray(0, 12) }, mediaPolicy),
  ).toThrow()
  const jpeg = Buffer.from([255, 216, 255, 192, 0, 7, 8, 0, 1, 0, 1, 0])
  expect(
    inspectFile({ name: 'a.jpg', mimeType: 'image/jpeg', bytes: jpeg }, mediaPolicy).format,
  ).toBe('jpg')
  const webp = Buffer.alloc(30)
  webp.write('RIFF', 0)
  webp.write('WEBP', 8)
  webp.write('VP8X', 12)
  expect(
    inspectFile({ name: 'a.webp', mimeType: 'image/webp', bytes: webp }, mediaPolicy).format,
  ).toBe('webp')
})
it('uploads only to fixed HTTPS backend endpoint with no overwrite or original filename', async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json(metadata))
  const adapter = createCloudinaryAdapter(options, transport)
  expect(
    (
      await adapter.upload({
        publicId,
        delivery: 'authenticated',
        format: 'png',
        digest,
        file: imageFile().bytes,
      })
    ).kind,
  ).toBe('found')
  const [url, init] = transport.mock.calls[0] ?? []
  expect(url).toBe('https://api.cloudinary.com/v1_1/synthetic/image/upload')
  expect(init?.redirect).toBe('error')
  const form = init?.body
  expect(form).toBeInstanceOf(FormData)
  if (!(form instanceof FormData)) throw new Error('Missing multipart fixture')
  expect(form.get('overwrite')).toBe('false')
  expect(form.get('type')).toBe('authenticated')
  expect(form.get('context')).toBe(`media_digest=${digest}`)
  expect(JSON.stringify(init)).not.toContain('original_filename')
})
it('distinguishes missing objects, forged metadata, rejected responses and uncertain outcomes without retries', async () => {
  const missing = createCloudinaryAdapter(options, async () => new Response(null, { status: 404 }))
  expect(await missing.lookup(publicId, 'authenticated')).toEqual({ kind: 'missing' })
  const forged = createCloudinaryAdapter(options, async () =>
    Response.json({ ...metadata, public_id: 'foreign' }),
  )
  expect(await forged.lookup(publicId, 'authenticated')).toEqual({ kind: 'uncertain' })
  const transport = vi.fn<typeof fetch>(async () => {
    throw new Error('synthetic network timeout')
  })
  const uncertain = createCloudinaryAdapter(options, transport)
  expect(await uncertain.remove(publicId, 'authenticated')).toBe('uncertain')
  expect(transport).toHaveBeenCalledTimes(1)
  expect(
    await createCloudinaryAdapter(options, async () =>
      Response.json({ result: 'not found' }),
    ).remove(publicId, 'authenticated'),
  ).toBe('deleted')
  expect(
    await createCloudinaryAdapter(options, async () => Response.json({ result: 'queued' })).remove(
      publicId,
      'authenticated',
    ),
  ).toBe('uncertain')
})
it('bounds response bodies and rejects caller-controlled provider identities', async () => {
  const transport = vi.fn<typeof fetch>(async () => new Response('x'.repeat(65537)))
  expect(await createCloudinaryAdapter(options, transport).lookup(publicId, 'upload')).toEqual({
    kind: 'uncertain',
  })
  await expect(
    createCloudinaryAdapter(options, transport).lookup('../../foreign', 'upload'),
  ).rejects.toThrow()
  expect(transport).toHaveBeenCalledTimes(1)
  expect(() => createCloudinaryAdapter({ ...options, cloudName: '../evil' })).toThrow()
})
it('generates bounded authenticated download URLs without exposing API secret', () => {
  const now = new Date('2026-10-21T00:00:00Z')
  const adapter = createCloudinaryAdapter(options, fetch, () => now)
  const url = new URL(adapter.privateUrl(publicId, 'png', new Date(now.getTime() + 30000)))
  expect(url.pathname).toBe('/v1_1/synthetic/image/download')
  expect(url.searchParams.get('type')).toBe('authenticated')
  expect(url.searchParams.get('expires_at')).toBe(String(Math.floor(now.getTime() / 1000) + 30))
  const signature = url.searchParams.get('signature')
  const expected = createHash('sha1')
    .update(
      `expires_at=${Math.floor(now.getTime() / 1000) + 30}&format=png&public_id=${publicId}&timestamp=${Math.floor(now.getTime() / 1000)}&type=authenticated${options.apiSecret}`,
    )
    .digest('hex')
  expect(signature).toBe(expected)
  expect(url.toString()).not.toContain(options.apiSecret)
  expect(() => adapter.privateUrl(publicId, 'png', new Date(now.getTime() + 301000))).toThrow()
})
it('requires explicit scanner/account settings and uses the canonical temporary lifetime key', () => {
  const { temporaryTtlSeconds, ...policy } = mediaPolicy
  const environment = {
    MEDIA_ENABLED: 'true',
    MEDIA_SCANNER: 'clamav',
    MEDIA_SCANNER_HOST: '127.0.0.1',
    MEDIA_SCANNER_PORT: '3310',
    MEDIA_SCANNER_TIMEOUT_MS: '1000',
    MEDIA_POLICY_JSON: JSON.stringify(policy),
    MEDIA_TEMP_TTL_SECONDS: String(temporaryTtlSeconds),
    CLOUDINARY_CLOUD_NAME: options.cloudName,
    CLOUDINARY_API_KEY: options.apiKey,
    CLOUDINARY_API_SECRET: options.apiSecret,
    MEDIA_PROVIDER_TIMEOUT_MS: '1000',
  }
  expect(loadMediaConfiguration(environment)).toMatchObject({
    policy: mediaPolicy,
    scanner: { port: 3310 },
  })
  expect(() => loadMediaConfiguration({ ...environment, MEDIA_TEMP_TTL_SECONDS: '' })).toThrow()
  expect(() => loadMediaConfiguration({ ...environment, CLOUDINARY_API_SECRET: '' })).toThrow()
  expect(() => loadMediaConfiguration({ ...environment, MEDIA_SCANNER_HOST: '' })).toThrow()
})

it('Cloudinary preflight is read-only, refuses redirects and verifies the response body', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"ok"}'))
  expect(await checkCloudinaryConnection(options, transport)).toBe('verified')
  expect(transport.mock.calls[0]?.[0]).toBe('https://api.cloudinary.com/v1_1/synthetic/ping')
  expect(transport.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' })
  expect(transport.mock.calls[0]?.[1]?.method).toBeUndefined()
  transport.mockResolvedValue(new Response('{"status":"unknown"}'))
  expect(await checkCloudinaryConnection(options, transport)).toBe('unavailable')
  transport.mockResolvedValue(new Response('private diagnostic', { status: 401 }))
  expect(await checkCloudinaryConnection(options, transport)).toBe('unauthorized')
  transport.mockResolvedValue(new Response('private diagnostic', { status: 503 }))
  expect(await checkCloudinaryConnection(options, transport)).toBe('unavailable')
  transport.mockRejectedValue(new Error('private network detail'))
  expect(await checkCloudinaryConnection(options, transport)).toBe('unavailable')
})

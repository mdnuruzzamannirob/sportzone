import { Router, type RequestHandler } from 'express'
import { ApiError } from '../../common/errors.js'
import { respond } from '../../common/responses.js'
import type { BrowserSecurity } from '../auth/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/session.http.js'
import type { SessionService } from '../auth/session.service.js'
import type { MediaService } from './media.service.js'
import type { MediaFile } from './media.types.js'
// Native WHATWG multipart parser, with an authenticated, bounded body before parsing.
async function multipart(req: import('express').Request, maxBytes: number): Promise<MediaFile> {
  if (
    !req.is('multipart/form-data') ||
    req.get('Content-Encoding') ||
    Object.keys(req.query).length
  )
    throw new ApiError('INVALID_REQUEST')
  const limit = maxBytes + 16384
  if (Number(req.get('Content-Length') ?? 0) > limit) throw new ApiError('VALIDATION_FAILED')
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      if (!(chunk instanceof Buffer)) throw new Error('Invalid body')
      size += chunk.length
      if (size > limit) throw new ApiError('VALIDATION_FAILED')
      chunks.push(chunk)
    }
    const form = await new Request('https://multipart.invalid/', {
      method: 'POST',
      headers: { 'Content-Type': req.get('Content-Type') ?? '' },
      body: Buffer.concat(chunks),
    }).formData()
    const values = [...form.entries()]
    const file = values[0]?.[1]
    if (
      values.length !== 1 ||
      values[0]?.[0] !== 'file' ||
      typeof file === 'string' ||
      !file ||
      file.size > maxBytes
    )
      throw new ApiError('VALIDATION_FAILED')
    return { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
  } catch (error) {
    req.resume()
    if (error instanceof ApiError) throw error
    throw new ApiError('INVALID_REQUEST')
  }
}
export function mediaRoutes(
  service: MediaService,
  security: BrowserSecurity,
  sessions: SessionService,
  maxBytes: number,
  throttle: RequestHandler,
) {
  const router = Router(),
    http = createSessionHttp(sessions)
  const paths = ['/admin/media/uploads', '/admin/media/:assetId']
  for (const path of paths) router.options(path, security.cors('admin'))
  router.use(
    '/admin/media',
    security.cors('admin'),
    security.require('admin', 'admin'),
    http.require('admin'),
    throttle,
  )
  router.post('/admin/media/uploads', async (req, res) => {
    const file = await multipart(req, maxBytes)
    respond(
      res,
      await service.uploadPublic(readSessionCookie(req.get('Cookie'), 'admin'), file),
      201,
    )
  })
  router.delete('/admin/media/:assetId', async (req, res) => {
    if (
      req.body !== undefined ||
      Object.keys(req.query).length ||
      typeof req.params.assetId !== 'string'
    )
      throw new ApiError('INVALID_REQUEST')
    const deleted = await service.cleanup(req.params.assetId, {
      adminCredential: readSessionCookie(req.get('Cookie'), 'admin'),
    })
    if (!deleted) throw new ApiError('SERVICE_UNAVAILABLE')
    res.status(204).end()
  })
  return router
}

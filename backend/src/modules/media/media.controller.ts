import type { Request, Response } from 'express'
import { ApiError } from '../../shared/errors/app-error.js'
import { respond } from '../../shared/responses.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import type { MediaService } from './media.service.js'
import type { MediaFile } from './media.types.js'

// Native WHATWG multipart parser, with an authenticated, bounded body before parsing.
async function multipartForm(req: import('express').Request, maxBytes: number) {
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
    return form
  } catch (error) {
    req.resume()
    if (error instanceof ApiError) throw error
    throw new ApiError('INVALID_REQUEST')
  }
}
async function mediaFile(
  file: FormDataEntryValue | null | undefined,
  maxBytes: number,
): Promise<MediaFile> {
  if (!file || typeof file === 'string' || file.size > maxBytes)
    throw new ApiError('VALIDATION_FAILED')
  return {
    name: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  }
}
export async function claimEvidenceMultipart(req: import('express').Request, maxBytes: number) {
  const form = await multipartForm(req, maxBytes)
  const entries = [...form.entries()]
  if (
    entries.some(([key]) => !['file', 'claimType', 'orderItemIds[]'].includes(key)) ||
    form.getAll('file').length !== 1 ||
    form.getAll('claimType').length !== 1 ||
    form.getAll('orderItemIds[]').some((value) => typeof value !== 'string')
  )
    throw new ApiError('VALIDATION_FAILED')
  return {
    file: await mediaFile(form.get('file'), maxBytes),
    input: {
      claimType: form.get('claimType'),
      orderItemIds: form.getAll('orderItemIds[]'),
    },
  }
}
async function multipart(req: import('express').Request, maxBytes: number) {
  const form = await multipartForm(req, maxBytes)
  if ([...form.keys()].length !== 1 || form.getAll('file').length !== 1)
    throw new ApiError('VALIDATION_FAILED')
  return mediaFile(form.get('file'), maxBytes)
}
export function createMediaController(service: MediaService, maxBytes: number) {
  return {
    async upload(req: Request, res: Response) {
      const file = await multipart(req, maxBytes)
      respond(
        res,
        await service.uploadPublic(readSessionCookie(req.get('Cookie'), 'admin'), file),
        200,
      )
    },
    async remove(req: Request, res: Response) {
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
    },
  }
}

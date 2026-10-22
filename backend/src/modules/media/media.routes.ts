import { Router, type RequestHandler } from 'express'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { MediaService } from './media.service.js'
import { createMediaController } from './media.controller.js'
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
  const controller = createMediaController(service, maxBytes)
  router.post('/admin/media/uploads', controller.upload)
  router.delete('/admin/media/:assetId', controller.remove)
  return router
}

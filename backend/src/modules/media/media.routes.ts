import { type RequestHandler, Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createMediaController } from './media.controller.js'
import type { MediaService } from './media.service.js'

function createMediaRoutes(
  service: MediaService,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
  maxBytes: number,
  throttle: RequestHandler,
) {
  const router = Router(),
    http = sessionHttp
  const paths = ['/admin/media/uploads', '/admin/media/:assetId']
  for (const path of paths) router.options(path, security.cors('admin'))
  router.use(
    '/admin/media',
    security.cors('admin'),
    security.require('admin', 'admin'),
    http.require('admin'),
    throttle,
  )
  const controller = createMediaController(service, maxBytes, sessionHttp)
  router.post('/admin/media/uploads', controller.upload)
  router.delete('/admin/media/:assetId', controller.remove)
  return router
}

export { createMediaRoutes }

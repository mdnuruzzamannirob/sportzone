import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import type { BrowserSecurity } from '../../auth/sessions/browser-security.service.js'
import type { SessionService } from '../../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../../auth/sessions/session.http.js'
import { categoryParams } from './category-admin.schema.js'
import type { categoryAdminService } from './category-admin.service.js'
export function categoryAdminRoutes(
  service: ReturnType<typeof categoryAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of [
    '/admin/categories',
    '/admin/categories/:categoryId',
    '/admin/categories/:categoryId/deactivate',
  ])
    router.options(path, security.cors('admin'))
  router.use(
    '/admin/categories',
    security.cors('admin'),
    security.require('admin', 'admin'),
    createSessionHttp(sessions).require('admin'),
    (_req, res, next) => {
      res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
      next()
    },
  )
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'admin')
  const id = (req: import('express').Request) => parseInput(categoryParams, req.params).categoryId
  router.get('/admin/categories', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  })
  router.post('/admin/categories', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.create(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  })
  router.patch('/admin/categories/:categoryId', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.patch(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  router.post('/admin/categories/:categoryId/deactivate', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.deactivate(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  return router
}

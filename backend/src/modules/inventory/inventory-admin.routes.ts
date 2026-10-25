import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import { inventoryParams } from './inventory-admin.schema.js'
import type { inventoryAdminService } from './inventory-admin.service.js'
export function inventoryAdminRoutes(
  service: ReturnType<typeof inventoryAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of [
    '/admin/inventory',
    '/admin/inventory/:variantId/movements',
    '/admin/inventory/:variantId/adjustments',
    '/admin/variants/:variantId',
  ])
    router.options(path, security.cors('admin'))
  for (const path of ['/admin/inventory', '/admin/variants'])
    router.use(
      path,
      security.cors('admin'),
      security.require('admin', 'admin'),
      createSessionHttp(sessions).require('admin'),
    )
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'admin')
  const id = (req: import('express').Request) => parseInput(inventoryParams, req.params).variantId
  router.get('/admin/inventory', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  })
  router.get('/admin/inventory/:variantId/movements', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.history(token(req), id(req), req.query)
    respond(res, result.data, 200, result.page)
  })
  router.post('/admin/inventory/:variantId/adjustments', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.adjust(token(req), id(req), req.body, req.get('Idempotency-Key')))
  })
  router.patch('/admin/variants/:variantId', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.threshold(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
    respond(res, result)
  })
  return router
}

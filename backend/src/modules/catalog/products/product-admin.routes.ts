import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import type { BrowserSecurity } from '../../auth/sessions/browser-security.service.js'
import type { SessionService } from '../../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../../auth/sessions/session.http.js'
import { productParams } from './product-admin.schema.js'
import { variantParams } from '../variants/variant.schema.js'
import type { productAdminService } from './product-admin.service.js'
export function productAdminRoutes(
  service: ReturnType<typeof productAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of [
    '/admin/products',
    '/admin/products/:productId',
    '/admin/products/:productId/deactivate',
    '/admin/products/:productId/variants',
    '/admin/variants/:variantId',
    '/admin/variants/:variantId/deactivate',
  ])
    router.options(path, security.cors('admin'))
  for (const path of ['/admin/products', '/admin/variants'])
    router.use(
      path,
      security.cors('admin'),
      security.require('admin', 'admin'),
      createSessionHttp(sessions).require('admin'),
      (_req, res, next) => {
        res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag, Location')
        next()
      },
    )
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'admin')
  const pid = (req: import('express').Request) => parseInput(productParams, req.params).productId
  const vid = (req: import('express').Request) => parseInput(variantParams, req.params).variantId
  const noQuery = (req: import('express').Request) => parseInput(z.strictObject({}), req.query)
  router.get('/admin/products', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const r = await service.list(token(req), req.query)
    respond(res, r.data, 200, r.page)
  })
  router.get('/admin/products/:productId', async (req, res) => {
    noQuery(req)
    parseInput(z.undefined(), req.body)
    const r = await service.detail(token(req), pid(req))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  })
  router.post('/admin/products', async (req, res) => {
    noQuery(req)
    const r = await service.create(token(req), req.body)
    res.set('ETag', `"${r.revision}"`)
    res.set('Location', `/api/v1/admin/products/${r.id}`)
    respond(res, r, 201)
  })
  router.patch('/admin/products/:productId', async (req, res) => {
    noQuery(req)
    const r = await service.patch(token(req), pid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  })
  router.post('/admin/products/:productId/deactivate', async (req, res) => {
    noQuery(req)
    const r = await service.deactivate(token(req), pid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  })
  router.post('/admin/products/:productId/variants', async (req, res) => {
    noQuery(req)
    const r = await service.createVariant(token(req), pid(req), req.body)
    res.set('ETag', `"${r.revision}"`)
    respond(res, r, 201)
  })
  router.patch('/admin/variants/:variantId', async (req, res) => {
    noQuery(req)
    const r = await service.patchVariant(token(req), vid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  })
  router.post('/admin/variants/:variantId/deactivate', async (req, res) => {
    noQuery(req)
    const r = await service.deactivateVariant(token(req), vid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  })
  return router
}

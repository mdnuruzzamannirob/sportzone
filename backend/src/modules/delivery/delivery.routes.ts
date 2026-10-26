import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import { zoneParams, chargeParams } from './delivery.schema.js'
import type { deliveryService } from './delivery.service.js'
export function deliveryRoutes(
  service: ReturnType<typeof deliveryService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of [
    '/admin/delivery/zones',
    '/admin/delivery/zones/:zoneId',
    '/admin/delivery/charges',
    '/admin/delivery/charges/:chargeId/activate',
    '/admin/delivery/charges/:chargeId/deactivate',
    '/admin/delivery/charges/:chargeId/supersede',
  ])
    router.options(path, security.cors('admin'))
  router.use(
    '/admin/delivery',
    security.cors('admin'),
    security.require('admin', 'admin'),
    createSessionHttp(sessions).require('admin'),
    (_req, res, next) => {
      res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
      next()
    },
  )
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'admin')
  router.get('/admin/delivery/zones', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.zones(token(req), req.query)
    respond(res, result.data, 200, result.page)
  })
  router.get('/admin/delivery/charges', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.charges(token(req), req.query)
    respond(res, result.data, 200, result.page)
  })
  router.post('/admin/delivery/zones', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.createZone(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  })
  router.patch('/admin/delivery/zones/:zoneId', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const id = parseInput(zoneParams, req.params).zoneId
    const result = await service.patchZone(token(req), id, req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  router.post('/admin/delivery/charges', async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.createCharge(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  })
  for (const action of ['activate', 'deactivate', 'supersede'] as const)
    router.post(`/admin/delivery/charges/:chargeId/${action}`, async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const id = parseInput(chargeParams, req.params).chargeId
      const result = await service.transition(
        token(req),
        id,
        action,
        req.body,
        req.get('If-Match'),
        req.get('Idempotency-Key'),
      )
      res.set('ETag', `"${'previous' in result ? result.previous.revision : result.revision}"`)
      respond(res, result)
    })
  return router
}

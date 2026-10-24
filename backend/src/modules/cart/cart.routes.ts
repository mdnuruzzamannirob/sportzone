import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { cartService } from './cart.service.js'
import { variantParams } from './cart.schema.js'

export function cartRoutes(
  service: ReturnType<typeof cartService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of ['/cart', '/cart/items/:variantId'])
    router.options(path, security.cors('storefront'))
  router.use(
    '/cart',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    createSessionHttp(sessions).require('customer'),
  )
  router.use('/cart', (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  })
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'customer')
  router.get('/cart', async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.read(token(req)))
  })
  router.put('/cart/items/:variantId', async (req, res) => {
    const { variantId } = parseInput(variantParams, req.params)
    respond(res, await service.put(token(req), variantId, req.body))
  })
  router.delete('/cart/items/:variantId', async (req, res) => {
    parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
    const { variantId } = parseInput(variantParams, req.params)
    respond(res, await service.remove(token(req), variantId))
  })
  return router
}

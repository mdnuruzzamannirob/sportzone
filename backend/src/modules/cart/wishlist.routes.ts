import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import {
  createSessionHttp,
  readSessionCookie,
} from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { wishlistParams } from './wishlist.schema.js'
import type { wishlistService } from './wishlist.service.js'

export function wishlistRoutes(
  service: ReturnType<typeof wishlistService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of ['/wishlist', '/wishlist/products/:productId'])
    router.options(path, security.cors('storefront'))
  router.use(
    '/wishlist',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    createSessionHttp(sessions).require('customer'),
  )
  router.use('/wishlist', (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  })
  const token = (req: import('express').Request) =>
    readSessionCookie(req.get('Cookie'), 'customer')
  router.get('/wishlist', async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.read(token(req)))
  })
  for (const method of ['put', 'delete'] as const)
    router[method]('/wishlist/products/:productId', async (req, res) => {
      parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
      const { productId } = parseInput(wishlistParams, req.params)
      respond(res, await service.set(token(req), productId, method === 'put'))
    })
  return router
}

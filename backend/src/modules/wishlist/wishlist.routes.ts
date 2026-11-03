import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createWishlistController } from './wishlist.controller.js'

import { wishlistParams } from './wishlist.schema.js'
import type { createWishlistService } from './wishlist.service.js'

function createWishlistRoutes(
  service: ReturnType<typeof createWishlistService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createWishlistController(service, sessionHttp)

  const router = Router()
  for (const path of ['/wishlist', '/wishlist/products/:productId'])
    router.options(path, security.cors('storefront'))
  router.use(
    '/wishlist',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    sessionHttp.require('customer'),
  )
  router.use('/wishlist', (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  })
  const token = (req: import('express').Request) =>
    sessionHttp.readSessionCookie(req.get('Cookie'), 'customer')
  router.get('/wishlist', controller.getWishlist)
  for (const method of ['put', 'delete'] as const)
    router[method]('/wishlist/products/:productId', async (req, res) => {
      parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
      const { productId } = parseInput(wishlistParams, req.params)
      respond(res, await service.set(token(req), productId, method === 'put'))
    })
  return router
}

export { createWishlistRoutes }

import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createCartController } from './cart.controller.js'

import type { createCartService } from './cart.service.js'

function createCartRoutes(
  service: ReturnType<typeof createCartService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createCartController(service, sessionHttp)

  const router = Router()
  for (const path of ['/cart', '/cart/items/:variantId', '/cart/merge'])
    router.options(path, security.cors('storefront'))
  router.use(
    '/cart',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    sessionHttp.require('customer'),
  )
  router.use('/cart', (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  })

  router.get('/cart', controller.getCart)
  router.post('/cart/merge', controller.postCartMerge)
  router.put('/cart/items/:variantId', controller.putCartItems)
  router.delete('/cart/items/:variantId', controller.deleteCartItems)
  return router
}

export { createCartRoutes }

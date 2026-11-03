import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { createCatalogController } from './catalog.controller.js'
import type { createCatalogService } from './catalog.service.js'

function createCatalogRoutes(
  service: ReturnType<typeof createCatalogService>,
  origins: readonly string[],
) {
  const controller = createCatalogController(service)

  const router = Router()
  const cors: RequestHandler = (req, res, next) => {
    res.vary('Origin')
    const origin = req.get('Origin')
    if (origin && !origins.includes(origin)) throw new ApiError('FORBIDDEN')
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id')
    }
    if (req.method === 'OPTIONS') {
      res.vary('Access-Control-Request-Method')
      res.vary('Access-Control-Request-Headers')
      const headers = (req.get('Access-Control-Request-Headers') ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      if (
        !origin ||
        !['GET', 'HEAD'].includes(req.get('Access-Control-Request-Method') ?? '') ||
        headers.some((value) => value !== 'content-type')
      )
        throw new ApiError('FORBIDDEN')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.status(204).end()
      return
    }
    parseInput(z.undefined(), req.body)
    next()
  }
  for (const path of [
    '/storefront/home',
    '/products',
    '/products/:slug',
    '/categories',
    '/categories/:slug',
  ])
    router.options(path, cors)
  router.get('/storefront/home', cors, controller.getStorefrontHome)
  router.get('/products', cors, controller.getProducts)
  router.get('/products/:slug', cors, controller.getProducts2)
  router.get('/categories', cors, controller.getCategories)
  router.get('/categories/:slug', cors, controller.getCategories2)
  return router
}

export { createCatalogRoutes }

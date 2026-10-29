import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { ApiError } from '../../shared/errors/app-error.js'
import type { catalogService } from './catalog.service.js'

export function catalogRoutes(
  service: ReturnType<typeof catalogService>,
  origins: readonly string[],
) {
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
  router.get('/storefront/home', cors, async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.home())
  })
  router.get('/products', cors, async (req, res) => {
    const result = await service.products(req.query)
    respond(res, result.data, 200, result.page)
  })
  router.get('/products/:slug', cors, async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.product(String(req.params.slug)))
  })
  router.get('/categories', cors, async (req, res) => {
    const result = await service.categories(req.query)
    respond(res, result.data, 200, result.page)
  })
  router.get('/categories/:slug', cors, async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.category(String(req.params.slug)))
  })
  return router
}

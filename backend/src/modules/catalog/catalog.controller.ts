import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { createCatalogService } from './catalog.service.js'

function createCatalogController(service: ReturnType<typeof createCatalogService>) {
  const getStorefrontHome: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.home())
  }
  const getProducts: RequestHandler = async (req, res) => {
    const result = await service.products(req.query)
    respond(res, result.data, 200, result.page)
  }
  const getProducts2: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.product(String(req.params.slug)))
  }
  const getCategories: RequestHandler = async (req, res) => {
    const result = await service.categories(req.query)
    respond(res, result.data, 200, result.page)
  }
  const getCategories2: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.category(String(req.params.slug)))
  }
  return { getStorefrontHome, getProducts, getProducts2, getCategories, getCategories2 }
}

export { createCatalogController }

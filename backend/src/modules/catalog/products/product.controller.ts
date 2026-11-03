import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import type { SessionCookies } from '../../auth/auth.public.js'

import { productParams } from './product.schema.js'
import type { createProductAdminService } from './product.service.js'
import { variantParams } from './variant.schema.js'

function createProductAdminController(
  service: ReturnType<typeof createProductAdminService>,
  cookies: SessionCookies,
) {
  const token = (req: import('express').Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'admin')
  const pid = (req: import('express').Request) => parseInput(productParams, req.params).productId
  const vid = (req: import('express').Request) => parseInput(variantParams, req.params).variantId
  const noQuery = (req: import('express').Request) => parseInput(z.strictObject({}), req.query)
  const getAdminProducts: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const r = await service.list(token(req), req.query)
    respond(res, r.data, 200, r.page)
  }
  const getAdminProduct: RequestHandler = async (req, res) => {
    noQuery(req)
    parseInput(z.undefined(), req.body)
    const r = await service.detail(token(req), pid(req))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  }
  const postAdminProducts: RequestHandler = async (req, res) => {
    noQuery(req)
    const r = await service.create(token(req), req.body)
    res.set('ETag', `"${r.revision}"`)
    res.set('Location', `/api/v1/admin/products/${r.id}`)
    respond(res, r, 201)
  }
  const patchAdminProducts: RequestHandler = async (req, res) => {
    noQuery(req)
    const r = await service.patch(token(req), pid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  }
  const postProductsDeactivate: RequestHandler = async (req, res) => {
    noQuery(req)
    const r = await service.deactivate(token(req), pid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  }
  const postProductsVariants: RequestHandler = async (req, res) => {
    noQuery(req)
    const r = await service.createVariant(token(req), pid(req), req.body)
    res.set('ETag', `"${r.revision}"`)
    respond(res, r, 201)
  }
  const patchAdminVariants: RequestHandler = async (req, res) => {
    noQuery(req)
    const r = await service.patchVariant(token(req), vid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  }
  const postVariantsDeactivate: RequestHandler = async (req, res) => {
    noQuery(req)
    const r = await service.deactivateVariant(token(req), vid(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${r.revision}"`)
    respond(res, r)
  }
  return {
    getAdminProducts,
    getAdminProduct,
    postAdminProducts,
    patchAdminProducts,
    postProductsDeactivate,
    postProductsVariants,
    patchAdminVariants,
    postVariantsDeactivate,
  }
}

export { createProductAdminController }

import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import type { SessionCookies } from '../../auth/auth.public.js'

import { categoryParams } from './category.schema.js'
import type { createCategoryAdminService } from './category.service.js'

function createCategoryAdminController(
  service: ReturnType<typeof createCategoryAdminService>,
  cookies: SessionCookies,
) {
  const token = (req: import('express').Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'admin')
  const id = (req: import('express').Request) => parseInput(categoryParams, req.params).categoryId
  const getAdminCategories: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const postAdminCategories: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.create(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  }
  const patchAdminCategories: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.patch(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const postCategoriesDeactivate: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.deactivate(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  return { getAdminCategories, postAdminCategories, patchAdminCategories, postCategoriesDeactivate }
}

export { createCategoryAdminController }

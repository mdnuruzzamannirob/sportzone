import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import type { createCartService } from './cart.service.js'
import { variantParams } from './cart.schema.js'

function createCartController(service: ReturnType<typeof createCartService>) {
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'customer')
  const getCart: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.read(token(req)))
  }
  const postCartMerge: RequestHandler = async (req, res) => {
    respond(res, await service.merge(token(req), req.body))
  }
  const putCartItems: RequestHandler = async (req, res) => {
    const { variantId } = parseInput(variantParams, req.params)
    respond(res, await service.put(token(req), variantId, req.body))
  }
  const deleteCartItems: RequestHandler = async (req, res) => {
    parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
    const { variantId } = parseInput(variantParams, req.params)
    respond(res, await service.remove(token(req), variantId))
  }
  return { getCart, postCartMerge, putCartItems, deleteCartItems }
}

export { createCartController }

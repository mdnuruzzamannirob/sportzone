import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'

import { inventoryParams } from './inventory.schema.js'
import type { createInventoryAdminService } from './inventory.service.js'

function createInventoryAdminController(
  service: ReturnType<typeof createInventoryAdminService>,
  cookies: SessionCookies,
) {
  const token = (req: import('express').Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'admin')
  const id = (req: import('express').Request) => parseInput(inventoryParams, req.params).variantId
  const getAdminInventory: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const getInventoryMovements: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.history(token(req), id(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const postInventoryAdjustments: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.adjust(token(req), id(req), req.body, req.get('Idempotency-Key')))
  }
  return { getAdminInventory, getInventoryMovements, postInventoryAdjustments }
}

export { createInventoryAdminController }

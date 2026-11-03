import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import type { createWishlistService } from './wishlist.service.js'

function createWishlistController(service: ReturnType<typeof createWishlistService>) {
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'customer')
  const getWishlist: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.read(token(req)))
  }
  return { getWishlist }
}

export { createWishlistController }

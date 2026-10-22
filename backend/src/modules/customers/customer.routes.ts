import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { ProfileService } from './customer.service.js'
import { addressId } from './customer.schema.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'

export function profileRoutes(
  service: ProfileService,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    http = createSessionHttp(sessions)
  const paths = [
    '/me',
    '/me/addresses',
    '/me/addresses/:addressId',
    '/me/addresses/:addressId/default',
    '/me/deletion-requests',
  ]
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of paths) {
    router.options(path, security.cors('storefront'))
  }
  router.use(
    '/me',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    http.require('customer'),
    noQuery,
  )
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'customer')
  const id = (req: import('express').Request) =>
    parseInput(z.strictObject({ addressId }), req.params).addressId
  const empty = (value: unknown) => parseInput(z.union([z.undefined(), z.strictObject({})]), value)
  router.get('/me', async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.read(token(req)))
  })
  router.patch('/me', async (req, res) => {
    respond(res, await service.patch(token(req), req.body))
  })
  router.get('/me/addresses', async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.list(token(req)))
  })
  router.post('/me/addresses', async (req, res) => {
    respond(res, await service.add(token(req), req.body), 201)
  })
  router.patch('/me/addresses/:addressId', async (req, res) => {
    respond(res, await service.edit(token(req), id(req), req.body))
  })
  router.delete('/me/addresses/:addressId', async (req, res) => {
    empty(req.body)
    await service.remove(token(req), id(req))
    res.status(204).end()
  })
  router.post('/me/addresses/:addressId/default', async (req, res) => {
    empty(req.body)
    respond(res, await service.setDefault(token(req), id(req)))
  })
  router.post('/me/deletion-requests', async (req, res) => {
    respond(res, await service.requestDeletion(token(req), req.body))
  })
  return router
}

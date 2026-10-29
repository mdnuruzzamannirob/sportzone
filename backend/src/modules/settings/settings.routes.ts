import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { settingsService } from './settings.service.js'
import type { policyService } from './policy.service.js'
import { policyParams } from './policy.schema.js'

export function settingsAdminRoutes(
  settings: ReturnType<typeof settingsService>,
  policies: ReturnType<typeof policyService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router()
  for (const path of [
    '/admin/settings',
    '/admin/settings/policies',
    '/admin/settings/policies/:policyId',
    '/admin/settings/policies/:policyId/approve',
    '/admin/settings/policies/:policyId/publish',
  ])
    router.options(path, security.cors('admin'))
  router.use(
    '/admin/settings',
    security.cors('admin'),
    security.require('admin', 'admin'),
    createSessionHttp(sessions).require('admin'),
    (_req, res, next) => {
      res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
      next()
    },
  )
  const token = (req: import('express').Request) => readSessionCookie(req.get('Cookie'), 'admin')
  const empty = z.strictObject({})
  const clean: RequestHandler = (req, _res, next) => {
    parseInput(empty, req.query)
    if (req.method === 'GET') parseInput(z.undefined(), req.body)
    next()
  }
  const id = (req: import('express').Request) => parseInput(policyParams, req.params).policyId
  router.get('/admin/settings', clean, async (req, res) => {
    const result = await settings.get(token(req))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  router.patch('/admin/settings', clean, async (req, res) => {
    const result = await settings.patch(token(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  router.get('/admin/settings/policies', async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await policies.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  })
  router.post('/admin/settings/policies', clean, async (req, res) => {
    const result = await policies.create(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  })
  router.get('/admin/settings/policies/:policyId', clean, async (req, res) => {
    const result = await policies.get(token(req), id(req))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  router.patch('/admin/settings/policies/:policyId', clean, async (req, res) => {
    const result = await policies.patch(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  for (const action of ['approve', 'publish'] as const)
    router.post(`/admin/settings/policies/:policyId/${action}`, clean, async (req, res) => {
      const result = await policies.transition(
        token(req),
        id(req),
        action,
        req.body,
        req.get('If-Match'),
        req.get('Idempotency-Key'),
      )
      if ('revision' in result) res.set('ETag', `"${result.revision}"`)
      respond(res, result)
    })
  return router
}
export function settingsPublicRoutes(
  settings: Pick<ReturnType<typeof settingsService>, 'contact'>,
  policies: Pick<ReturnType<typeof policyService>, 'publicPolicy'>,
  origins: readonly string[],
) {
  const router = Router()
  const cors: RequestHandler = (req, res, next) => {
    res.vary('Origin')
    const origin = req.get('Origin')
    if (origin && !origins.includes(origin)) throw new ApiError('FORBIDDEN')
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Access-Control-Allow-Credentials', 'true')
    }
    if (req.method === 'OPTIONS') {
      const headers = (req.get('Access-Control-Request-Headers') ?? '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
      if (
        !origin ||
        !['GET', 'HEAD'].includes(req.get('Access-Control-Request-Method') ?? '') ||
        headers.some((v) => v !== 'content-type')
      )
        throw new ApiError('FORBIDDEN')
      res.vary('Access-Control-Request-Headers')
      res.vary('Access-Control-Request-Method')
      res.set('Access-Control-Allow-Methods', 'GET, HEAD')
      res.set('Access-Control-Allow-Headers', 'Content-Type')
      res.status(204).end()
      return
    }
    parseInput(z.strictObject({}), req.query)
    parseInput(z.undefined(), req.body)
    next()
  }
  for (const path of ['/storefront/contact', '/storefront/policies/:type'])
    router.options(path, cors)
  router.get('/storefront/contact', cors, async (_req, res) => {
    respond(res, await settings.contact())
  })
  router.get('/storefront/policies/:type', cors, async (req, res) => {
    respond(res, await policies.publicPolicy(req.params.type))
  })
  return router
}

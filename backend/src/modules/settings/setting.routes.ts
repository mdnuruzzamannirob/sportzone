import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import {
  createSettingsAdminController,
  createSettingsPublicController,
} from './setting.controller.js'

import type {
  createPolicyService,
  createSettingService,
} from './setting.service.js'

function createSettingAdminRoutes(
  settings: ReturnType<typeof createSettingService>,
  policies: ReturnType<typeof createPolicyService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createSettingsAdminController(
    settings,
    policies,
    sessionHttp,
  )

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
    sessionHttp.require('admin'),
    (_req, res, next) => {
      res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
      next()
    },
  )

  const empty = z.strictObject({})
  const clean: RequestHandler = (req, _res, next) => {
    parseInput(empty, req.query)
    if (req.method === 'GET') parseInput(z.undefined(), req.body)
    next()
  }

  router.get('/admin/settings', clean, controller.getAdminSettings)
  router.patch('/admin/settings', clean, controller.patchAdminSettings)
  router.get('/admin/settings/policies', controller.getSettingsPolicies)
  router.post(
    '/admin/settings/policies',
    clean,
    controller.postSettingsPolicies,
  )
  router.get(
    '/admin/settings/policies/:policyId',
    clean,
    controller.getSettingsPolicies2,
  )
  router.patch(
    '/admin/settings/policies/:policyId',
    clean,
    controller.patchSettingsPolicies,
  )
  for (const action of ['approve', 'publish'] as const)
    router.post(
      `/admin/settings/policies/:policyId/${action}`,
      clean,
      controller.postAction(action),
    )
  return router
}

function createSettingPublicRoutes(
  settings: Pick<ReturnType<typeof createSettingService>, 'contact'>,
  policies: Pick<ReturnType<typeof createPolicyService>, 'publicPolicy'>,
  origins: readonly string[],
) {
  const controller = createSettingsPublicController(settings, policies)

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
        !['GET', 'HEAD'].includes(
          req.get('Access-Control-Request-Method') ?? '',
        ) ||
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
  router.get('/storefront/contact', cors, controller.getStorefrontContact)
  router.get(
    '/storefront/policies/:type',
    cors,
    controller.getStorefrontPolicies,
  )
  return router
}

export { createSettingAdminRoutes, createSettingPublicRoutes }

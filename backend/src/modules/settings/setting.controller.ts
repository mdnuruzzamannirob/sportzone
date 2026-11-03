import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'
import { policyParams } from './setting.schema.js'
import type { createPolicyService, createSettingService } from './setting.service.js'

function createSettingsAdminController(
  settings: ReturnType<typeof createSettingService>,
  policies: ReturnType<typeof createPolicyService>,
  cookies: SessionCookies,
) {
  const token = (req: import('express').Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'admin')
  const id = (req: import('express').Request) => parseInput(policyParams, req.params).policyId
  const getAdminSettings: RequestHandler = async (req, res) => {
    const result = await settings.get(token(req))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const patchAdminSettings: RequestHandler = async (req, res) => {
    const result = await settings.patch(token(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const getSettingsPolicies: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await policies.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const postSettingsPolicies: RequestHandler = async (req, res) => {
    const result = await policies.create(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  }
  const getSettingsPolicies2: RequestHandler = async (req, res) => {
    const result = await policies.get(token(req), id(req))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const patchSettingsPolicies: RequestHandler = async (req, res) => {
    const result = await policies.patch(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const postAction =
    (action: 'approve' | 'publish'): RequestHandler =>
    async (req, res) => {
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
    }
  return {
    getAdminSettings,
    patchAdminSettings,
    getSettingsPolicies,
    postSettingsPolicies,
    getSettingsPolicies2,
    patchSettingsPolicies,
    postAction,
  }
}

function createSettingsPublicController(
  settings: Pick<ReturnType<typeof createSettingService>, 'contact'>,
  policies: Pick<ReturnType<typeof createPolicyService>, 'publicPolicy'>,
) {
  const getStorefrontContact: RequestHandler = async (_req, res) => {
    respond(res, await settings.contact())
  }
  const getStorefrontPolicies: RequestHandler = async (req, res) => {
    respond(res, await policies.publicPolicy(req.params.type))
  }
  return { getStorefrontContact, getStorefrontPolicies }
}

export { createSettingsAdminController, createSettingsPublicController }

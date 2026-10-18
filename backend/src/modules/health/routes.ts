import { Router } from 'express'
import { ApiError } from '../../shared/errors.js'
import { respond } from '../../shared/responses.js'
import { createHealthService, type HealthDependencies } from './service.js'

export function healthRoutes(dependencies: HealthDependencies) {
  const router = Router()
  const service = createHealthService(dependencies)
  router.get('/health/live', (_req, res) => {
    respond(res, { status: 'live' })
  })
  router.get('/health/ready', async (req, res) => {
    if (!service.authorized(req.get('Authorization'))) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      throw new ApiError('AUTH_REQUIRED')
    }
    if (!(await service.ready())) throw new ApiError('SERVICE_UNAVAILABLE')
    respond(res, { status: 'ready' })
  })
  return router
}

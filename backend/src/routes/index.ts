import { Router } from 'express'
import { healthRoutes } from '../modules/health/health.routes.js'
import type { HealthDependencies } from '../modules/health/health.service.js'

export function createApiRouter(
  health: HealthDependencies = { isReady: async () => false },
) {
  const router = Router()
  router.use(healthRoutes(health))
  return router
}

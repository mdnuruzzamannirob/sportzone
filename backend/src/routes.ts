import { Router } from 'express'
import { healthRoutes } from './health/health.routes.js'
import type { HealthDependencies } from './health/health.service.js'

function createApiRouter(
  health: HealthDependencies = { isReady: async () => false },
  features: readonly Router[] = [],
) {
  const router = Router()
  router.use(healthRoutes(health))
  for (const feature of features) router.use(feature)
  return router
}

export { createApiRouter }

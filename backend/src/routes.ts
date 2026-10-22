import { Router } from 'express'
import { healthRoutes } from './modules/health/health.routes.js'
import type { HealthDependencies } from './modules/health/health.service.js'

export function createApiRouter(
  health: HealthDependencies = { isReady: async () => false },
  features: readonly Router[] = [],
) {
  const router = Router()
  router.use(healthRoutes(health))
  for (const feature of features) router.use(feature)
  return router
}

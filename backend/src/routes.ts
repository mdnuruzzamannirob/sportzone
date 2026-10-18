import { Router } from 'express'

// Feature modules register their own routers here as their tasks implement them.
// No health/auth/business endpoint is fabricated by the transport scaffold.
export function createApiRouter() {
  return Router()
}

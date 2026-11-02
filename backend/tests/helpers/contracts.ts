import { Router } from 'express'
import { z } from 'zod'
import { operations } from '../../contracts/registry.js'
import { createApp } from '../../src/app.js'

// Run real scenario responses through the same owning DTOs that generate the client contracts.
// A mismatch becomes a failed HTTP scenario without logging any response contents.
export function createContractCheckedApp(options: Parameters<typeof createApp>[0] = {}) {
  if (!options.apiRouter) return createApp(options)
  const checked = Router()
  checked.use((req, res, next) => {
    const json = res.json.bind(res)
    res.json = (body: unknown) => {
      const path =
        typeof req.route?.path === 'string'
          ? req.route.path.replace(/:([a-zA-Z]+)/g, '{$1}')
          : undefined
      const operation = operations.find((op) => op.method === req.method && op.path === path)
      if (operation?.response && !operation.responseFormat && res.statusCode < 400) {
        const envelope = z
          .object({ data: z.unknown(), meta: z.object({ requestId: z.string() }).loose() })
          .parse(body)
        if (!operation.response.safeParse(envelope.data).success)
          throw new Error(`Response DTO drift: ${operation.method} ${operation.path}`)
        if (res.statusCode !== operation.status && res.statusCode !== operation.replayStatus)
          throw new Error(`Response status drift: ${operation.method} ${operation.path}`)
        if (operation.paginated)
          z.object({
            page: z.int().positive(),
            pageSize: z.int().min(1).max(100),
            totalItems: z.int().nonnegative(),
            totalPages: z.int().nonnegative(),
          }).parse(envelope.meta)
      }
      return json(body)
    }
    next()
  })
  checked.use(options.apiRouter)
  return createApp({ ...options, apiRouter: checked })
}

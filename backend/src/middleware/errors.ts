import type { ErrorRequestHandler } from 'express'
import { ApiError } from '../shared/errors.js'

export const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  // A partial response cannot be replaced safely; never append HTML or raw errors.
  if (res.headersSent) {
    res.destroy()
    return
  }
  const safe = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR')
  res.status(safe.status).json({
    error: {
      code: safe.code,
      message: safe.message,
      ...(safe.details ? { details: safe.details } : {}),
    },
    meta: { requestId: res.locals.requestId },
  })
}

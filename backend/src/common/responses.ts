import type { Response } from 'express'
import type { ErrorCode } from './errors.js'
import type { PageMeta } from './pagination.js'

declare global {
  namespace Express {
    interface Locals {
      errorCode?: ErrorCode
      requestId: string
    }
  }
}
export function respond<T>(res: Response, data: T, status = 200, page?: PageMeta) {
  return res
    .status(status)
    .json({ data, meta: { ...page, requestId: res.locals.requestId } })
}

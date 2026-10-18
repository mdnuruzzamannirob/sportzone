import type { Response } from 'express'
import type { PageMeta } from './pagination.js'

declare global {
  namespace Express {
    interface Locals {
      requestId: string
    }
  }
}
export function respond<T>(res: Response, data: T, status = 200, page?: PageMeta) {
  return res
    .status(status)
    .json({ data, meta: { ...page, requestId: res.locals.requestId } })
}

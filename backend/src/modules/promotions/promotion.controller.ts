import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'

import { couponParams } from './promotion.schema.js'
import type { createCouponAdminService, createCouponPreviewService } from './promotion.service.js'

function createCouponAdminController(
  service: ReturnType<typeof createCouponAdminService>,
  cookies: SessionCookies,
) {
  const token = (req: import('express').Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'admin')
  const id = (req: import('express').Request) => parseInput(couponParams, req.params).couponId
  const getAdminCoupons: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const getCouponsRedemptions: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.history(token(req), id(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const postAdminCoupons: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.create(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  }
  const patchAdminCoupons: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.update(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const postCouponsDeactivate: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.deactivate(token(req), id(req), req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  return {
    getAdminCoupons,
    getCouponsRedemptions,
    postAdminCoupons,
    patchAdminCoupons,
    postCouponsDeactivate,
  }
}

function createCouponPreviewController(
  service: ReturnType<typeof createCouponPreviewService>,
  cookies: SessionCookies,
) {
  const postCouponsPreview: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const cookie = req.get('Cookie')
    respond(
      res,
      await service.preview(
        {
          customerPresent: (cookie ?? '')
            .split(';')
            .some((value) => value.trim().startsWith('sz_customer_sid=')),
          customerToken: cookies.readSessionCookie(cookie, 'customer'),
          contextToken: cookies.readContextCookie(cookie, 'storefront'),
          csrfToken: req.get('X-CSRF-Token'),
        },
        req.body,
      ),
    )
  }
  return { postCouponsPreview }
}

export { createCouponAdminController, createCouponPreviewController }

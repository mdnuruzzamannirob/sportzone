import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { CustomerAccountAccess, SessionCookies } from '../auth/auth.public.js'
import type { createComplaintService } from './support.service.js'

function createSupportReadController(
  complaints: Pick<ReturnType<typeof createComplaintService>, 'adminList'>,
  cookies: SessionCookies,
) {
  const getAdminComplaints: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await complaints.adminList(
      cookies.readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }

  return { getAdminComplaints }
}

function createSupportController(
  deps: {
    complaints: ReturnType<typeof createComplaintService>
    customers: CustomerAccountAccess
  },
  cookies: SessionCookies,
) {
  const id = z.string().regex(/^[a-f0-9]{24}$/)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: cookies.readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: cookies.readGuestCookie(req.get('Cookie')),
    guestPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith('sz_guest_order_sid=')),
    contextToken: cookies.readContextCookie(req.get('Cookie'), 'storefront'),
    csrfToken: req.get('X-CSRF-Token'),
  })
  const postComplaints: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.complaints.intake(credentials(req), req.body, req.get('Idempotency-Key')),
      201,
    )
  }
  const getMeComplaints: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await deps.complaints.mine(
      cookies.readSessionCookie(req.get('Cookie'), 'customer'),
      req.query,
      deps.customers,
    )
    respond(res, result.items, 200, result.pagination)
  }
  const getOrdersComplaints: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.complaints.list(
        credentials(req),
        parseInput(z.strictObject({ orderId: id }), req.params).orderId,
      ),
    )
  }
  const getAdminComplaints: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.complaints.adminDetail(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ complaintId: id }), req.params).complaintId,
      ),
    )
  }
  const postComplaintsResolve: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.complaints.resolve(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ complaintId: id }), req.params).complaintId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }

  return {
    postComplaints,
    getMeComplaints,
    getOrdersComplaints,
    getAdminComplaints,
    postComplaintsResolve,
  }
}

export { createSupportController, createSupportReadController }

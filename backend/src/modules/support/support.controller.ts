import type { RequestHandler } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { readContextCookie } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import type { createComplaintService } from './support.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { CustomerAccountAccess } from '../auth/auth.public.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'

function createSupportReadController(
  complaints: Pick<ReturnType<typeof createComplaintService>, 'adminList'>,
) {
  const getAdminComplaints: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await complaints.adminList(
      readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }

  return { getAdminComplaints }
}

function createSupportController(deps: {
  complaints: ReturnType<typeof createComplaintService>
  customers: CustomerAccountAccess
}) {
  const id = z.string().regex(/^[a-f0-9]{24}$/)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
    guestPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith('sz_guest_order_sid=')),
    contextToken: readContextCookie(req.get('Cookie'), 'storefront'),
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
      readSessionCookie(req.get('Cookie'), 'customer'),
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
        readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ complaintId: id }), req.params).complaintId,
      ),
    )
  }
  const postComplaintsResolve: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.complaints.resolve(
        readSessionCookie(req.get('Cookie'), 'admin'),
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

export { createSupportReadController, createSupportController }

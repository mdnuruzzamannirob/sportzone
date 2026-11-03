import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionHttp } from '../auth/auth.public.js'
import type { ClaimEvidenceMultipart } from '../media/media.public.js'
import { claimCompleteInput, claimId, claimInspectionInput } from './return.schema.js'
import type {
  createReturnHistoryService,
  createReturnLifecycleService,
  createReturnOperationsService,
  createReturnPhysicalService,
} from './return.service.js'

function createReturnHistoryController(
  service: ReturnType<typeof createReturnHistoryService>,
  sessionHttp: SessionHttp,
) {
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: sessionHttp.readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: sessionHttp.readGuestCookie(req.get('Cookie')),
  })
  const getMeClaims: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.mine(credentials(req), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const getAdminClaims: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.adminList(
      sessionHttp.readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }
  const getAdminClaim: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.adminDetail(
        sessionHttp.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ claimId }), req.params).claimId,
      ),
    )
  }
  const getOrdersClaims: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.list(
        credentials(req),
        parseInput(z.strictObject({ orderId: claimId }), req.params).orderId,
      ),
    )
  }
  const getClaims: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.detail(
        credentials(req),
        parseInput(z.strictObject({ claimId }), req.params).claimId,
      ),
    )
  }
  return { getMeClaims, getAdminClaims, getAdminClaim, getOrdersClaims, getClaims }
}

function createReturnController(
  operations: ReturnType<typeof createReturnOperationsService>,
  lifecycle: ReturnType<typeof createReturnLifecycleService>,
  physical: ReturnType<typeof createReturnPhysicalService>,
  history: ReturnType<typeof createReturnHistoryService>,
  sessionHttp: SessionHttp,
  maxBytes: number,
  adminEvidence: (
    token: string | undefined,
    claim: string,
    asset: string,
  ) => Promise<{
    url: string
  }>,
  claimEvidenceMultipart: ClaimEvidenceMultipart,
) {
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: sessionHttp.readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: sessionHttp.readGuestCookie(req.get('Cookie')),
    csrfToken: req.get('X-CSRF-Token'),
  })
  const emptyQuery = (req: Request) => parseInput(z.strictObject({}), req.query)
  const order = (req: Request) =>
    parseInput(z.strictObject({ orderId: claimId }), req.params).orderId
  const claim = (req: Request) => parseInput(z.strictObject({ claimId }), req.params).claimId
  const actor = (req: Request) => sessionHttp.readSessionCookie(req.get('Cookie'), 'admin')
  const getOrdersClaimEligibility: RequestHandler = async (req, res) => {
    emptyQuery(req)
    parseInput(z.undefined(), req.body)
    respond(res, await operations.eligibility(credentials(req), order(req)))
  }
  const postOrdersClaims: RequestHandler = async (req, res) => {
    emptyQuery(req)
    respond(
      res,
      await operations.submit(credentials(req), order(req), req.body, req.get('Idempotency-Key')),
      201,
    )
  }
  const postClaimsEvidenceUploads: RequestHandler = async (req, res) => {
    const parsed = await claimEvidenceMultipart(req, maxBytes)
    respond(res, await operations.upload(credentials(req), order(req), parsed.input, parsed.file))
  }
  const getClaimsEvidence: RequestHandler = async (req, res) => {
    emptyQuery(req)
    parseInput(z.undefined(), req.body)
    const p = parseInput(z.strictObject({ orderId: claimId, assetId: claimId }), req.params)
    respond(res, await operations.privateEvidence(credentials(req), p.orderId, p.assetId))
  }
  const postClaimsReview: RequestHandler = async (req, res) => {
    emptyQuery(req)
    respond(
      res,
      await operations.review(actor(req), claim(req), req.body, req.get('Idempotency-Key')),
    )
  }
  const postClaimsReceipt: RequestHandler = async (req, res) => {
    emptyQuery(req)
    respond(
      res,
      await operations.receive(actor(req), claim(req), req.body, req.get('Idempotency-Key')),
    )
  }
  const postClaimsInspection: RequestHandler = async (req, res) => {
    emptyQuery(req)
    const input = parseInput(claimInspectionInput, req.body)
    const id = claim(req)
    await physical.inspect(
      actor(req),
      id,
      { items: input.items, reason: input.notes ?? 'Inspection recorded' },
      req.get('Idempotency-Key'),
    )
    respond(res, await history.adminDetail(actor(req), id))
  }
  const postClaimsComplete: RequestHandler = async (req, res) => {
    emptyQuery(req)
    const input = parseInput(claimCompleteInput, req.body),
      id = claim(req)
    await lifecycle.transition(
      actor(req),
      id,
      {
        to: 'completed',
        reason: input.reason ?? 'Claim inspection/review complete',
      },
      req.get('Idempotency-Key'),
    )
    respond(res, await history.adminDetail(actor(req), id))
  }
  const getAdminClaimEvidence: RequestHandler = async (req, res) => {
    emptyQuery(req)
    parseInput(z.undefined(), req.body)
    const p = parseInput(z.strictObject({ claimId, assetId: claimId }), req.params)
    respond(res, await adminEvidence(actor(req), p.claimId, p.assetId))
  }
  return {
    readCredentials: credentials,
    parseOrderId: order,

    getOrdersClaimEligibility,
    postOrdersClaims,
    postClaimsEvidenceUploads,
    getClaimsEvidence,
    postClaimsReview,
    postClaimsReceipt,
    postClaimsInspection,
    postClaimsComplete,
    getAdminClaimEvidence,
  }
}

export { createReturnController, createReturnHistoryController }

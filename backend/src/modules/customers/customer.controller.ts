import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { addressId } from './customer.schema.js'
import type { ProfileService } from './customer.service.js'
import type { BrowserRouteAccess, CustomerAdministration } from '../auth/auth.public.js'

function profileController(service: ProfileService, readToken: BrowserRouteAccess['readToken']) {
  const token = (req: Request) => readToken(req.get('Cookie'))
  const id = (req: Request) => parseInput(z.strictObject({ addressId }), req.params).addressId
  const empty = (value: unknown) => parseInput(z.union([z.undefined(), z.strictObject({})]), value)
  const read: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.read(token(req)))
  }
  const patch: RequestHandler = async (req, res) => {
    respond(res, await service.patch(token(req), req.body))
  }
  const list: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await service.list(token(req)))
  }
  const add: RequestHandler = async (req, res) => {
    const created = await service.add(token(req), req.body)
    res.setHeader('Location', `/api/v1/me/addresses/${created.id}`)
    respond(res, created, 201)
  }
  const edit: RequestHandler = async (req, res) => {
    respond(res, await service.edit(token(req), id(req), req.body))
  }
  const remove: RequestHandler = async (req, res) => {
    empty(req.body)
    await service.remove(token(req), id(req))
    res.status(204).end()
  }
  const setDefault: RequestHandler = async (req, res) => {
    empty(req.body)
    respond(res, await service.setDefault(token(req), id(req)))
  }
  const requestDeletion: RequestHandler = async (req, res) => {
    respond(res, await service.requestDeletion(token(req), req.body))
  }
  return { read, patch, list, add, edit, remove, setDefault, requestDeletion }
}

function customerAdminController(
  service: CustomerAdministration,
  readToken: BrowserRouteAccess['readToken'],
) {
  const token = (req: Request) => readToken(req.get('Cookie'))
  const params = z.strictObject({ customerId: z.string().regex(/^[a-f0-9]{24}$/) })
  const history =
    (kind: 'orders' | 'claims' | 'refunds'): RequestHandler =>
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      const result = await service.history(
        token(req),
        parseInput(params, req.params).customerId,
        kind,
        req.query,
      )
      respond(res, result.items, 200, result.pagination)
    }
  const privacy: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.privacy(token(req), parseInput(params, req.params).customerId))
  }
  const decidePrivacy: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.decidePrivacy(
        token(req),
        parseInput(params, req.params).customerId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  const list: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const detail: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.detail(token(req), parseInput(params, req.params).customerId))
  }
  const decideStatus: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.decideStatus(
        token(req),
        parseInput(params, req.params).customerId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  return { history, privacy, decidePrivacy, list, detail, decideStatus }
}

export { profileController, customerAdminController }

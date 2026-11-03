import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { DeliveryAreasAccess } from './delivery.public.js'
import { chargeParams, zoneParams } from './delivery.schema.js'
import type { DeliveryService } from './delivery.service.js'

function createDeliveryController(
  service: DeliveryService,
  readToken: (header: string | undefined) => string | undefined,
) {
  const token = (req: Request) => readToken(req.get('Cookie'))
  const zones: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.zones(token(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const charges: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.charges(token(req), req.query)
    respond(res, result.data, 200, result.page)
  }
  const createZone: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.createZone(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  }
  const patchZone: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const id = parseInput(zoneParams, req.params).zoneId
    const result = await service.patchZone(token(req), id, req.body, req.get('If-Match'))
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  const createCharge: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const result = await service.createCharge(token(req), req.body)
    res.set('ETag', `"${result.revision}"`)
    respond(res, result, 201)
  }
  const transition =
    (action: 'activate' | 'deactivate' | 'supersede'): RequestHandler =>
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const id = parseInput(chargeParams, req.params).chargeId
      const result = await service.transition(
        token(req),
        id,
        action,
        req.body,
        req.get('If-Match'),
        req.get('Idempotency-Key'),
      )
      res.set('ETag', `"${'previous' in result ? result.previous.revision : result.revision}"`)
      respond(res, result)
    }
  return { zones, charges, createZone, patchZone, createCharge, transition }
}

function createDeliveryAreasController(read: DeliveryAreasAccess): RequestHandler {
  return async (req, res) => {
    parseInput(z.undefined(), req.body)
    respond(res, await read(req.query))
  }
}

export { createDeliveryAreasController, createDeliveryController }

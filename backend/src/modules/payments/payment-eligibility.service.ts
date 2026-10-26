import type { ClientSession } from 'mongoose'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentChannels } from '../settings/settings.schema.js'
import {
  paymentChannel,
  paymentMethodEligibility,
  verifiedChannelCapability,
} from './payment-eligibility.schema.js'
// The live provider/merchant verification adapter belongs to P07. Absence denies every online
// channel; configured flags alone never prove activation. No provider call belongs in this read.
export function paymentEligibility(
  verified: (session: ClientSession) => Promise<unknown> = async () => [],
) {
  return async (rawFlags: unknown, amountPoisha: number, session: ClientSession) => {
    parseInput(z.int().nonnegative().max(Number.MAX_SAFE_INTEGER), amountPoisha)
    const flags = parseInput(paymentChannels, rawFlags),
      capabilities = parseInput(
        z
          .array(verifiedChannelCapability)
          .max(3)
          .refine((v) => new Set(v.map((row) => row.channel)).size === v.length),
        await verified(session),
      )
    return paymentChannel.options.map((channel) => {
      const configured = flags[`${channel}Enabled`]
      if (channel === 'cod')
        return parseInput(paymentMethodEligibility, {
          channel,
          active: configured,
          eligible: configured,
          ...(!configured ? { reasonCode: 'CHANNEL_UNAVAILABLE' } : {}),
        })
      const capability = capabilities.find((row) => row.channel === channel)
      const active = configured && capability?.active === true
      const eligible =
        active &&
        capability !== undefined &&
        amountPoisha >= capability.minPoisha &&
        amountPoisha <= capability.maxPoisha
      return parseInput(paymentMethodEligibility, {
        channel,
        active,
        eligible,
        ...(!eligible
          ? { reasonCode: active ? 'PAYMENT_AMOUNT_UNSUPPORTED' : 'CHANNEL_UNAVAILABLE' }
          : {}),
        ...(capability?.active
          ? { minPoisha: capability.minPoisha, maxPoisha: capability.maxPoisha }
          : {}),
      })
    })
  }
}

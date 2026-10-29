import { ApiError } from '../../shared/errors/app-error.js'
import type { ClientSession } from 'mongoose'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { paymentChannels } from '../settings/settings.schema.js'
import {
  paymentChannel,
  paymentChannelApproval,
  paymentMethodEligibility,
  verifiedChannelCapability,
  type PaymentChannelApproval,
} from './payment-eligibility.schema.js'
// The live provider/merchant verification adapter belongs to P07. Absence denies every online
// channel; configured flags alone never prove activation. No provider call belongs in this read.
export function paymentEligibility(
  verified: (session: ClientSession) => Promise<unknown> = async () => [],
) {
  return async (rawFlags: unknown, amountPoisha: number | undefined, session: ClientSession) => {
    if (amountPoisha !== undefined)
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
        amountPoisha !== undefined &&
        amountPoisha >= capability.minPoisha &&
        amountPoisha <= capability.maxPoisha
      return parseInput(paymentMethodEligibility, {
        channel,
        active,
        eligible,
        ...(!eligible
          ? {
              reasonCode: active
                ? amountPoisha === undefined
                  ? 'AMOUNT_REQUIRED'
                  : 'PAYMENT_AMOUNT_UNSUPPORTED'
                : 'CHANNEL_UNAVAILABLE',
            }
          : {}),
        ...(capability?.active
          ? { minPoisha: capability.minPoisha, maxPoisha: capability.maxPoisha }
          : {}),
      })
    })
  }
}

// Only privileged composition supplies digest-checked operator evidence. Recheck lifetime on every read.
export function verifiedMerchantChannels(
  rows: readonly PaymentChannelApproval[],
  clock: () => Date = () => new Date(),
) {
  const approved = z
    .array(paymentChannelApproval)
    .max(3)
    .refine((items) => new Set(items.map((row) => row.channel)).size === items.length)
    .parse(rows)
  return async () =>
    approved
      .filter(
        (row) =>
          Date.parse(row.verifiedAt) <= clock().getTime() &&
          Date.parse(row.validUntil) > clock().getTime(),
      )
      .map((row) => ({
        channel: row.channel,
        active: true,
        minPoisha: row.minPoisha,
        maxPoisha: row.maxPoisha,
      }))
}

// Initiation and URL replay policy stays in payments; root supplies only settings/evidence capabilities.
export function paymentInitiationChannelAccess(
  settings: (session: ClientSession) => Promise<unknown>,
  rows: readonly PaymentChannelApproval[],
  clock: () => Date = () => new Date(),
) {
  const approved = z
    .array(paymentChannelApproval)
    .max(3)
    .refine((items) => new Set(items.map((item) => item.channel)).size === items.length)
    .parse(rows)
  return async (session: ClientSession, requested: string, amount: number) => {
    parseInput(z.int().positive().max(Number.MAX_SAFE_INTEGER), amount)
    const flags = parseInput(paymentChannels, await settings(session)),
      row = approved.find(
        (entry) =>
          entry.channel === requested &&
          Date.parse(entry.verifiedAt) <= clock().getTime() &&
          Date.parse(entry.validUntil) > clock().getTime(),
      )
    if (!row || !flags[`${row.channel}Enabled`]) throw new ApiError('BUSINESS_RULE_VIOLATION')
    if (amount < row.minPoisha || amount > row.maxPoisha)
      throw new ApiError('PAYMENT_AMOUNT_UNSUPPORTED')
    return {
      gatewayKey: row.gatewayKey,
      merchantAccountKey: row.merchantAccountKey,
      minPoisha: row.minPoisha,
      maxPoisha: row.maxPoisha,
      validUntil: new Date(row.validUntil),
    }
  }
}

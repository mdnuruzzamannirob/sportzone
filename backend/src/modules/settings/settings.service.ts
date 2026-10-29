import type { publicMediaService } from '../media/public-media.service.js'
import { publicHomeSettings } from './settings.schema.js'
import type { ClientSession, Connection } from 'mongoose'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { parseRevision } from '../../shared/preconditions.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { MediaService } from '../media/media.service.js'
import { settingsModel } from './settings.model.js'
import { verifySettingsPersistence } from './settings.persistence.js'
import { publicContact, settingsPatch, settingsView } from './settings.schema.js'

export const settingsDigest = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
export function requireSettingsRevision(match: string | undefined) {
  const revision = parseRevision(match)
  if (revision === undefined) throw new ApiError('PRECONDITION_REQUIRED')
  if (!Number.isSafeInteger(revision)) throw new ApiError('PRECONDITION_FAILED')
  return revision
}
export function settingsService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  media?: Pick<MediaService, 'changePublicReference' | 'changePublicAssetReference'>,
) {
  const model = settingsModel(connection)
  type Row = ReturnType<typeof model.hydrate>
  function view(row: Row) {
    const raw = row.toObject()
    const { _id, createdAt, updatedAt, deliveryCoverageRevision, policyHistory, ...safe } = raw
    void _id
    void createdAt
    void updatedAt
    void deliveryCoverageRevision
    void policyHistory
    return parseInput(settingsView, {
      ...safe,
      ...(row.updatedBy ? { updatedBy: row.updatedBy.toHexString() } : {}),
      ...(row.homepageBanner
        ? {
            homepageBanner: {
              ...raw.homepageBanner,
              assetId: row.homepageBanner.assetId.toHexString(),
            },
          }
        : {}),
    })
  }
  async function read(session?: ClientSession) {
    try {
      await verifySettingsPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await model.findOne({ key: 'primary' }).session(session ?? null)
    if (!row) throw new ApiError('SERVICE_UNAVAILABLE')
    return row
  }
  return {
    async get(token: string | undefined) {
      return access.owned(token, async (_actor, session) => view(await read(session)), false)
    },
    async contact() {
      const row = await read()
      return parseInput(publicContact, {
        ...(row.contact ? { contact: row.toObject().contact } : {}),
        ...(row.complaintContact ? { complaintContact: row.toObject().complaintContact } : {}),
      })
    },
    async patch(token: string | undefined, raw: unknown, match?: string) {
      const revision = requireSettingsRevision(match),
        input = parseInput(settingsPatch, raw),
        cause = randomUUID()
      return access.owned(token, async (actorId, session) => {
        const row = await read(session)
        if (row.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        const before = view(row)
        const { branding, homepageBanner, paymentChannels, ...metadata } = input
        row.set(metadata)
        if (paymentChannels)
          row.set('paymentChannels', {
            ...row.toObject().paymentChannels,
            ...paymentChannels,
          })
        if (branding !== undefined) {
          if (!media) throw new ApiError('SERVICE_UNAVAILABLE')
          await media.changePublicReference(
            token,
            row.branding?.publicId,
            branding,
            {
              targetType: 'store_settings',
              targetId: row._id,
              slot: 'branding',
            },
            session,
            async (image) => {
              row.set('branding', image ?? undefined)
            },
          )
        }
        if (homepageBanner !== undefined && (homepageBanner !== null || row.homepageBanner)) {
          if (!media) throw new ApiError('SERVICE_UNAVAILABLE')
          await media.changePublicAssetReference(
            token,
            row.homepageBanner?.image.publicId,
            homepageBanner?.assetId ?? null,
            homepageBanner?.alt ?? '',
            {
              targetType: 'store_settings',
              targetId: row._id,
              slot: 'homepageBanner',
            },
            session,
            async (image) => {
              row.set(
                'homepageBanner',
                homepageBanner && image ? { ...homepageBanner, image } : undefined,
              )
            },
          )
        }
        const candidate = view(row)
        if (isDeepStrictEqual(before, candidate)) return before
        if (row.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
        row.revision++
        row.set('updatedBy', actorId)
        await row.save({ session })
        const result = view(row)
        await audit(session, {
          actorType: 'admin',
          actorId,
          action: 'settings.update',
          targetType: 'store_settings',
          targetId: row._id.toHexString(),
          operationKey: cause,
          occurredAt: new Date(),
          beforeDigest: settingsDigest(before),
          afterDigest: settingsDigest(result),
        })
        return result
      })
    },
  }
}

// Public homepage projection only; settings persistence and approved metadata remain with settings.
export function storefrontSettingsAccess(
  connection: Connection,
  images: ReturnType<typeof publicMediaService>,
) {
  const model = settingsModel(connection)
  return async () => {
    try {
      await verifySettingsPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await model.findOne({ key: 'primary' }).maxTimeMS(3000)
    if (!row) throw new ApiError('SERVICE_UNAVAILABLE')
    const safe = {
      ...(row.storeName ? { storeName: row.storeName } : {}),
      ...(row.contact ? { contact: row.toObject().contact } : {}),
      ...(row.complaintContact ? { complaintContact: row.toObject().complaintContact } : {}),
    }
    let branding: import('zod').output<typeof publicHomeSettings>['branding']
    let banner: import('zod').output<typeof publicHomeSettings>['banner']
    // Separate batches preserve independent slots/alt text even when both slots share one asset.
    if (row.branding) {
      const ref = row.branding,
        approved = await images([
          {
            targetId: row._id,
            targetType: 'store_settings',
            slot: 'branding',
            publicId: ref.publicId,
            alt: ref.alt,
          },
        ])
      const image = approved.get(row._id.toHexString())?.get(ref.publicId)
      if (image) branding = { publicId: ref.publicId, ...image }
    }
    if (row.homepageBanner) {
      const ref = row.homepageBanner,
        approved = await images([
          {
            targetId: row._id,
            targetType: 'store_settings',
            slot: 'homepageBanner',
            assetId: ref.assetId,
            publicId: ref.image.publicId,
            alt: ref.alt,
          },
        ])
      const image = approved.get(row._id.toHexString())?.get(ref.image.publicId)
      if (image)
        banner = {
          assetId: ref.assetId.toHexString(),
          title: ref.title,
          alt: ref.alt,
          ...(ref.href ? { href: ref.href } : {}),
          image: { publicId: ref.image.publicId, ...image },
        }
    }
    const result = publicHomeSettings.safeParse({
      ...safe,
      ...(branding ? { branding } : {}),
      ...(banner ? { banner } : {}),
    })
    if (!result.success) throw new ApiError('SERVICE_UNAVAILABLE')
    return result.data
  }
}

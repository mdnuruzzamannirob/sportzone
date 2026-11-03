import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { type ClientSession, type Connection, Types } from 'mongoose'
import type { z } from 'zod'
import type { PolicyApproval } from '../../config/settings.js'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { parseRevision } from '../../shared/preconditions.js'
import type { AdminAccountAccess } from '../auth/auth.public.js'
import type { PublicMediaReader, PublicMediaReferences } from '../media/media.public.js'
import { policyModel } from './policy.model.js'
import { settingsModel } from './setting.model.js'
import { verifySettingsPersistence } from './setting.persistence.js'
import {
  paymentChannels,
  policyApprove,
  policyDocument,
  policyDraftInput,
  policyDraftPatch,
  policyKey,
  policyListQuery,
  policyParams,
  policyPublic,
  policyPublication,
  policyPublish,
  policySummary,
  policyType,
  publicContact,
  publicHomeSettings,
  publicPolicyLink,
  settingsPatch,
  settingsView,
} from './setting.schema.js'

function checkoutSettingsAccess(
  connection: Connection,
  requiredTypes: readonly z.infer<typeof policyType>[],
) {
  return async (session: ClientSession, now: Date) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifySettingsPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const settings = await settingsModel(connection).findOne({ key: 'primary' }).session(session)
    if (!settings) throw new ApiError('SERVICE_UNAVAILABLE')
    const flags = paymentChannels.safeParse(settings.toObject().paymentChannels)
    if (!flags.success) throw new ApiError('SERVICE_UNAVAILABLE')
    const policyVersions: {
      type: z.infer<typeof policyType>
      version: string
      effectiveAt: string
    }[] = []
    for (const type of requiredTypes) {
      const version: unknown = settings.get(`activePolicyVersions.${type}`)
      if (typeof version !== 'string' || !version) throw new ApiError('SERVICE_UNAVAILABLE')
      const policy = await policyModel(connection)
        .findOne({ type, version, status: 'published', effectiveAt: { $lte: now } })
        .session(session)
      if (!policy?.approvedAt || !policy.approvalEvidenceRef || !policy.effectiveAt)
        throw new ApiError('SERVICE_UNAVAILABLE')
      policyVersions.push({ type, version, effectiveAt: policy.effectiveAt.toISOString() })
    }
    return { flags: flags.data, policyVersions }
  }
}

function paymentChannelSettingsAccess(connection: Connection) {
  return async (session: ClientSession) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifySettingsPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await settingsModel(connection).findOne({ key: 'primary' }).session(session)
    const result = paymentChannels.safeParse(row?.toObject().paymentChannels)
    if (!result.success) throw new ApiError('SERVICE_UNAVAILABLE')
    return result.data
  }
}

// Narrow capability: delivery can serialize coverage changes, never edit settings/policy data.
function deliverySettingsGuard(connection: Connection) {
  const model = settingsModel(connection)
  return async (session: ClientSession) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    try {
      await verifyDeclaredIndexes(model)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
    const row = await model
      .findOne({ key: 'primary' })
      .select('deliveryCoverageRevision')
      .session(session)
    if (
      !row ||
      !Number.isSafeInteger(row.deliveryCoverageRevision) ||
      row.deliveryCoverageRevision < 0
    )
      throw new ApiError('SERVICE_UNAVAILABLE')
    if (row.deliveryCoverageRevision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError('STATE_CONFLICT')
    const result = await model.updateOne(
      { _id: row._id, deliveryCoverageRevision: row.deliveryCoverageRevision },
      { $inc: { deliveryCoverageRevision: 1 } },
      { session, timestamps: false },
    )
    if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
  }
}

const settingsDigest = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')

function requireSettingsRevision(match: string | undefined) {
  const revision = parseRevision(match)
  if (revision === undefined) throw new ApiError('PRECONDITION_REQUIRED')
  if (!Number.isSafeInteger(revision)) throw new ApiError('PRECONDITION_FAILED')
  return revision
}

function createSettingService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  media?: Pick<PublicMediaReferences, 'changePublicReference' | 'changePublicAssetReference'>,
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
              targetId: row._id.toHexString(),
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
              targetId: row._id.toHexString(),
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
function storefrontSettingsAccess(connection: Connection, images: PublicMediaReader) {
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
            targetId: row._id.toHexString(),
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
            targetId: row._id.toHexString(),
            targetType: 'store_settings',
            slot: 'homepageBanner',
            assetId: ref.assetId.toHexString(),
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

function reportThresholdAccess(connection: Connection) {
  return async (session: ClientSession) => {
    await verifySettingsPersistence(connection)
    const row = await settingsModel(connection)
      .findOne({ key: 'primary' })
      .select('lowStockThreshold')
      .session(session)
    if (!row) throw new ApiError('SERVICE_UNAVAILABLE')
    return row.lowStockThreshold
  }
}

function createPolicyService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  approvals: readonly PolicyApproval[] = [],
  clock: () => Date = () => new Date(),
) {
  const policies = policyModel(connection),
    settings = settingsModel(connection)
  type Row = ReturnType<typeof policies.hydrate>
  function view(row: Row) {
    return parseInput(policyDocument, {
      id: row._id.toHexString(),
      type: row.type,
      version: row.version,
      status: row.status,
      content: row.content,
      contentDigest: row.contentDigest,
      revision: row.revision,
      ...(row.effectiveAt ? { effectiveAt: row.effectiveAt.toISOString() } : {}),
      ...(row.approvalEvidenceRef ? { approvalEvidenceRef: row.approvalEvidenceRef } : {}),
      ...(row.approvedAt ? { approvedAt: row.approvedAt.toISOString() } : {}),
      ...(row.publishedAt ? { publishedAt: row.publishedAt.toISOString() } : {}),
    })
  }
  async function verify() {
    try {
      await verifySettingsPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function row(id: string, session: ClientSession) {
    parseInput(policyParams, { policyId: id })
    const result = await policies.findById(id).session(session)
    if (!result) throw new ApiError('NOT_FOUND')
    return result
  }
  async function log(
    session: ClientSession,
    actorId: string | undefined,
    target: Row,
    action: string,
    reason?: string,
    cause: string = randomUUID(),
  ) {
    await audit(session, {
      actorType: actorId ? 'admin' : 'system',
      ...(actorId ? { actorId } : {}),
      action,
      targetType: 'policy_document',
      targetId: target._id.toHexString(),
      operationKey: cause,
      occurredAt: clock(),
      afterDigest: settingsDigest(view(target)),
      ...(reason ? { reason } : {}),
    })
  }
  function advance(target: Row) {
    if (target.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
    target.revision++
  }
  async function store(session: ClientSession) {
    const target = await settings.findOne({ key: 'primary' }).session(session)
    if (!target) throw new ApiError('SERVICE_UNAVAILABLE')
    if (target.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
    return target
  }
  async function activate(target: Row, session: ClientSession, actorId?: string) {
    const primary = await store(session)
    const previousVersion: unknown = primary.get(`activePolicyVersions.${target.type}`)
    if (previousVersion) {
      const prior = await policies
        .findOne({ type: target.type, version: previousVersion, status: 'published' })
        .session(session)
      if (!prior?.effectiveAt || !target.effectiveAt || prior.effectiveAt >= target.effectiveAt)
        throw new ApiError('STATE_CONFLICT')
      prior.status = 'superseded'
      prior.supersededAt = clock()
      advance(prior)
      await prior.save({ session })
      target.supersedesId = prior._id
      await log(session, actorId, prior, 'policy.supersede')
    }
    target.status = 'published'
    target.publishedAt = clock()
    primary.set(`activePolicyVersions.${target.type}`, target.version)
    const history = primary.policyHistory ?? []
    primary.set(
      'policyHistory',
      [
        ...history,
        { policyId: target._id, digest: target.contentDigest, effectiveAt: target.effectiveAt },
      ].slice(-40),
    )
    primary.revision++
    if (actorId) primary.set('updatedBy', actorId)
    await primary.save({ session })
  }
  return {
    async create(token: string | undefined, raw: unknown) {
      const input = parseInput(policyDraftInput, raw),
        version = randomUUID(),
        cause = randomUUID()
      return access.owned(token, async (actorId, session) => {
        await verify()
        const [created] = await policies.create(
          [
            {
              type: input.type,
              content: input.content,
              ...(input.proposedEffectiveAt
                ? { proposedEffectiveAt: new Date(input.proposedEffectiveAt) }
                : {}),
              version,
              contentDigest: settingsDigest(input.content),
              createdBy: actorId,
            },
          ],
          { session },
        )
        if (!created) throw new ApiError('STATE_CONFLICT')
        await log(session, actorId, created, 'policy.create', undefined, cause)
        return {
          policyId: created._id.toHexString(),
          version,
          status: 'draft' as const,
          revision: created.revision,
        }
      })
    },
    async patch(token: string | undefined, id: string, raw: unknown, match?: string) {
      const revision = requireSettingsRevision(match),
        input = parseInput(policyDraftPatch, raw),
        cause = randomUUID()
      return access.owned(token, async (actorId, session) => {
        await verify()
        const target = await row(id, session)
        if (target.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        if (target.status !== 'draft') throw new ApiError('STATE_CONFLICT')
        target.set(input)
        target.contentDigest = settingsDigest(target.content)
        advance(target)
        await target.save({ session })
        await log(session, actorId, target, 'policy.update', undefined, cause)
        return view(target)
      })
    },
    async get(token: string | undefined, id: string) {
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          return view(await row(id, session))
        },
        false,
      )
    },
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(policyListQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const filter = {
            ...(input.type ? { type: input.type } : {}),
            ...(input.status ? { status: input.status } : {}),
          }
          const total = await policies.countDocuments(filter).session(session)
          const rows = await policies
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return {
            data: rows.map((target) =>
              parseInput(policySummary, {
                id: target._id.toHexString(),
                type: target.type,
                version: target.version,
                status: target.status,
                revision: target.revision,
                ...(target.effectiveAt ? { effectiveAt: target.effectiveAt.toISOString() } : {}),
              }),
            ),
            page: pageMeta(input, total),
          }
        },
        false,
      )
    },
    async transition(
      token: string | undefined,
      id: string,
      action: 'approve' | 'publish',
      raw: unknown,
      match?: string,
      key?: string,
    ) {
      const revision = requireSettingsRevision(match),
        cause = parseInput(policyKey, key)
      const input =
        action === 'approve' ? parseInput(policyApprove, raw) : parseInput(policyPublish, raw)
      return access.owned(token, async (actorId, session) => {
        await verify()
        const target = await row(id, session),
          field = action === 'approve' ? 'approvalOperation' : 'publicationOperation'
        const keyDigest = settingsDigest(cause),
          requestDigest = settingsDigest({ actorId, input, revision, action, id })
        const prior = target[field]
        if (prior) {
          if (prior.keyDigest !== keyDigest || prior.requestDigest !== requestDigest)
            throw new ApiError('IDEMPOTENCY_CONFLICT')
          if (action === 'publish')
            return parseInput(policyPublication, {
              version: target.version,
              effectiveAt: target.effectiveAt?.toISOString(),
              status: prior.status,
            })
          const result = view(target)
          delete result.publishedAt
          return { ...result, status: 'approved' as const, revision: prior.revision }
        }
        if (target.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        if (action === 'approve') {
          if (target.status !== 'draft' || !('approvalEvidenceRef' in input))
            throw new ApiError('STATE_CONFLICT')
          const evidence = approvals.find(
            (proof) =>
              proof.evidenceRef === input.approvalEvidenceRef &&
              proof.type === target.type &&
              proof.version === target.version &&
              proof.contentDigest === target.contentDigest &&
              Date.parse(proof.approvedAt) <= clock().getTime(),
          )
          if (!evidence) throw new ApiError('BUSINESS_RULE_VIOLATION')
          target.status = 'approved'
          target.approvedAt = clock()
          target.set('approvedBy', new Types.ObjectId(actorId))
          target.approvalEvidenceRef = evidence.evidenceRef
          target.effectiveAt = new Date(evidence.effectiveAt)
        } else {
          if (
            target.status !== 'approved' ||
            !('effectiveAt' in input) ||
            !target.effectiveAt ||
            Date.parse(input.effectiveAt) !== target.effectiveAt.getTime() ||
            !target.approvalEvidenceRef
          )
            throw new ApiError('STATE_CONFLICT')
          if (target.effectiveAt <= clock()) await activate(target, session, actorId)
          else {
            const primary = await store(session)
            const collision = await policies
              .exists({ type: target.type, status: 'scheduled', effectiveAt: target.effectiveAt })
              .session(session)
            if (collision) throw new ApiError('STATE_CONFLICT')
            target.status = 'scheduled'
            primary.revision++
            await primary.save({ session })
          }
        }
        advance(target)
        target.set(field, {
          keyDigest,
          requestDigest,
          revision: target.revision,
          status: target.status,
        })
        await target.save({ session })
        await log(session, actorId, target, `policy.${action}`, input.reason, keyDigest)
        return action === 'approve'
          ? view(target)
          : parseInput(policyPublication, {
              version: target.version,
              effectiveAt: target.effectiveAt?.toISOString(),
              status: target.status,
            })
      })
    },
    async publicLinks() {
      await verify()
      return inTransaction(connection, async (session) => {
        const primary = await settings.findOne({ key: 'primary' }).session(session)
        if (!primary) throw new ApiError('SERVICE_UNAVAILABLE')
        const pointers = policyType.options.flatMap((type) => {
          const version: unknown = primary.get(`activePolicyVersions.${type}`)
          return typeof version === 'string' && version ? [{ type, version }] : []
        })
        if (!pointers.length) return []
        const now = clock(),
          targets = await policies
            .find({
              $or: pointers,
              status: 'published',
              effectiveAt: { $lte: now },
              approvedAt: { $lte: now },
              approvalEvidenceRef: { $type: 'string', $ne: '' },
            })
            .session(session)
            .maxTimeMS(3000)
        return pointers.flatMap((pointer) =>
          targets.some(
            (target) => target.type === pointer.type && target.version === pointer.version,
          )
            ? [
                publicPolicyLink.parse({
                  ...pointer,
                  href: `/api/v1/storefront/policies/${pointer.type}`,
                }),
              ]
            : [],
        )
      })
    },
    async publicPolicy(raw: unknown) {
      const type = parseInput(policyType, raw)
      await verify()
      return inTransaction(connection, async (session) => {
        const primary = await settings.findOne({ key: 'primary' }).session(session)
        if (!primary) throw new ApiError('SERVICE_UNAVAILABLE')
        const version: unknown = primary.get(`activePolicyVersions.${type}`)
        if (typeof version !== 'string' || !version) throw new ApiError('NOT_FOUND')
        const target = await policies
          .findOne({ type, version, status: 'published', effectiveAt: { $lte: clock() } })
          .session(session)
        if (!target?.approvalEvidenceRef || !target.approvedAt) throw new ApiError('NOT_FOUND')
        return parseInput(policyPublic, {
          version,
          content: target.content,
          effectiveAt: target.effectiveAt?.toISOString(),
        })
      })
    },
    async activateDue() {
      await verify()
      const due = await policies
        .find({ status: 'scheduled', effectiveAt: { $lte: clock() } })
        .sort({ effectiveAt: 1, _id: 1 })
        .limit(100)
        .select('_id')
        .lean()
      let processed = 0
      for (const item of due) {
        const changed = await inTransaction(connection, async (session) => {
          const target = await row(item._id.toHexString(), session)
          if (target.status !== 'scheduled' || !target.effectiveAt || target.effectiveAt > clock())
            return false
          // A later immediate publication must never be rolled back by an older schedule.
          const primary = await store(session),
            previous: unknown = primary.get(`activePolicyVersions.${target.type}`)
          const prior =
            typeof previous === 'string'
              ? await policies.findOne({ type: target.type, version: previous }).session(session)
              : null
          if (prior?.effectiveAt && prior.effectiveAt >= target.effectiveAt)
            target.status = 'superseded'
          else await activate(target, session)
          advance(target)
          await target.save({ session })
          await log(
            session,
            undefined,
            target,
            target.status === 'superseded' ? 'policy.supersede' : 'policy.activate',
          )
          return true
        })
        if (changed) processed++
      }
      return { processed }
    },
  }
}

// Read-only canonical settings capability. Bootstrap and policy/branding writes belong to P09-013.
function stockSettingsReader(connection: Connection) {
  return async (session: ClientSession): Promise<number> => {
    if (!session.inTransaction() || !connection.db) throw new ApiError('SERVICE_UNAVAILABLE')
    try {
      const collection = connection.db.collection('storeSettings')
      const indexes = await collection.listIndexes().toArray()
      if (
        !indexes.some(
          (index) =>
            index.unique === true &&
            !index.sparse &&
            !index.partialFilterExpression &&
            Object.keys(index.key).length === 1 &&
            index.key.key === 1,
        )
      )
        throw new ApiError('SERVICE_UNAVAILABLE')
      const row = await collection.findOne(
        { key: 'primary' },
        { session, projection: { lowStockThreshold: 1 } },
      )
      const threshold: unknown = row?.lowStockThreshold
      if (typeof threshold !== 'number' || !Number.isSafeInteger(threshold) || threshold < 0)
        throw new ApiError('SERVICE_UNAVAILABLE')
      return threshold
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
}

export {
  checkoutSettingsAccess,
  createPolicyService,
  createSettingService,
  deliverySettingsGuard,
  paymentChannelSettingsAccess,
  reportThresholdAccess,
  requireSettingsRevision,
  settingsDigest,
  stockSettingsReader,
  storefrontSettingsAccess,
}

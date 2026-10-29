import { publicPolicyLink, policyType as publicPolicyType } from './policy.schema.js'
import { randomUUID } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import type { PolicyApproval } from '../../config/settings.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { inTransaction } from '../../shared/database/transaction.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { policyModel } from './policy.model.js'
import { settingsModel } from './settings.model.js'
import { verifySettingsPersistence } from './settings.persistence.js'
import { settingsDigest, requireSettingsRevision } from './settings.service.js'
import {
  policyType,
  policyDraftInput,
  policyDraftPatch,
  policyParams,
  policyListQuery,
  policyDocument,
  policySummary,
  policyApprove,
  policyPublish,
  policyKey,
  policyPublic,
  policyPublication,
} from './policy.schema.js'

export function policyService(
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
        const pointers = publicPolicyType.options.flatMap((type) => {
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

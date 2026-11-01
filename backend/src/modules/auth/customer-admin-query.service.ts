import type { Connection } from 'mongoose'
import { z } from 'zod'
import type { IdentityModels } from './auth.model.js'
import type { AdminAccountAccess } from './admin-account.service.js'
import { verifyIdentityPersistence } from './identity.persistence.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
function maskedEmail(email: string) {
  const at = email.lastIndexOf('@')
  if (at <= 0) throw new ApiError('SERVICE_UNAVAILABLE')
  return `${email[0]}***@${email.slice(at + 1)}`
}
// Read-only local capability; no account state changes or deletion decisions.
export function customerAdminQueryService(
  connection: Connection,
  models: IdentityModels,
  admins: AdminAccountAccess,
) {
  return {
    async detail(token: string | undefined, rawId: unknown) {
      const customerId = parseInput(id, rawId)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyIdentityPersistence(connection, models)
          const row = await models.users
            .findOne({ _id: customerId, role: 'customer' })
            .select('name emailNormalized phone status emailVerifiedAt createdAt')
            .session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          return {
            id: row._id.toHexString(),
            name: row.name,
            emailMasked: maskedEmail(row.emailNormalized),
            ...(row.phone ? { phoneMasked: `***${row.phone.slice(-2)}` } : {}),
            status: row.status,
            emailVerified: !!row.emailVerifiedAt,
            createdAt: row.createdAt.toISOString(),
          }
        },
        false,
      )
    },
  }
}

import type { CustomerProfile, CustomerAccountAccess } from './auth.public.js'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { authorizeAccount } from './sessions/authorization.service.js'
import { accountDto } from './credentials/account.dto.js'
import type { IdentityModels } from './auth.model.js'
import type { SessionService } from './sessions/session.service.js'

// Only detached profile data and transaction-scoped operations cross this boundary.
function createCustomerAccountAccess(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
  clock: () => Date = () => new Date(),
): CustomerAccountAccess {
  return {
    async authorizeInSession(
      token: string | undefined,
      transaction: ClientSession,
      mutating = false,
    ) {
      if (!transaction.inTransaction()) throw new ApiError('AUTH_REQUIRED')
      const identity = await sessions.authenticate('customer', token)
      const user = await authorizeAccount(
        models,
        identity,
        'customer',
        transaction,
        clock(),
        mutating,
      )
      return user._id.toHexString()
    },
    async owned<T>(
      token: string | undefined,
      work: (
        profile: CustomerProfile,
        scope: {
          transaction: ClientSession
          save(): Promise<void>
          view(): ReturnType<typeof accountDto>
        },
      ) => Promise<T>,
      mutating = true,
    ): Promise<T> {
      const identity = await sessions.authenticate('customer', token)
      return inTransaction(connection, async (transaction) => {
        const user = await authorizeAccount(
          models,
          identity,
          'customer',
          transaction,
          clock(),
          mutating,
        )
        const deletion = user.deletionRequest
        const profile: CustomerProfile = {
          ...accountDto(user),
          ...(deletion
            ? {
                deletionRequest: {
                  id: deletion.id.toHexString(),
                  status: deletion.status,
                  requestedAt: new Date(deletion.requestedAt),
                  verifiedAt: new Date(deletion.verifiedAt),
                  ...(deletion.reason !== undefined ? { reason: deletion.reason } : {}),
                  ...(deletion.decisionAt ? { decisionAt: new Date(deletion.decisionAt) } : {}),
                  ...(deletion.decisionReason !== undefined
                    ? { decisionReason: deletion.decisionReason }
                    : {}),
                },
              }
            : {}),
        }
        return work(profile, {
          transaction,
          view: () => accountDto(user),
          async save() {
            if (!transaction.inTransaction()) throw new ApiError('AUTH_REQUIRED')
            if (!mutating) throw new ApiError('FORBIDDEN')
            // Never persist supplied email, role, status, credentials, revisions or arbitrary paths.
            user.name = profile.name
            if (profile.phone !== undefined) user.phone = profile.phone
            user.set(
              'addresses',
              profile.addresses.map((address) => ({
                ...address,
                id: new Types.ObjectId(address.id),
              })),
            )
            if (!user.deletionRequest && profile.deletionRequest) {
              if (!user.emailVerifiedAt) throw new ApiError('FORBIDDEN')
              const request = profile.deletionRequest
              user.deletionRequest = {
                id: new Types.ObjectId(request.id),
                status: 'requested',
                requestedAt: new Date(request.requestedAt),
                verifiedAt: new Date(request.verifiedAt),
                ...(request.reason !== undefined ? { reason: request.reason } : {}),
              }
            }
            await user.save({ session: transaction })
          },
        })
      })
    },
  }
}

export type { CustomerProfile, CustomerAccountAccess }
export { createCustomerAccountAccess }

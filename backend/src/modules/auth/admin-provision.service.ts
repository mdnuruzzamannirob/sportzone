import { Types, type Connection } from 'mongoose'
import { inTransaction } from '../../db/transaction.js'
import { parseInput } from '../../common/middleware/validation.js'
import { ApiError } from '../../common/errors.js'
import { registrationInput } from './credentials.service.js'
import type { IdentityModels } from './auth.model.js'
import { hashPassword } from './password.service.js'

// Reserved bootstrap identity, not a secret or a selectable public registration field.
export const initialAdminId = () =>
  new Types.ObjectId('535a00000000000000000001')
export async function provisionInitialAdmin(
  connection: Connection,
  models: IdentityModels,
  raw: unknown,
) {
  const input = parseInput(registrationInput, raw),
    passwordHash = await hashPassword(input.password)
  try {
    await inTransaction(connection, async (session) => {
      if (await models.users.exists({ role: 'admin' }).session(session))
        throw new ApiError('STATE_CONFLICT')
      await new models.users({
        _id: initialAdminId(),
        name: input.name,
        emailNormalized: input.email,
        passwordHash,
        role: 'admin',
        status: 'active',
      }).save({ session })
    })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    )
      throw new ApiError('STATE_CONFLICT')
    throw error
  }
  return { provisioned: true as const }
}

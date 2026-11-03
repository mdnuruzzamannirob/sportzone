import type { ClientSession } from 'mongoose'

interface AdminAccountAccess {
  owned<T>(
    token: string | undefined,
    work: (actorId: string, session: ClientSession) => Promise<T>,
    mutating?: boolean,
  ): Promise<T>
}

export type { AdminAccountAccess }

import type { RequestHandler } from 'express'
import type { z } from 'zod'
import type { customerAdminView, customerPrivacyView } from './customer-admin.schema.js'
import type { pageMeta } from '../../shared/pagination.js'
import type { ClientSession } from 'mongoose'

interface AdminAccountAccess {
  owned<T>(
    token: string | undefined,
    work: (actorId: string, session: ClientSession) => Promise<T>,
    mutating?: boolean,
  ): Promise<T>
}

interface AccountAddress {
  id: string
  recipient: string
  phone: string
  districtKey: string
  areaKey: string
  street: string
  postalCode?: string
  addressLine2?: string
  isDefault: boolean
}
interface AccountView {
  id: string
  name: string
  email: string
  phone?: string
  emailVerified: boolean
  addresses: AccountAddress[]
  status: 'active' | 'suspended' | 'deletion_pending' | 'deactivated'
}
type PrivacyStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'completed'
type CustomerProfile = Pick<AccountView, 'name' | 'phone' | 'addresses'> &
  Readonly<Omit<AccountView, 'name' | 'phone' | 'addresses'>> & {
    deletionRequest?: {
      id: string
      status: PrivacyStatus
      requestedAt: Date
      verifiedAt: Date
      reason?: string | null
      decisionAt?: Date
      decisionReason?: string | null
    }
  }
interface CustomerAccountAccess {
  authorizeInSession(
    token: string | undefined,
    transaction: ClientSession,
    mutating?: boolean,
  ): Promise<string>
  owned<T>(
    token: string | undefined,
    work: (
      profile: CustomerProfile,
      scope: {
        transaction: ClientSession
        save(): Promise<void>
        view(): AccountView
      },
    ) => Promise<T>,
    mutating?: boolean,
  ): Promise<T>
}
type CustomerHistories = (
  session: ClientSession,
  customerId: string,
  kind: 'orders' | 'claims' | 'refunds',
  raw: unknown,
) => Promise<{ items: unknown[]; pagination: ReturnType<typeof pageMeta> }>
interface CustomerAdministration {
  history(
    token: string | undefined,
    id: unknown,
    kind: 'orders' | 'claims' | 'refunds',
    raw: unknown,
  ): ReturnType<CustomerHistories>
  privacy(token: string | undefined, id: unknown): Promise<z.output<typeof customerPrivacyView>>
  decidePrivacy(
    token: string | undefined,
    id: unknown,
    raw: unknown,
    key: unknown,
  ): Promise<{ status: PrivacyStatus | undefined; retained: boolean }>
  list(
    token: string | undefined,
    raw: unknown,
  ): Promise<{
    items: z.output<typeof customerAdminView>[]
    pagination: ReturnType<typeof pageMeta>
  }>
  decideStatus(
    token: string | undefined,
    id: unknown,
    raw: unknown,
    key: unknown,
  ): Promise<{ status: AccountView['status'] }>
  detail(token: string | undefined, id: unknown): Promise<z.output<typeof customerAdminView>>
}

interface BrowserRouteAccess {
  cors: RequestHandler
  requireBrowser: RequestHandler
  requireSession: RequestHandler
  readToken(header: string | undefined): string | undefined
}

export type { AdminAccountAccess }
export type {
  AccountView,
  CustomerProfile,
  CustomerAccountAccess,
  CustomerHistories,
  CustomerAdministration,
}
export type { BrowserRouteAccess }

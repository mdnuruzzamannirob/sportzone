import type { RequestHandler } from 'express'
import type { ClientSession } from 'mongoose'
import type { z } from 'zod'
import type { pageMeta } from '../../shared/pagination.js'
import type { customerAdminView, customerPrivacyView } from './account-management.schema.js'

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
) => Promise<{
  items: unknown[]
  pagination: ReturnType<typeof pageMeta>
}>

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
  ): Promise<{
    status: PrivacyStatus | undefined
    retained: boolean
  }>
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
  ): Promise<{
    status: AccountView['status']
  }>
  detail(token: string | undefined, id: unknown): Promise<z.output<typeof customerAdminView>>
}

interface BrowserRouteAccess {
  cors: RequestHandler
  requireBrowser: RequestHandler
  requireSession: RequestHandler
  readToken(header: string | undefined): string | undefined
}

// Transport capabilities expose guards and cookie operations, never session persistence.
interface SessionCookies {
  readSessionCookie(header: string | undefined, kind: 'customer' | 'admin'): string | undefined
  readContextCookie(
    header: string | undefined,
    audience: 'storefront' | 'admin',
  ): string | undefined
  readGuestCookie(header: string | undefined): string | undefined
}
interface SessionHttp extends SessionCookies {
  require(kind: 'customer' | 'admin'): RequestHandler
}

interface BrowserSecurity {
  cors(audience: 'storefront' | 'admin'): RequestHandler
  require(
    audience: 'storefront' | 'admin',
    mode: 'context' | 'customer' | 'admin' | 'customer-or-context',
  ): RequestHandler
}
interface ComplaintThrottle {
  middleware(audience: 'customer', group: 'complaint'): RequestHandler
}

type CheckoutCredentials = {
  customerPresent: boolean
  customerToken?: string | undefined
  contextToken?: string | undefined
  csrfToken?: string | undefined
}

type CheckoutPrincipal = {
  scopeType: 'customer' | 'guest_context'
  scopeKeyHash: string
  profile?: CustomerProfile
}

type PaymentInitiationCredentials = {
  customerPresent: boolean
  customerToken?: string | undefined
  guestToken?: string | undefined
  csrfToken?: string | undefined
}

type OrderPrincipal =
  | {
      kind: 'customer'
      userId: string
    }
  | {
      kind: 'guest_order'
      guestSessionId: string
      orderId: string
    }

interface CheckoutAccess {
  owned<T>(
    credentials: CheckoutCredentials,
    work: (principal: CheckoutPrincipal, session: ClientSession) => Promise<T>,
  ): Promise<T>
}

interface PaymentMethodAccess {
  owned<T>(
    credentials: Pick<
      PaymentInitiationCredentials,
      'customerPresent' | 'customerToken' | 'guestToken'
    >,
    orderId: string,
    work: (
      scope: { customerId?: string; guestOrderId?: string },
      session: ClientSession,
    ) => Promise<T>,
  ): Promise<T>
}

interface PaymentInitiationAccess {
  owned<T>(
    credentials: PaymentInitiationCredentials,
    orderId: string,
    work: (scopeKeyHash: string, session: ClientSession) => Promise<T>,
    mutating?: boolean,
  ): Promise<T>
}

interface OrderScopeAccess {
  inSession(
    credentials: PaymentInitiationCredentials,
    orderId: string,
    session: ClientSession,
    mutating?: boolean,
  ): Promise<OrderPrincipal>
  ownedAny<T>(
    credentials: PaymentInitiationCredentials,
    work: (principal: OrderPrincipal, session: ClientSession) => Promise<T>,
  ): Promise<T>
  owned<T>(
    credentials: PaymentInitiationCredentials,
    orderId: string,
    work: (principal: OrderPrincipal, session: ClientSession) => Promise<T>,
    mutating?: boolean,
  ): Promise<T>
}

interface ResetDelivery {
  cleanup(limit: number): Promise<void>
  message(claim: {
    id: string
    userId: string
    challengeId?: string | null | undefined
    recipient: string
  }): Promise<{ to: string; subject: string; text: string }>
}
interface GuestProofDelivery {
  cleanup(limit: number): Promise<void>
  message(claim: {
    id: string
    orderId?: string | null | undefined
    challengeId?: string | null | undefined
    recipient: string
  }): Promise<{ to: string; subject: string; text: string }>
}

export type {
  AccountView,
  AdminAccountAccess,
  BrowserRouteAccess,
  BrowserSecurity,
  CheckoutAccess,
  CheckoutCredentials,
  CheckoutPrincipal,
  ComplaintThrottle,
  CustomerAccountAccess,
  CustomerAdministration,
  CustomerHistories,
  CustomerProfile,
  GuestProofDelivery,
  OrderPrincipal,
  OrderScopeAccess,
  PaymentInitiationAccess,
  PaymentInitiationCredentials,
  PaymentMethodAccess,
  ResetDelivery,
  SessionCookies,
  SessionHttp,
}

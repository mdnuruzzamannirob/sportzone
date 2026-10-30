import { createHash } from 'node:crypto'
import type { ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import type { CustomerAccountAccess, CustomerProfile } from './customer-account.service.js'
import type { BrowserSecurity } from './sessions/browser-security.service.js'
export type CheckoutCredentials = {
  customerPresent: boolean
  customerToken?: string | undefined
  contextToken?: string | undefined
  csrfToken?: string | undefined
}
export type CheckoutPrincipal = {
  scopeType: 'customer' | 'guest_context'
  scopeKeyHash: string
  profile?: CustomerProfile
}
export function checkoutAccess(customers: CustomerAccountAccess, security: BrowserSecurity) {
  return {
    async owned<T>(
      credentials: CheckoutCredentials,
      work: (principal: CheckoutPrincipal, session: ClientSession) => Promise<T>,
    ) {
      if (credentials.customerPresent) {
        if (!credentials.customerToken) throw new ApiError('AUTH_REQUIRED')
        return customers.owned(credentials.customerToken, (profile, scope) =>
          work(
            {
              scopeType: 'customer',
              scopeKeyHash: createHash('sha256').update(`customer:${profile.id}`).digest('hex'),
              profile,
            },
            scope.transaction,
          ),
        )
      }
      return security.withContext(
        'storefront',
        credentials.contextToken,
        credentials.csrfToken,
        (scope, session) =>
          work({ scopeType: 'guest_context', scopeKeyHash: scope.keyHash }, session),
      )
    },
  }
}

export function paymentMethodAccess(
  customers: CustomerAccountAccess,
  guests?: Pick<import('./guest-access/guest-session.service.js').GuestSessions, 'owned'>,
) {
  return {
    async owned<T>(
      credentials: {
        customerPresent: boolean
        customerToken?: string | undefined
        guestToken?: string | undefined
      },
      orderId: string,
      work: (
        scope: { customerId?: string; guestOrderId?: string },
        session: ClientSession,
      ) => Promise<T>,
    ) {
      if (credentials.customerPresent)
        return customers.owned(
          credentials.customerToken,
          (profile, scope) => work({ customerId: profile.id }, scope.transaction),
          false,
        )
      if (!guests) throw new ApiError('GUEST_PROOF_REQUIRED')
      return guests.owned(credentials.guestToken, orderId, (scope, session) =>
        work({ guestOrderId: scope.orderId }, session),
      )
    },
  }
}

export type PaymentInitiationCredentials = {
  customerPresent: boolean
  customerToken?: string | undefined
  guestToken?: string | undefined
  csrfToken?: string | undefined
}
export function paymentInitiationAuthAccess(
  customers: CustomerAccountAccess,
  sessions: import('./sessions/session.service.js').SessionService,
  order: (
    session: ClientSession,
    orderId: string,
    scope: { customerId?: string; guestOrderId?: string },
  ) => Promise<unknown>,
  guests?: Pick<import('./guest-access/guest-session.service.js').GuestSessions, 'owned'>,
) {
  return {
    async owned<T>(
      credentials: PaymentInitiationCredentials,
      orderId: string,
      work: (scopeKeyHash: string, session: ClientSession) => Promise<T>,
      mutating = true,
    ) {
      if (credentials.customerPresent) {
        if (
          mutating &&
          !(await sessions.verifyCsrfMaterial(
            'customer',
            credentials.customerToken,
            credentials.csrfToken,
          ))
        )
          throw new ApiError('CSRF_INVALID')
        return customers.owned(
          credentials.customerToken,
          async (profile, scope) => {
            if (
              mutating &&
              !(await sessions.verifyCsrfMaterial(
                'customer',
                credentials.customerToken,
                credentials.csrfToken,
              ))
            )
              throw new ApiError('CSRF_INVALID')
            await order(scope.transaction, orderId, { customerId: profile.id })
            return work(
              createHash('sha256').update(`customer:${profile.id}`).digest('hex'),
              scope.transaction,
            )
          },
          mutating,
        )
      }
      if (!guests || (mutating && !credentials.csrfToken))
        throw new ApiError('GUEST_PROOF_REQUIRED')
      return guests.owned(
        credentials.guestToken,
        orderId,
        async (scope, session) => {
          await order(session, orderId, { guestOrderId: scope.orderId })
          return work(
            createHash('sha256').update(`guest_order:${scope.orderId}`).digest('hex'),
            session,
          )
        },
        mutating ? credentials.csrfToken : undefined,
      )
    },
  }
}

export type OrderPrincipal =
  | { kind: 'customer'; userId: string }
  | { kind: 'guest_order'; guestSessionId: string; orderId: string }
export function orderScopeAccess(
  customers: CustomerAccountAccess,
  sessions: import('./sessions/session.service.js').SessionService,
  guests?: Pick<import('./guest-access/guest-session.service.js').GuestSessions, 'owned'>,
) {
  return {
    async owned<T>(
      credentials: PaymentInitiationCredentials,
      orderId: string,
      work: (principal: OrderPrincipal, session: ClientSession) => Promise<T>,
      mutating = false,
    ) {
      if (credentials.customerPresent) {
        if (
          mutating &&
          !(await sessions.verifyCsrfMaterial(
            'customer',
            credentials.customerToken,
            credentials.csrfToken,
          ))
        )
          throw new ApiError('CSRF_INVALID')
        return customers.owned(
          credentials.customerToken,
          async (profile, scope) => {
            if (
              mutating &&
              !(await sessions.verifyCsrfMaterial(
                'customer',
                credentials.customerToken,
                credentials.csrfToken,
              ))
            )
              throw new ApiError('CSRF_INVALID')
            return work({ kind: 'customer', userId: profile.id }, scope.transaction)
          },
          mutating,
        )
      }
      if (!guests || (mutating && !credentials.csrfToken))
        throw new ApiError('GUEST_PROOF_REQUIRED')
      return guests.owned(
        credentials.guestToken,
        orderId,
        (scope, session) =>
          work(
            { kind: 'guest_order', orderId: scope.orderId, guestSessionId: scope.sessionId },
            session,
          ),
        mutating ? credentials.csrfToken : undefined,
      )
    },
  }
}

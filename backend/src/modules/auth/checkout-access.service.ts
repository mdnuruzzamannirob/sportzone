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

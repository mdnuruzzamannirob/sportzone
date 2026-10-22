// Registered route patterns only. Never classify or log raw paths, IDs or input.
const actions = {
  'POST /admin/media/uploads': 'admin.media.upload',
  'DELETE /admin/media/:assetId': 'admin.media.delete',
  'GET /auth/csrf': 'customer.csrf.issue',
  'GET /admin/auth/csrf': 'admin.csrf.issue',
  'POST /auth/register': 'customer.register',
  'POST /auth/login': 'customer.login',
  'POST /auth/logout': 'customer.logout',
  'POST /auth/password-resets': 'customer.recovery.request',
  'POST /auth/password-resets/confirm': 'customer.recovery.confirm',
  'PATCH /me': 'customer.profile.update',
  'POST /me/addresses': 'customer.address.create',
  'PATCH /me/addresses/:addressId': 'customer.address.update',
  'DELETE /me/addresses/:addressId': 'customer.address.remove',
  'POST /me/addresses/:addressId/default': 'customer.address.default',
  'POST /me/deletion-requests': 'customer.deletion.request',
  'POST /me/password-change': 'customer.password.change',
  'POST /me/email-changes': 'customer.email.request',
  'POST /me/email-changes/confirm': 'customer.email.confirm',
  'GET /admin/auth/session': 'admin.session.read',
  'POST /admin/auth/login': 'admin.login',
  'POST /admin/auth/logout': 'admin.logout',
  'POST /admin/auth/password-resets': 'admin.recovery.request',
  'POST /admin/auth/password-resets/confirm': 'admin.recovery.confirm',
} as const
export type SecurityAction = (typeof actions)[keyof typeof actions]
export function securityAction(
  method: string,
  route: string,
): SecurityAction | undefined {
  const key = `${method} ${route}`
  return Object.hasOwn(actions, key)
    ? actions[key as keyof typeof actions]
    : undefined
}

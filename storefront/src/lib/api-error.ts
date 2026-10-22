export const apiErrorMessages: Record<string, string> = {
  AUTH_REQUIRED: 'Your session has expired. Sign in again.',
  INVALID_CREDENTIALS: 'Email or password is incorrect, or access is unavailable.',
  FORBIDDEN: 'This action is not available for your account.',
  CSRF_INVALID: 'Your form security check expired. Please submit again.',
  RATE_LIMITED: 'Too many attempts. Wait before trying again.',
  VALIDATION_FAILED: 'Check the supplied fields.',
  INVALID_REQUEST: 'Check your input or request a new verification link.',
  STATE_CONFLICT: 'This change conflicts with the current account state. Refresh and try again.',
  UNSUPPORTED_DELIVERY_AREA: 'Delivery is not available for this district and area.',
  NOT_FOUND: 'This item is no longer available.',
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(apiErrorMessages[code] ?? 'The account service is unavailable. Please try again.')
  }
}

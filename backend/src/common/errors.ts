const definitions = {
  UNSUPPORTED_DELIVERY_AREA: {
    status: 400,
    message: 'Delivery area is not supported.',
  },
  STATE_CONFLICT: {
    status: 409,
    message: 'The request conflicts with current state.',
  },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid credentials.' },
  GUEST_PROOF_REQUIRED: {
    status: 401,
    message: 'Order verification is required.',
  },
  FORBIDDEN: { status: 403, message: 'Access is denied.' },
  CSRF_INVALID: { status: 403, message: 'Browser verification is required.' },
  RATE_LIMITED: {
    status: 429,
    message: 'Too many requests. Please try again later.',
  },
  AUTH_REQUIRED: { status: 401, message: 'Authentication is required.' },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'Service is temporarily unavailable.',
  },
  INVALID_REQUEST: { status: 400, message: 'Invalid request.' },
  VALIDATION_FAILED: {
    status: 400,
    message: 'Please check the supplied fields.',
  },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
} as const
export type ErrorCode = keyof typeof definitions
export type FieldIssue = { field: string; code: string }

// Only approved, static public messages cross the HTTP boundary.
export class ApiError extends Error {
  readonly status: number
  constructor(
    readonly code: ErrorCode,
    readonly details?: readonly FieldIssue[],
  ) {
    super(definitions[code].message)
    this.status = definitions[code].status
  }
}

const definitions = {
  AUTH_REQUIRED: { status: 401, message: 'Authentication is required.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Service is temporarily unavailable.' },
  INVALID_REQUEST: { status: 400, message: 'Invalid request.' },
  VALIDATION_FAILED: { status: 400, message: 'Please check the supplied fields.' },
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

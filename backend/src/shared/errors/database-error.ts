export type DatabaseFailureReason =
  | 'AUTHENTICATION_FAILED'
  | 'TLS_HANDSHAKE_FAILED'
  | 'DNS_FAILED'
  | 'NETWORK_UNREACHABLE'
  | 'SERVER_SELECTION_FAILED'

export class DatabaseError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CONFIGURATION'
      | 'CONNECTION_FAILED'
      | 'REPLICA_SET_REQUIRED'
      | 'INDEX_MISMATCH'
      | 'NESTED_TRANSACTION'
      | 'EXTERNAL_EFFECT_IN_TRANSACTION',
    readonly reason?: DatabaseFailureReason,
  ) {
    super(`Database operation failed: ${code}.`)
  }
}

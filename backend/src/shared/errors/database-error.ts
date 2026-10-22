export class DatabaseError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CONFIGURATION'
      | 'CONNECTION_FAILED'
      | 'REPLICA_SET_REQUIRED'
      | 'INDEX_MISMATCH'
      | 'NESTED_TRANSACTION'
      | 'EXTERNAL_EFFECT_IN_TRANSACTION',
  ) {
    super(`Database operation failed: ${code}.`)
  }
}

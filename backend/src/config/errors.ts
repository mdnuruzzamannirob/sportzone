export class ConfigurationError extends Error {
  constructor(readonly fields: readonly string[]) {
    super('Invalid backend configuration.')
  }
}

import { Schema, Types, type SchemaOptions } from 'mongoose'

// Explicit business revisions belong to each owning schema, not Mongoose __v.
export const mutableSchemaOptions = {
  strict: 'throw',
  strictQuery: 'throw',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
  bufferCommands: false,
} as const satisfies SchemaOptions

// API validation still owns shape/normalization. Persistence rejects numeric coercion.
export function integerField(min = 0) {
  if (!Number.isSafeInteger(min)) throw new TypeError('Invalid integer bound')
  return {
    type: Number,
    set(value: unknown) {
      if (value === undefined) return undefined
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
        throw new TypeError('Expected a bounded integer')
      return value
    },
    validate: {
      validator: (value: number) => Number.isSafeInteger(value) && value >= min,
      message: 'Expected a bounded integer',
    },
  }
}

// Nullable references must be explicitly declared by the owning model instead.
export function optionalObjectIdField() {
  return {
    type: Schema.Types.ObjectId,
    default: undefined,
    validate: {
      validator: (value: unknown) => value === undefined || value instanceof Types.ObjectId,
      message: 'Expected an absent or valid ObjectId reference',
    },
  }
}

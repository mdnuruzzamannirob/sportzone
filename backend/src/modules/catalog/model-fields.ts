export function text(max: number) {
  return {
    type: String,
    required: true as const,
    set(value: unknown) {
      if (typeof value !== 'string') throw new TypeError('Expected text')
      return value
    },
    validate: (value: string) =>
      value === value.trim() && value.length > 0 && [...value].length <= max,
  }
}
export const embedded = { _id: false, strict: 'throw', versionKey: false } as const

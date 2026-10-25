export function parseRevision(value: string | undefined) {
  if (value === undefined) return undefined
  if (!/^"(0|[1-9]\d*)"$/.test(value)) return NaN
  const n = Number(value.slice(1, -1))
  return Number.isSafeInteger(n) ? n : NaN
}

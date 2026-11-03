// Preserve strict operator input parsing: invalid/missing values remain NaN for the owning schema.
function positiveInteger(environment, key) {
  return /^[1-9]\d*$/.test(environment[key] ?? '') ? Number(environment[key]) : NaN
}

export { positiveInteger }

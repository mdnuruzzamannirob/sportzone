const wholeTaka = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 })

/** Presentation only: accepts the API's nonnegative safe integer poisha contract. */
export function formatBdt(poisha: number): string {
  if (!Number.isSafeInteger(poisha) || poisha < 0) {
    throw new RangeError('BDT display requires nonnegative safe integer poisha')
  }
  const amount = BigInt(poisha)
  const fraction = amount % 100n
  const decimals = fraction === 0n ? '' : `.${fraction.toString().padStart(2, '0')}`
  return `৳${wholeTaka.format(amount / 100n)}${decimals}`
}

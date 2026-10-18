import { formatBdt } from '../../lib/format-bdt'

export function Price({
  amountPoisha,
  regularPricePoisha,
  label = 'Price',
}: {
  amountPoisha: number
  regularPricePoisha?: number
  label?: string
}) {
  const amount = formatBdt(amountPoisha)
  const regular =
    regularPricePoisha === undefined ? undefined : formatBdt(regularPricePoisha)
  const sale = regularPricePoisha !== undefined && regularPricePoisha > amountPoisha
  return (
    <span className="inline-flex flex-wrap items-baseline gap-2 numeric text-text">
      <span>
        <span className="sr-only">{label}: </span>
        <span className="font-semibold">{amount}</span>
      </span>
      {sale && (
        <>
          <span>
            <span className="sr-only">Regular price: </span>
            <del className="text-sm text-text-muted">{regular}</del>
          </span>
          <span className="text-sm">Sale</span>
        </>
      )}
    </span>
  )
}

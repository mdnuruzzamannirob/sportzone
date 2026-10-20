import { Table } from '../ui/index'
import { type ReactNode, useId } from 'react'
import { Button } from '../ui/button'
import { EmptyState, LoadingState, Notice } from '../ui/feedback'

export type Column<T> = {
  id: string
  label: string
  render: (row: T) => ReactNode
  sortable?: boolean
}
export type TableSort = { column: string; direction: 'ascending' | 'descending' }

// Server-owned filtering/sorting/pagination: this component never transforms the rows.
export function DataTable<T extends { id: string }>({
  label,
  columns,
  rows,
  sort,
  onSortChange,
  isPending = false,
  error,
  onRetry,
}: {
  label: string
  columns: readonly Column<T>[]
  rows: readonly T[]
  sort?: TableSort
  onSortChange?: (sort: TableSort) => void
  isPending?: boolean
  error?: string
  onRetry?: () => void
}) {
  const help = useId()
  if (!columns.length) throw new RangeError('A table needs at least one column')
  return (
    <section aria-label={label} aria-busy={isPending} className="min-w-0 space-y-3">
      {error && (
        <Notice
          tone="error"
          title="Unable to load results"
          actions={
            onRetry && (
              <Button variant="outline" isDisabled={isPending} onPress={onRetry}>
                Retry
              </Button>
            )
          }
        >
          {error}
        </Notice>
      )}
      {isPending && <LoadingState label="Loading results…" />}
      <p id={help} className="text-sm text-muted">
        Scroll within the table to view all columns. Use arrow keys to move between
        cells.
      </p>
      <Table className="min-w-0 max-w-full border border-border">
        <Table.ScrollContainer
          role="region"
          aria-label={`${label} columns`}
          aria-describedby={help}
          tabIndex={0}
          className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Table.Content
            aria-label={label}
            className="min-w-[40rem]"
            sortDescriptor={sort}
            onSortChange={
              onSortChange
                ? (next) => {
                    const column = String(next.column)
                    if (
                      !isPending &&
                      columns.some((item) => item.id === column && item.sortable)
                    )
                      onSortChange({ column, direction: next.direction })
                  }
                : undefined
            }
          >
            <Table.Header>
              {columns.map((column, index) => (
                <Table.Column
                  key={column.id}
                  id={column.id}
                  isRowHeader={index === 0}
                  allowsSorting={!!column.sortable && !!onSortChange && !isPending}
                >
                  {({ sortDirection }) =>
                    column.sortable ? (
                      <Table.SortableColumnHeader sortDirection={sortDirection}>
                        {column.label}
                      </Table.SortableColumnHeader>
                    ) : (
                      column.label
                    )
                  }
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  {columns.map((column) => (
                    <Table.Cell key={column.id}>{column.render(row)}</Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {!rows.length && !isPending && !error && (
        <EmptyState title="No results">
          Try changing or clearing the filters.
        </EmptyState>
      )}
      {rows.length > 0 && (isPending || error) && (
        <p className="text-sm text-muted">Previously loaded results are shown.</p>
      )}
    </section>
  )
}

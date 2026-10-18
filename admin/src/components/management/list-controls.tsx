import { Pagination as HeroPagination } from '@heroui/react'
import { type ReactNode, useId } from 'react'
import { Button } from '../ui/button'
import { TextInput } from '../ui/fields'
import { Form } from '../ui/form'

export function FilterToolbar({
  query,
  onQueryChange,
  onApply,
  onClear,
  isPending = false,
  children,
}: {
  query: string
  onQueryChange: (value: string) => void
  onApply: () => void
  onClear: () => void
  isPending?: boolean
  children?: ReactNode
}) {
  const id = useId()
  return (
    <Form
      aria-label="Filter results"
      isPending={isPending}
      onSubmit={onApply}
      className="flex min-w-0 flex-wrap items-end gap-3"
    >
      <div className="min-w-0 flex-1 basis-56">
        <TextInput
          id={id}
          label="Search"
          type="search"
          value={query}
          onChange={onQueryChange}
          isDisabled={isPending}
        />
      </div>
      {children}
      <Button type="submit" isPending={isPending} pendingLabel="Applying filters…">
        Apply filters
      </Button>
      <Button variant="outline" isDisabled={isPending} onPress={onClear}>
        Clear filters
      </Button>
    </Form>
  )
}

// Metadata comes from PageMeta. Never derive total pages from the currently loaded rows.
export function ListPagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  isPending = false,
}: {
  page: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
  isPending?: boolean
}) {
  if (
    ![page, totalPages, totalItems].every(Number.isSafeInteger) ||
    page < 1 ||
    totalPages < 0 ||
    totalItems < 0
  )
    throw new RangeError('Invalid pagination metadata')
  const previous = !isPending && page > 1
  const next = !isPending && page < totalPages
  return (
    <HeroPagination
      aria-label="Results pagination"
      className="flex flex-wrap items-center gap-3"
    >
      <HeroPagination.Summary>
        <span role="status">
          {totalItems === 0
            ? 'No results'
            : `Page ${page} of ${totalPages} · ${totalItems} results`}
        </span>
      </HeroPagination.Summary>
      <HeroPagination.Content>
        <HeroPagination.Item>
          <HeroPagination.Previous
            className="min-h-control min-w-control"
            isDisabled={!previous}
            onPress={() => {
              if (previous) onPageChange(page - 1)
            }}
          >
            Previous
          </HeroPagination.Previous>
        </HeroPagination.Item>
        <HeroPagination.Item>
          <HeroPagination.Next
            className="min-h-control min-w-control"
            isDisabled={!next}
            onPress={() => {
              if (next) onPageChange(page + 1)
            }}
          >
            Next
          </HeroPagination.Next>
        </HeroPagination.Item>
      </HeroPagination.Content>
    </HeroPagination>
  )
}

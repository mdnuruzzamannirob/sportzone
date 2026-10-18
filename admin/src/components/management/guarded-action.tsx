import { useId, useState, type ReactNode } from 'react'
import { Button } from '../ui/button'
import { Notice } from '../ui/feedback'
import { TextInput } from '../ui/fields'
import { Form } from '../ui/form'
import { FormDialog } from '../ui/overlays'

// Feature owns permission, eligible action, reason draft, request/receipt and idempotency.
export function GuardedAction({
  label,
  title,
  description,
  context,
  eligible,
  unavailableReason,
  requiresReason = false,
  reason,
  onReasonChange,
  onConfirm,
  isPending = false,
  isOpen,
  onOpenChange,
  error,
}: {
  label: string
  title: string
  description: string
  context: ReactNode
  eligible: boolean
  unavailableReason?: string
  requiresReason?: boolean
  reason: string
  onReasonChange: (reason: string) => void
  onConfirm: () => void
  isPending?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  error?: string
}) {
  const reasonId = useId()
  const [open, setOpen] = useState(false)
  const canConfirm =
    eligible && !isPending && (!requiresReason || reason.trim().length > 0)
  return (
    <div className="space-y-3">
      {!eligible && (
        <p className="text-sm text-text-muted">
          {unavailableReason || 'This action is currently unavailable.'}
        </p>
      )}
      <FormDialog
        triggerLabel={label}
        title={title}
        description={description}
        isOpen={isOpen ?? open}
        onOpenChange={(next) => {
          if (!isPending) {
            setOpen(next)
            onOpenChange?.(next)
          }
        }}
        isPending={isPending}
      >
        <Form
          isPending={isPending}
          onSubmit={() => {
            if (canConfirm) onConfirm()
          }}
          className="space-y-4"
        >
          {context}
          <p className="text-sm text-text-muted">
            Review the details before confirming. The result is shown only after server
            confirmation.
          </p>
          {requiresReason && (
            <TextInput
              id={reasonId}
              label="Reason"
              value={reason}
              onChange={onReasonChange}
              isRequired
              multiline
              isDisabled={isPending}
            />
          )}
          {!eligible && (
            <Notice tone="warning" title="Action unavailable">
              {unavailableReason ||
                'Eligibility changed. Refresh the record before continuing.'}
            </Notice>
          )}
          {error && (
            <Notice tone="error" title="Action could not be confirmed">
              {error}
            </Notice>
          )}
          <Button
            type="submit"
            variant="danger"
            isDisabled={!canConfirm}
            isPending={isPending}
            pendingLabel="Awaiting confirmation…"
          >
            Confirm {label}
          </Button>
        </Form>
      </FormDialog>
    </div>
  )
}

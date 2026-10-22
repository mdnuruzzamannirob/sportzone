'use client'

import { Drawer, Modal } from './primitives'
import { type ReactNode, useId } from 'react'
import { Button } from './button'

type PanelProps = {
  triggerLabel: string
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  isPending?: boolean
}

// Keep editable values in the calling component so dismiss/reopen preserves its draft.
export function FormDialog({
  triggerLabel,
  title,
  description,
  children,
  actions,
  isPending = false,
  ...state
}: PanelProps) {
  const id = useId()
  return (
    <Modal {...state}>
      <Button variant="outline">{triggerLabel}</Button>
      <Modal.Backdrop isDismissable={!isPending} isKeyboardDismissDisabled={isPending}>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog aria-describedby={description ? id : undefined}>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
              {description && (
                <p id={id} className="text-muted">
                  {description}
                </p>
              )}
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            <Modal.Footer>
              <Button slot="close" aria-label="Cancel" variant="secondary" isDisabled={isPending}>
                Cancel
              </Button>
              {actions}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
export function FormDrawer({
  triggerLabel,
  title,
  description,
  children,
  actions,
  isPending = false,
  ...state
}: PanelProps) {
  const id = useId()
  return (
    <Drawer {...state}>
      <Button variant="outline">{triggerLabel}</Button>
      <Drawer.Backdrop isDismissable={!isPending} isKeyboardDismissDisabled={isPending}>
        <Drawer.Content placement="right">
          <Drawer.Dialog
            aria-describedby={description ? id : undefined}
            style={{ touchAction: 'pan-y' }}
          >
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
              {description && (
                <p id={id} className="text-muted">
                  {description}
                </p>
              )}
            </Drawer.Header>
            <Drawer.Body>{children}</Drawer.Body>
            <Drawer.Footer>
              <Button slot="close" aria-label="Cancel" variant="secondary" isDisabled={isPending}>
                Cancel
              </Button>
              {actions}
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  )
}

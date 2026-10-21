import { act, type ReactNode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Test-only structural contract: each app supplies its own implementations at runtime.
type Components = typeof import('../storefront/src/components/ui/fields') &
  typeof import('../storefront/src/components/ui/form') &
  typeof import('../storefront/src/components/ui/feedback') &
  typeof import('../storefront/src/components/ui/overlays') &
  typeof import('../storefront/src/components/ui/button')

export function formPrimitiveTests(
  app: string,
  components: Components,
  wrap: (node: ReactNode) => ReactNode = (node) => node,
) {
  const {
    TextInput,
    SelectField,
    CheckboxField,
    RadioChoices,
    Form,
    FormErrorSummary,
    Notice,
    LoadingState,
    EmptyState,
    FormDialog,
    FormDrawer,
    Button,
  } = components
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    vi.stubGlobal('matchMedia', () =>
      Object.assign(new EventTarget(), { matches: false }),
    )
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('data-theme')
  })
  async function render(node: ReactNode) {
    await act(() => root.render(wrap(node)))
  }
  async function click(node: HTMLElement | undefined | null) {
    expect(node).toBeTruthy()
    await act(async () => {
      node?.focus()
      node?.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }
  async function edit(
    node: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
  ) {
    expect(node).not.toBeNull()
    await act(() => {
      if (!node) return
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set?.call(
        node,
        value,
      )
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  function description(node: Element | null) {
    return (node?.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ')
  }
  function dialog() {
    return document.querySelector<HTMLElement>('[role="dialog"]')
  }
  async function pressEscape() {
    await act(async () => {
      dialog()?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }
  describe(`${app} form primitives`, () => {
    const theme = 'light'
    beforeEach(() => {
      document.documentElement.dataset.theme = theme
    })
    it('FORM-01: visible labels, helper/error associations and failed validation retain the same input/value', async () => {
      await render(
        <TextInput
          id="contact"
          name="contact"
          label="Contact"
          defaultValue="synthetic draft"
          description="Use your contact name"
        />,
      )
      const input = host.querySelector('input')
      expect(host.querySelector('label')?.htmlFor).toBe(input?.id)
      expect(description(input)).toContain('Use your contact name')
      await edit(input, 'edited synthetic draft')
      await render(
        <TextInput
          id="contact"
          name="contact"
          label="Contact"
          defaultValue="synthetic draft"
          description="Use your contact name"
          error="Check this value"
        />,
      )
      expect(host.querySelector('input')).toBe(input)
      expect(input?.value).toBe('edited synthetic draft')
      expect(input?.getAttribute('aria-invalid')).toBe('true')
      expect(description(input)).toContain('Check this value')
    })
    it('FORM-02: textarea exposes required and disabled states with a visible label', async () => {
      await render(
        <TextInput
          id="notes"
          label="Notes"
          multiline
          isRequired
          isDisabled
          defaultValue="retained"
        />,
      )
      const field = host.querySelector('textarea')
      expect(field?.disabled).toBe(true)
      expect(field?.required || field?.getAttribute('aria-required') === 'true').toBe(
        true,
      )
      expect(field?.value).toBe('retained')
      expect(host.textContent).toContain('Notes')
      expect(field?.required).toBe(true)
    })
    it('FORM-03: selection supports keyboard opening, long labels, disabled choices and error association', async () => {
      const change = vi.fn()
      const options = [
        {
          value: 'available',
          label: 'A long synthetic area label that can wrap onto multiple lines',
        },
        { value: 'disabled', label: 'Unavailable area', disabled: true },
      ]
      await render(
        <SelectField
          id="area"
          label="Area"
          value={null}
          options={options}
          onChange={change}
          error="Choose an area"
        />,
      )
      const trigger = host.querySelector<HTMLButtonElement>(
        '[data-slot="select-trigger"]',
      )
      expect(description(trigger)).toContain('Choose an area')
      await act(() => {
        trigger?.focus()
        trigger?.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            bubbles: true,
            cancelable: true,
          }),
        )
      })
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
      const choices = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      const disabled = choices.find((node) =>
        node.textContent?.includes('Unavailable area'),
      )
      expect(disabled?.getAttribute('aria-disabled')).toBe('true')
      await click(disabled)
      expect(change).not.toHaveBeenCalled()
      await click(
        choices.find((node) => node.textContent?.includes('A long synthetic')),
      )
      expect(change).toHaveBeenCalledWith('available')
    })
    it('FORM-04: labelled checkbox and radio controls activate actual selection without enabling disabled options', async () => {
      const toggle = vi.fn(),
        select = vi.fn()
      await render(
        <>
          <CheckboxField label="Agree to example" onChange={toggle} />
          <RadioChoices
            label="Example method"
            onChange={select}
            options={[
              { value: 'a', label: 'Option A' },
              { value: 'b', label: 'Option B', disabled: true },
            ]}
          />
        </>,
      )
      expect(
        host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.labels?.[0]
          .textContent,
      ).toContain('Agree to example')
      await click(host.querySelector<HTMLElement>('input[type="checkbox"]'))
      expect(toggle).toHaveBeenCalledWith(true)
      const radios = [...host.querySelectorAll<HTMLElement>('input[type="radio"]')]
      await click(radios[0])
      expect(select).toHaveBeenCalledWith('a')
      await click(radios[1])
      expect(select).toHaveBeenCalledTimes(1)
      expect(
        host.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby'),
      ).toBeTruthy()
    })
    it('FORM-05: failed submission focuses a linked error summary; pending rejects repeat submits without erasing the draft', async () => {
      const submit = vi.fn()
      function Example({ pending = false }: { pending?: boolean }) {
        const [attempt, setAttempt] = useState(0)
        return (
          <Form
            isPending={pending}
            onSubmit={() => {
              submit()
              setAttempt((value) => value + 1)
            }}
          >
            <FormErrorSummary
              errors={attempt ? [{ fieldId: 'draft', message: 'Check the draft' }] : []}
              focusKey={attempt}
            />
            <TextInput
              id="draft"
              label="Draft"
              defaultValue="preserved"
              error={attempt ? 'Check the draft' : undefined}
            />
            <Button type="submit" isPending={pending}>
              Save
            </Button>
          </Form>
        )
      }
      await render(<Example />)
      const input = host.querySelector('input')
      await click(host.querySelector('button'))
      expect(submit).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(host.querySelector('[role="alert"]'))
      await click(host.querySelector('[role="alert"] a'))
      expect(document.activeElement).toBe(input)
      await edit(input, 'correcting draft')
      expect(document.activeElement).toBe(input)
      await render(<Example pending />)
      await act(() => {
        host
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(submit).toHaveBeenCalledOnce()
      expect(host.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
      expect(input?.value).toBe('correcting draft')
    })
    it('FORM-06: pending/disabled Buttons suppress activation, show progress text and retain an accessible destructive variant', async () => {
      const press = vi.fn()
      await render(
        <Button isPending pendingLabel="Saving…" onPress={press}>
          Save
        </Button>,
      )
      await click(host.querySelector('button'))
      expect(press).not.toHaveBeenCalled()
      expect(host.textContent).toContain('Saving…')
      expect(host.querySelector('button')?.getAttribute('data-pending')).toBe('true')
      await render(
        <Button isDisabled variant="danger" onPress={press}>
          Delete example
        </Button>,
      )
      await click(host.querySelector('button'))
      expect(press).not.toHaveBeenCalled()
      expect(host.textContent).toContain('Delete example')
    })
    it.each(['info', 'success', 'warning', 'error'] as const)(
      'FORM-07: %s notice has persistent text and appropriate announcement semantics',
      async (tone) => {
        await render(
          <Notice tone={tone} title="Example status">
            Safe explanation
          </Notice>,
        )
        expect(
          host.querySelector(tone === 'error' ? '[role="alert"]' : '[role="status"]')
            ?.textContent,
        ).toContain('Safe explanation')
      },
    )
    it('FORM-08: loading is announced once; decorative skeletons are hidden and empty state provides recovery', async () => {
      await render(<LoadingState label="Loading example" skeleton />)
      expect(host.querySelectorAll('[role="status"]')).toHaveLength(1)
      expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading example')
      expect(host.querySelector('[aria-hidden="true"]')).not.toBeNull()
      const recover = vi.fn()
      await render(
        <EmptyState
          title="No example results"
          action={<Button onPress={recover}>Clear filters</Button>}
        >
          Try another filter.
        </EmptyState>,
      )
      await click(host.querySelector('button'))
      expect(recover).toHaveBeenCalledOnce()
      expect(host.querySelector('h2')?.textContent).toBe('No example results')
    })
    for (const [kind, Panel] of [
      ['dialog', FormDialog],
      ['drawer', FormDrawer],
    ] as const) {
      function Editor({ pending = false }: { pending?: boolean }) {
        const [draft, setDraft] = useState('original')
        return (
          <Panel
            triggerLabel={`Open ${kind}`}
            title="Edit example"
            description="Changes are not sent automatically"
            isPending={pending}
          >
            <TextInput
              id="edit-value"
              label="Example value"
              value={draft}
              onChange={setDraft}
              error="Example validation error"
            />
          </Panel>
        )
      }
      it(`FORM-09: ${kind} labels content, contains focus, closes on Escape and restores its trigger; controlled draft survives reopen`, async () => {
        await render(<Editor />)
        const trigger = host.querySelector('button')
        await click(trigger)
        expect(dialog()).not.toBeNull()
        await vi.waitFor(
          async () => {
            await act(async () => {
              await new Promise((resolve) => setTimeout(resolve, 0))
            })
            expect(dialog()?.contains(document.activeElement)).toBe(true)
          },
          { timeout: 2000, interval: 20 },
        )
        expect(description(dialog())).toContain('Changes are not sent automatically')
        expect(
          [...(dialog()?.querySelectorAll('button') ?? [])]
            .find((node) => node.textContent === 'Cancel')
            ?.getAttribute('aria-label'),
        ).toBe('Cancel')
        expect(host.closest('[aria-hidden="true"]')).not.toBeNull()
        await edit(dialog()?.querySelector('input') ?? null, 'retained draft')
        await pressEscape()
        expect(dialog()).toBeNull()
        await vi.waitFor(
          async () => {
            await act(async () => {
              await new Promise((resolve) => setTimeout(resolve, 0))
            })
            expect(document.activeElement).toBe(trigger)
          },
          { timeout: 2000, interval: 20 },
        )
        await click(trigger)
        expect(dialog()?.querySelector('input')?.value).toBe('retained draft')
        await click(
          [...(dialog()?.querySelectorAll('button') ?? [])].find(
            (node) => node.textContent === 'Cancel',
          ),
        )
        expect(dialog()).toBeNull()
        await vi.waitFor(
          async () => {
            await act(async () => {
              await new Promise((resolve) => setTimeout(resolve, 0))
            })
            expect(document.activeElement).toBe(trigger)
          },
          { timeout: 2000, interval: 20 },
        )
      })
      it(`FORM-10: pending ${kind} cannot be dismissed by Escape/Cancel; it becomes dismissible when the caller settles`, async () => {
        await render(<Editor />)
        await click(host.querySelector('button'))
        await render(<Editor pending />)
        await pressEscape()
        expect(dialog()).not.toBeNull()
        const cancel = [...(dialog()?.querySelectorAll('button') ?? [])].find(
          (node) => node.textContent === 'Cancel',
        )
        expect(cancel?.disabled).toBe(true)
        await click(cancel)
        expect(dialog()).not.toBeNull()
        await render(<Editor />)
        await pressEscape()
        expect(dialog()).toBeNull()
      })
    }
  })
}

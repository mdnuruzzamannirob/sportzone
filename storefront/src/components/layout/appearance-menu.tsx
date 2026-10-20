'use client'

import { Disclosure } from '../ui/index'
import { ThemePreferenceSelect } from '../ui/theme-preference'

export function AppearanceMenu() {
  return (
    <Disclosure className="my-2 max-w-xs">
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full items-center gap-3 py-3 text-sm">
          Appearance
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body>
          <ThemePreferenceSelect />
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}

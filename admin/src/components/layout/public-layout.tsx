import { Card } from '@heroui/react'
import { Outlet } from 'react-router'
import { ThemePreferenceSelect } from '../ui/theme-preference'

export function PublicLayout() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh max-w-xl px-6 py-16"
    >
      <div className="mb-6">
        <ThemePreferenceSelect />
      </div>
      <Card className="border border-border p-6 sm:p-8">
        <Card.Content>
          <Outlet />
        </Card.Content>
      </Card>
    </main>
  )
}


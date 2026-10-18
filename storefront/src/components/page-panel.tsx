'use client'

import { Card, CardContent, CardHeader } from '@heroui/react'
import type { ReactNode } from 'react'

export function PagePanel({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <Card className="max-w-2xl rounded-card border border-border p-6 sm:p-8">
        <CardHeader>
          <h1 id={id} className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-6">
          {children}
        </CardContent>
      </Card>
    </section>
  )
}

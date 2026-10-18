'use client'

import { useEffect, useId, useState } from 'react'
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  synchronizeThemePreference,
  type ThemePreference,
} from '../../../shared/theme'

export function ThemePreferenceSelect() {
  const id = useId()
  const [preference, setPreference] = useState<ThemePreference>('system')
  useEffect(() => {
    synchronizeThemePreference()
    setPreference(getThemePreference())
    return subscribeThemePreference(() => setPreference(getThemePreference()))
  }, [])
  return (
    <div className="flex items-center gap-3 text-sm">
      <label htmlFor={id}>Appearance</label>
      <select
        id={id}
        value={preference}
        className="min-h-control rounded-control border border-control-border bg-surface px-3 text-text"
        onChange={(event) => {
          const value = event.currentTarget.value
          if (value === 'light' || value === 'dark' || value === 'system')
            setThemePreference(value)
        }}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  )
}

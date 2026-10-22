'use client'

import { SelectField } from './fields'
import { useEffect, useId, useState } from 'react'
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  synchronizeThemePreference,
  type ThemePreference,
} from './theme'

export function ThemePreferenceSelect() {
  const id = useId()
  const [preference, setPreference] = useState<ThemePreference>('system')
  useEffect(() => {
    synchronizeThemePreference()
    setPreference(getThemePreference())
    return subscribeThemePreference(() => setPreference(getThemePreference()))
  }, [])
  return (
    <div className="w-full max-w-xs">
      <SelectField
        id={id}
        name="appearance"
        label="Appearance"
        value={preference}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'system', label: 'System' },
        ]}
        onChange={(value) => {
          if (value === 'light' || value === 'dark' || value === 'system') setThemePreference(value)
        }}
      />
    </div>
  )
}

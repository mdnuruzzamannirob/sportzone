'use client'

import { Label, ListBox, Select } from '@heroui/react'
import { useEffect, useState } from 'react'
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  synchronizeThemePreference,
  type ThemePreference,
} from '../../../shared/theme'

export function ThemePreferenceSelect() {
  const [preference, setPreference] = useState<ThemePreference>('system')
  useEffect(() => {
    synchronizeThemePreference()
    setPreference(getThemePreference())
    return subscribeThemePreference(() => setPreference(getThemePreference()))
  }, [])
  return (
    <Select
      name="appearance"
      value={preference}
      className="w-full max-w-xs"
      onChange={(value) => {
        if (value === 'light' || value === 'dark' || value === 'system')
          setThemePreference(value)
      }}
    >
      <Label>Appearance</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox aria-label="Appearance options">
          <ListBox.Item id="light" textValue="Light">
            Light
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="dark" textValue="Dark">
            Dark
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="system" textValue="System">
            System
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

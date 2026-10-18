'use client'

import { Alert } from '@heroui/react'
import { useEffect, useState } from 'react'

export function NetworkStatus() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return offline ? (
    <Alert role="status" className="mt-4 rounded-card border border-control-border">
      <Alert.Content>
        <Alert.Title>You are offline</Alert.Title>
        <Alert.Description>
          Some pages may be unavailable. Check your connection and try again.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  ) : null
}

'use client'

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
    <p
      role="status"
      className="mt-4 rounded-card border border-control-border bg-surface-muted p-4 text-sm"
    >
      You are offline. Some pages may be unavailable. Check your connection and
      try again.
    </p>
  ) : null
}

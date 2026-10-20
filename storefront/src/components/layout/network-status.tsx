'use client'

import { Notice } from '../ui/feedback'
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
    <div className="mt-4">
      <Notice title="You are offline">
        Some pages may be unavailable. Check your connection and try again.
      </Notice>
    </div>
  ) : null
}

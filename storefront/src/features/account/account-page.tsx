'use client'
import { useEffect, useRef, useState } from 'react'
import { useIdentity } from '../auth/identity-provider'
import { Button, Notice, LoadingState } from '../../components/ui'
import { Link } from '../../components/ui/link'
import { AccountDetails } from './account-details'

export default function AccountPage() {
  const { api, session, announce } = useIdentity()
  const [notice, setNotice] = useState<{
    ownerId: string
    message: string
  } | null>(null)
  const [leaving, setLeaving] = useState(false),
    [logoutPending, setLogoutPending] = useState(false),
    [logoutError, setLogoutError] = useState(false)
  const logoutLock = useRef(false)
  useEffect(() => {
    setNotice((current) => (current?.ownerId === session.data?.id ? current : null))
  }, [session.data?.id])
  async function logout() {
    if (logoutLock.current) return
    logoutLock.current = true
    setLeaving(true)
    setLogoutPending(true)
    setLogoutError(false)
    api.reset()
    try {
      await api.logout()
      announce()
      location.assign('/login')
    } catch {
      setLogoutError(true)
    } finally {
      logoutLock.current = false
      setLogoutPending(false)
    }
  }
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Your account</h1>
        <Link href="/">SportZone home</Link>
      </div>
      {!leaving && notice && notice.ownerId === session.data?.id && (
        <Notice tone="success" title="Confirmed">
          {notice.message}
        </Notice>
      )}
      {leaving ? (
        <section className="space-y-4">
          <p>Your private view has been cleared.</p>
          {logoutError && (
            <Notice tone="error" title="Server sign-out could not be confirmed">
              Reconnect and retry to confirm revocation.
            </Notice>
          )}
          <Button
            isPending={logoutPending}
            pendingLabel="Signing out…"
            onPress={() => void logout()}
          >
            Retry sign out
          </Button>
        </section>
      ) : session.isLoading ? (
        <LoadingState label="Checking your session…" />
      ) : session.isError ? (
        <Notice
          tone="error"
          title="Account service unavailable"
          actions={
            <Button variant="secondary" onPress={() => void session.refetch()}>
              Retry
            </Button>
          }
        >
          Connect to the service and try again. Your private information is hidden.
        </Notice>
      ) : !session.data ? (
        <section className="space-y-4">
          <p>Sign in to view your account. Your session may have expired.</p>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create account</Link>
        </section>
      ) : (
        <AccountDetails
          key={session.data.id}
          account={session.data}
          onLogout={logout}
          onNotice={(ownerId, message) => setNotice({ ownerId, message })}
        />
      )}
    </div>
  )
}

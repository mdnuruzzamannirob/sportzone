'use client'
import { useEffect, useRef, useState } from 'react'
import { useIdentity } from '../auth/identity-provider'
import { IdentityForm } from '../../components/forms/identity-form'
import { Notice, LoadingState } from '../../components/ui/index'
import { Link } from '../../components/ui/link'
import { createAccountClient } from './account.api'
import { emailProofInput } from './account.schema'
export function EmailChange() {
  const { api, session, announce } = useIdentity(),
    captured = useRef(false)
  const [token, setToken] = useState(''),
    [done, setDone] = useState(false)
  useEffect(() => {
    if (captured.current) return
    captured.current = true
    const raw = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
    history.replaceState(history.state, '', location.pathname + location.search)
    setToken(/^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : '')
  }, [])
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Confirm email change</h1>
      {done ? (
        <Notice tone="success" title="Email changed">
          Sign in with your newly verified email.
        </Notice>
      ) : session.isLoading ? (
        <LoadingState label="Checking your session…" />
      ) : !session.data ? (
        <Notice tone="warning" title="Sign in required">
          Sign in with your current email, then reopen the original verification link.
        </Notice>
      ) : !token ? (
        <Notice tone="warning" title="A valid verification link is required">
          Request a new link from your account.
        </Notice>
      ) : (
        <IdentityForm
          title="Verify new address"
          fields={[]}
          schema={emailProofInput}
          extra={{ token }}
          action="Confirm email change"
          submit={async (input) => {
            await createAccountClient(api).confirmEmailChange(input)
            setDone(true)
            setToken('')
            api.reset()
            announce()
            return 'Email changed.'
          }}
        />
      )}
      <Link href="/login">Sign in</Link>
    </div>
  )
}

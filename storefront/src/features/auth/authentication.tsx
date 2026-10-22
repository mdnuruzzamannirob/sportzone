'use client'
import { useEffect, useRef, useState } from 'react'
import { Notice } from '../../components/ui/index'
import { Link } from '../../components/ui/link'
import { useIdentity } from './identity-provider'
import { loginInput, recoveryInput, registerInput, resetInput } from './auth.schema'
import { IdentityForm } from '../../components/forms/identity-form'
type Mode = 'login' | 'register' | 'forgot-password' | 'reset-password'
export function Authentication({ mode }: { mode: Mode }) {
  const { api, cache, announce } = useIdentity()
  const [token, setToken] = useState(''),
    [completed, setCompleted] = useState(false),
    captured = useRef(false)
  useEffect(() => {
    if (mode !== 'reset-password' || captured.current) return
    captured.current = true
    const value = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
    history.replaceState(history.state, '', location.pathname + location.search)
    setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : '')
  }, [mode])
  const title =
    mode === 'login'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create account'
        : mode === 'forgot-password'
          ? 'Recover password'
          : 'Reset password'
  const email = {
    name: 'email',
    label: 'Email',
    type: 'email' as const,
    autoComplete: 'email',
  }
  const password = {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    autoComplete: mode === 'register' ? 'new-password' : 'current-password',
    description: mode === 'register' ? 'Use 12–128 characters; spaces are allowed.' : undefined,
  }
  const fields =
    mode === 'register'
      ? [{ name: 'name', label: 'Name', autoComplete: 'name' }, email, password]
      : mode === 'login'
        ? [email, password]
        : mode === 'forgot-password'
          ? [email]
          : [
              {
                name: 'newPassword',
                label: 'New password',
                type: 'password' as const,
                autoComplete: 'new-password',
                description: 'Use 12–128 characters; spaces are allowed.',
              },
              {
                name: 'confirmPassword',
                label: 'Confirm new password',
                type: 'password' as const,
                autoComplete: 'new-password',
              },
            ]
  const schema =
    mode === 'register'
      ? registerInput
      : mode === 'login'
        ? loginInput
        : mode === 'forgot-password'
          ? recoveryInput
          : resetInput
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Your SportZone account</h1>
      {!api.configured && (
        <Notice tone="warning" title="Account service unavailable">
          Please try again once the service is configured.
        </Notice>
      )}
      {mode === 'reset-password' && !token && !completed && (
        <Notice tone="warning" title="A valid reset link is required">
          Request a new password recovery email.
        </Notice>
      )}
      <IdentityForm
        key={mode}
        title={title}
        fields={fields}
        schema={schema}
        extra={mode === 'reset-password' ? { token } : undefined}
        disabled={!api.configured || (mode === 'reset-password' && !token)}
        action={title}
        submit={async (input) => {
          if (mode === 'login') {
            const result = await api.login(input)
            api.reset()
            announce()
            cache.setQueryData(['session', 'customer'], result.account)
            location.assign('/account')
            return
          }
          if (mode === 'register') {
            await api.register(input)
            return 'Account created. Sign in to continue. Email verification may still be required.'
          }
          if (mode === 'forgot-password') {
            await api.requestPasswordReset(input)
            return 'If this address is eligible, recovery instructions will be sent. Check your inbox.'
          }
          await api.confirmPasswordReset({ token: input.token, newPassword: input.newPassword })
          setCompleted(true)
          setToken('')
          api.reset()
          announce()
          return 'Password reset confirmed. Sign in with your new password.'
        }}
      />
      <nav aria-label="Account navigation" className="flex flex-wrap gap-4">
        <Link href="/login">Sign in</Link>
        <Link href="/register">Create account</Link>
        <Link href="/forgot-password">Forgot password?</Link>
      </nav>
    </div>
  )
}

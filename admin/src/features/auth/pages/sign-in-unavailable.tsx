import { Button } from '../../../components/ui/button'

export function SignInUnavailable() {
  return (
    <>
      <p className="text-sm text-muted">SportZone Admin</p>
      <h1 className="mt-4 text-3xl font-semibold">Administrator access</h1>
      <p className="mt-4 text-muted">Sign-in is not available yet.</p>
      <Button isDisabled className="mt-6">
        Sign in
      </Button>
    </>
  )
}


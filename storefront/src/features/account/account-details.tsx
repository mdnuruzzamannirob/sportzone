'use client'
import { useRef, useState } from 'react'
import { useIdentity } from '../auth/identity-provider'
import type { Account, Address } from '../auth/auth.schema'
import { ApiError } from '../../lib/api-error'
import { IdentityForm } from '../../components/forms/identity-form'
import { Button, Notice, FormDialog } from '../../components/ui'
import { createAccountClient } from './account.api'
import { addressInput, profileInput, passwordChangeInput, emailChangeInput } from './account.schema'
export function AccountDetails({
  account,
  onNotice,
  onLogout,
}: {
  account: Account
  onNotice: (ownerId: string, message: string) => void
  onLogout: () => Promise<void>
}) {
  const { api, cache, announce } = useIdentity()
  const accountApi = createAccountClient(api)
  const [editing, setEditing] = useState<Address | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('')
  const actionLock = useRef(false)
  const addressHeading = useRef<HTMLHeadingElement>(null)
  const refresh = () => cache.invalidateQueries({ queryKey: ['session', 'customer'] })
  async function addressAction(id: string, remove = false) {
    if (actionLock.current) return
    actionLock.current = true
    setPending(true)
    setError('')
    try {
      await (remove ? accountApi.removeAddress(id) : accountApi.makeDefaultAddress(id))
      await refresh()
      if (remove) requestAnimationFrame(() => addressHeading.current?.focus())
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'The request could not be confirmed. Refresh before trying again.',
      )
    } finally {
      actionLock.current = false
      setPending(false)
    }
  }
  return (
    <div className="space-y-8">
      {error && (
        <Notice tone="error" title="Request needs attention">
          {error}
        </Notice>
      )}
      <div key={account.id} className="space-y-10">
        <section className="space-y-4">
          <p>Signed in as {account.email}</p>
          {!account.emailVerified && (
            <Notice tone="warning" title="Email not verified">
              Some account actions require a verified email. Registration verification is not
              available yet.
            </Notice>
          )}
          <Button variant="secondary" onPress={() => void onLogout()}>
            Sign out
          </Button>
        </section>
        <IdentityForm
          title="Profile"
          fields={[
            {
              name: 'name',
              label: 'Name',
              autoComplete: 'name',
              value: account.name,
            },
            {
              name: 'phone',
              label: 'Phone',
              type: 'tel',
              autoComplete: 'tel',
              optional: true,
              value: account.phone,
              description: 'Leave blank to keep your current phone.',
            },
          ]}
          schema={profileInput}
          submit={async (input) => {
            await accountApi.saveProfile(input)
            await refresh()
            return 'Profile saved.'
          }}
        />
        <section className="space-y-5">
          <h2 ref={addressHeading} tabIndex={-1} className="text-xl font-semibold">
            Saved addresses
          </h2>
          {account.addresses.length === 0 && <p>No saved addresses.</p>}
          {account.addresses.map((address) => (
            <article key={address.id} className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="font-semibold">
                {address.recipient}
                {address.isDefault ? ' · Default' : ''}
              </h3>
              <p>
                {address.street}
                {address.addressLine2 ? `, ${address.addressLine2}` : ''}
              </p>
              <p>
                {address.districtKey} · {address.areaKey} · {address.phone}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  isDisabled={pending}
                  onPress={() => setEditing(address)}
                >
                  Edit address
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={pending || address.isDefault}
                  onPress={() => void addressAction(address.id)}
                >
                  Make default
                </Button>
                <FormDialog
                  triggerLabel="Remove address"
                  title="Remove saved address?"
                  description="Past order addresses remain unchanged."
                  isPending={pending}
                  actions={
                    <Button
                      variant="danger"
                      isPending={pending}
                      onPress={() => void addressAction(address.id, true)}
                    >
                      Confirm removal
                    </Button>
                  }
                >
                  <p>{address.street}</p>
                </FormDialog>
              </div>
            </article>
          ))}
        </section>
        <IdentityForm
          key={editing?.id ?? 'new-address'}
          title={editing ? 'Edit saved address' : 'Add address'}
          resetOnSuccess
          schema={addressInput}
          fields={[
            {
              name: 'recipient',
              label: 'Recipient',
              autoComplete: 'name',
              value: editing?.recipient,
            },
            {
              name: 'phone',
              label: 'Address phone',
              type: 'tel',
              autoComplete: 'tel',
              value: editing?.phone,
            },
            {
              name: 'districtKey',
              label: 'District',
              value: editing?.districtKey,
              description: 'Delivery availability will be checked when you save.',
            },
            { name: 'areaKey', label: 'Area', value: editing?.areaKey },
            {
              name: 'street',
              label: 'Street address',
              autoComplete: 'address-line1',
              value: editing?.street,
            },
            {
              name: 'addressLine2',
              label: 'Address line 2',
              autoComplete: 'address-line2',
              optional: true,
              value: editing?.addressLine2,
            },
          ]}
          submit={async (input) => {
            await accountApi.saveAddress(editing?.id, input)
            setEditing(null)
            await refresh()
            return 'Address saved.'
          }}
        />
        {editing && (
          <Button variant="secondary" onPress={() => setEditing(null)}>
            Cancel address edit
          </Button>
        )}
        <IdentityForm
          title="Change password"
          schema={passwordChangeInput}
          fields={[
            {
              name: 'currentPassword',
              label: 'Current password',
              type: 'password',
              autoComplete: 'current-password',
            },
            {
              name: 'newPassword',
              label: 'New password',
              type: 'password',
              autoComplete: 'new-password',
              description: 'Use 12–128 characters; spaces are allowed.',
            },
          ]}
          submit={async (input) => {
            await accountApi.changePassword(input)
            api.reset()
            announce()
            const verified = await api.session()
            cache.setQueryData(['session', 'customer'], verified)
            if (verified?.id === account.id)
              onNotice(account.id, 'Password changed. Other sessions were revoked.')
            return 'Password changed. Other sessions were revoked.'
          }}
        />
        <IdentityForm
          title="Change email"
          schema={emailChangeInput}
          fields={[
            {
              name: 'email',
              label: 'New email',
              type: 'email',
              autoComplete: 'email',
            },
          ]}
          submit={async (input) => {
            await accountApi.requestEmailChange(input)
            return 'If the new address is eligible, verification instructions will be sent. Your current email stays unchanged until confirmation.'
          }}
        />
      </div>
    </div>
  )
}

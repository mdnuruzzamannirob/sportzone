"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useIdentity } from "../../auth/api/session";
import { IdentityForm } from "../../auth/components/identity-form";
import {
	Button,
	Notice,
	LoadingState,
	FormDialog,
} from "../../../components/ui/index";
import { Link } from "../../../components/ui/link";
import {
	addressInput,
	addressSchema,
	profileInput,
	newPassword,
	recoveryInput,
	type Address,
	type Account,
} from "../../auth/schemas/identity";
import { IdentityError } from "../../auth/api/identity-client";

export default function AccountPage() {
	const { api, session, announce } = useIdentity();
	const [notice, setNotice] = useState<{
		ownerId: string;
		message: string;
	} | null>(null);
	const [leaving, setLeaving] = useState(false),
		[logoutPending, setLogoutPending] = useState(false),
		[logoutError, setLogoutError] = useState(false);
	const logoutLock = useRef(false);
	useEffect(() => {
		setNotice((current) =>
			current?.ownerId === session.data?.id ? current : null,
		);
	}, [session.data?.id]);
	async function logout() {
		if (logoutLock.current) return;
		logoutLock.current = true;
		setLeaving(true);
		setLogoutPending(true);
		setLogoutError(false);
		api.reset();
		try {
			await api.mutate(
				"/auth/logout",
				{},
				z.object({ revoked: z.literal(true) }),
			);
			announce();
			location.assign("/login");
		} catch {
			setLogoutError(true);
		} finally {
			logoutLock.current = false;
			setLogoutPending(false);
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
					Connect to the service and try again. Your private information is
					hidden.
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
	);
}
function AccountDetails({
	account,
	onNotice,
	onLogout,
}: {
	account: Account;
	onNotice: (ownerId: string, message: string) => void;
	onLogout: () => Promise<void>;
}) {
	const { api, cache, announce } = useIdentity();
	const [editing, setEditing] = useState<Address | null>(null),
		[pending, setPending] = useState(false),
		[error, setError] = useState("");
	const actionLock = useRef(false);
	const addressHeading = useRef<HTMLHeadingElement>(null);
	const refresh = () =>
		cache.invalidateQueries({ queryKey: ["session", "customer"] });
	async function addressAction(path: string, method = "POST") {
		if (actionLock.current) return;
		actionLock.current = true;
		setPending(true);
		setError("");
		try {
			await api.mutate(path, {}, z.unknown(), "session", method);
			await refresh();
			if (method === "DELETE")
				requestAnimationFrame(() => addressHeading.current?.focus());
		} catch (e) {
			setError(
				e instanceof IdentityError
					? e.message
					: "The request could not be confirmed. Refresh before trying again.",
			);
		} finally {
			actionLock.current = false;
			setPending(false);
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
							Some account actions require a verified email. Registration
							verification is not available yet.
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
							name: "name",
							label: "Name",
							autoComplete: "name",
							value: account.name,
						},
						{
							name: "phone",
							label: "Phone",
							type: "tel",
							autoComplete: "tel",
							optional: true,
							value: account.phone,
							description: "Leave blank to keep your current phone.",
						},
					]}
					schema={profileInput}
					submit={async (input) => {
						await api.mutate("/me", input, z.unknown(), "session", "PATCH");
						await refresh();
						return "Profile saved.";
					}}
				/>
				<section className="space-y-5">
					<h2
						ref={addressHeading}
						tabIndex={-1}
						className="text-xl font-semibold"
					>
						Saved addresses
					</h2>
					{account.addresses.length === 0 && <p>No saved addresses.</p>}
					{account.addresses.map((address) => (
						<article
							key={address.id}
							className="space-y-3 rounded-lg border border-border p-4"
						>
							<h3 className="font-semibold">
								{address.recipient}
								{address.isDefault ? " · Default" : ""}
							</h3>
							<p>
								{address.street}
								{address.addressLine2 ? `, ${address.addressLine2}` : ""}
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
									onPress={() =>
										void addressAction(`/me/addresses/${address.id}/default`)
									}
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
											onPress={() =>
												void addressAction(
													`/me/addresses/${address.id}`,
													"DELETE",
												)
											}
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
					key={editing?.id ?? "new-address"}
					title={editing ? "Edit saved address" : "Add address"}
					resetOnSuccess
					schema={addressInput}
					fields={[
						{
							name: "recipient",
							label: "Recipient",
							autoComplete: "name",
							value: editing?.recipient,
						},
						{
							name: "phone",
							label: "Address phone",
							type: "tel",
							autoComplete: "tel",
							value: editing?.phone,
						},
						{
							name: "districtKey",
							label: "District",
							value: editing?.districtKey,
							description:
								"Delivery availability will be checked when you save.",
						},
						{ name: "areaKey", label: "Area", value: editing?.areaKey },
						{
							name: "street",
							label: "Street address",
							autoComplete: "address-line1",
							value: editing?.street,
						},
						{
							name: "addressLine2",
							label: "Address line 2",
							autoComplete: "address-line2",
							optional: true,
							value: editing?.addressLine2,
						},
					]}
					submit={async (input) => {
						await api.mutate(
							editing ? `/me/addresses/${editing.id}` : "/me/addresses",
							input,
							addressSchema,
							"session",
							editing ? "PATCH" : "POST",
						);
						setEditing(null);
						await refresh();
						return "Address saved.";
					}}
				/>
				{editing && (
					<Button variant="secondary" onPress={() => setEditing(null)}>
						Cancel address edit
					</Button>
				)}
				<IdentityForm
					title="Change password"
					schema={z.strictObject({
						currentPassword: z.string().min(1),
						newPassword,
					})}
					fields={[
						{
							name: "currentPassword",
							label: "Current password",
							type: "password",
							autoComplete: "current-password",
						},
						{
							name: "newPassword",
							label: "New password",
							type: "password",
							autoComplete: "new-password",
							description: "Use 12–128 characters; spaces are allowed.",
						},
					]}
					submit={async (input) => {
						await api.mutate(
							"/me/password-change",
							input,
							z.object({ changed: z.literal(true) }),
							"session",
						);
						api.reset();
						announce();
						const verified = await api.session();
						cache.setQueryData(["session", "customer"], verified);
						if (verified?.id === account.id)
							onNotice(
								account.id,
								"Password changed. Other sessions were revoked.",
							);
						return "Password changed. Other sessions were revoked.";
					}}
				/>
				<IdentityForm
					title="Change email"
					schema={recoveryInput.transform((v) => ({ newEmail: v.email }))}
					fields={[
						{
							name: "email",
							label: "New email",
							type: "email",
							autoComplete: "email",
						},
					]}
					submit={async (input) => {
						await api.mutate(
							"/me/email-changes",
							input,
							z.object({ verificationSent: z.literal(true) }),
							"session",
						);
						return "If the new address is eligible, verification instructions will be sent. Your current email stays unchanged until confirmation.";
					}}
				/>
			</div>
		</div>
	);
}

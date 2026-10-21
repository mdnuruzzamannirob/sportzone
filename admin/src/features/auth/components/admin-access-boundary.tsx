import { useState } from "react";
import { z } from "zod";
import { useIdentity } from "../api/session";
import { Button, Notice, LoadingState } from "../../../components/ui/index";
import { Link } from "../../../components/ui/link";
import { AdminShell } from "../../../components/layout/admin-shell";
export default function AdminAccessBoundary() {
	const { api, session, announce } = useIdentity();
	const [leaving, setLeaving] = useState(false),
		[failure, setFailure] = useState(false),
		[pending, setPending] = useState(false);
	async function logout() {
		if (pending) return;
		setLeaving(true);
		setPending(true);
		setFailure(false);
		api.reset();
		try {
			await api.mutate(
				"/admin/auth/logout",
				{},
				z.object({ revoked: z.literal(true) }),
			);
			announce();
			location.assign("/login");
		} catch {
			setFailure(true);
		} finally {
			setPending(false);
		}
	}
	if (session.isLoading)
		return (
			<main id="main-content" className="p-8">
				<LoadingState label="Checking administrator session…" />
			</main>
		);
	if (session.isError)
		return (
			<main id="main-content" className="mx-auto max-w-xl space-y-5 p-8">
				<h1 className="text-3xl font-semibold">
					Administrator service unavailable
				</h1>
				<Notice tone="error" title="Unable to check access">
					No private management information is displayed.
				</Notice>
				<Button onPress={() => void session.refetch()}>Retry</Button>
				<Link to="/login">Go to administrator sign-in</Link>
			</main>
		);
	if (!session.data || leaving)
		return (
			<main id="main-content" className="mx-auto max-w-xl space-y-5 p-8">
				<h1 className="text-3xl font-semibold">
					Administrator sign-in required
				</h1>
				{failure && (
					<Notice tone="error" title="Sign-out could not be confirmed">
						Reconnect and sign out again to confirm server revocation.
					</Notice>
				)}
				{leaving && (
					<Button
						isPending={pending}
						pendingLabel="Signing out…"
						onPress={() => void logout()}
					>
						Retry sign out
					</Button>
				)}
				<Link to="/login">Go to administrator sign-in</Link>
			</main>
		);
	return (
		<AdminShell
			title="Administration"
			identity={session.data.email}
			actions={
				<Button variant="secondary" onPress={() => void logout()}>
					Sign out
				</Button>
			}
		>
			<Notice title="Administrator session verified">
				You are signed in. Store-management features will appear as their API
				integrations become available.
			</Notice>
		</AdminShell>
	);
}

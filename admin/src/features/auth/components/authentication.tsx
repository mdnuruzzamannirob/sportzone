"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { IdentityForm } from "./identity-form";
import { useIdentity } from "../api/session";
import { Notice } from "../../../components/ui/index";
import { Link } from "../../../components/ui/link";
import {
	loginInput,
	recoveryInput,
	resetInput,
	sessionSchema,
} from "../schemas/identity";

type Mode = "login" | "forgot-password" | "reset-password";
export function Authentication({ mode }: { mode: Mode }) {
	const { api, cache, announce } = useIdentity();
	const [token, setToken] = useState(""),
		[completed, setCompleted] = useState(false),
		captured = useRef(false);
	useEffect(() => {
		if (mode !== "reset-password" || captured.current) return;
		captured.current = true;
		const value =
			new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
		history.replaceState(
			history.state,
			"",
			location.pathname + location.search,
		);
		setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
	}, [mode]);
	const title =
		mode === "login"
			? "Sign in"
			: mode === "forgot-password"
				? "Recover password"
				: "Reset password";
	const email = {
		name: "email",
		label: "Email",
		type: "email" as const,
		autoComplete: "email",
	};
	const password = {
		name: "password",
		label: "Password",
		type: "password" as const,
		autoComplete: "current-password",
	};
	const fields =
		mode === "login"
			? [email, password]
			: mode === "forgot-password"
				? [email]
				: [
						{
							name: "newPassword",
							label: "New password",
							type: "password" as const,
							autoComplete: "new-password",
							description: "Use 12–128 characters; spaces are allowed.",
						},
						{
							name: "confirmPassword",
							label: "Confirm new password",
							type: "password" as const,
							autoComplete: "new-password",
						},
					];
	const schema =
		mode === "login"
			? loginInput
			: mode === "forgot-password"
				? recoveryInput
				: resetInput;
	return (
		<div className="space-y-6">
			<h1 className="text-3xl font-semibold">SportZone administrator</h1>
			{!api.configured && (
				<Notice tone="warning" title="Account service unavailable">
					Please try again once the service is configured.
				</Notice>
			)}
			{mode === "reset-password" && !token && !completed && (
				<Notice tone="warning" title="A valid reset link is required">
					Request a new password recovery email.
				</Notice>
			)}
			<IdentityForm
				key={mode}
				title={title}
				fields={fields}
				schema={schema}
				extra={mode === "reset-password" ? { token } : undefined}
				disabled={!api.configured || (mode === "reset-password" && !token)}
				action={title}
				submit={async (input) => {
					if (mode === "login") {
						const result = await api.mutate(
							`${api.prefix}/login`,
							input,
							sessionSchema,
						);
						api.reset();
						announce();
						cache.setQueryData(["session", "admin"], result.account);
						location.assign("/app");
						return;
					}
					if (mode === "forgot-password") {
						await api.mutate(
							`${api.prefix}/password-resets`,
							input,
							z.object({ accepted: z.literal(true) }),
						);
						return "If this address is eligible, recovery instructions will be sent. Check your inbox.";
					}
					await api.mutate(
						`${api.prefix}/password-resets/confirm`,
						{ token: input.token, newPassword: input.newPassword },
						z.object({ reset: z.literal(true) }),
					);
					setCompleted(true);
					setToken("");
					api.reset();
					announce();
					return "Password reset confirmed. Sign in with your new password.";
				}}
			/>
			<nav aria-label="Account navigation" className="flex flex-wrap gap-4">
				<Link to="/login">Sign in</Link>
				<Link to="/forgot-password">Forgot password?</Link>
			</nav>
		</div>
	);
}

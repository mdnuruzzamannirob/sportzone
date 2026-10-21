"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { z } from "zod";
import {
	Card,
	Button,
	Form,
	FormErrorSummary,
	TextInput,
	Notice,
} from "../../../components/ui/index";
import { IdentityError } from "../api/identity-client";

type Field = {
	name: string;
	label: string;
	type?: "text" | "email" | "password" | "tel";
	autoComplete?: string;
	description?: string;
	optional?: boolean;
	value?: string;
};
export function IdentityForm({
	title,
	fields,
	schema,
	submit,
	action = "Save",
	extra = {},
	disabled = false,
	resetOnSuccess = false,
}: {
	title: string;
	fields: Field[];
	schema: z.ZodType<Record<string, unknown>>;
	submit: (input: Record<string, unknown>) => Promise<string | undefined>;
	action?: string;
	extra?: Record<string, unknown>;
	disabled?: boolean;
	resetOnSuccess?: boolean;
}) {
	// Keep SSR forms inert until their submit handler is attached.
	const [ready, setReady] = useState(false);
	useEffect(() => setReady(true), []);
	const id = useId(),
		locked = useRef(false);
	const [pending, setPending] = useState(false),
		[errors, setErrors] = useState<{ fieldId: string; message: string }[]>([]),
		[attempt, setAttempt] = useState(0),
		[notice, setNotice] = useState(""),
		[failed, setFailed] = useState(false);
	return (
		<section className="min-w-0">
			<Card>
				<Card.Content className="space-y-4">
					<h2 className="text-xl font-semibold">{title}</h2>
					<Form
						aria-label={title}
						className="flex w-full flex-col gap-5"
						isPending={pending}
						onSubmit={async (event) => {
							if (locked.current) return;
							const form = event.currentTarget;
							const values = Object.fromEntries(new FormData(form));
							for (const field of fields)
								if (field.optional && values[field.name] === "")
									delete values[field.name];
							const result = schema.safeParse({ ...values, ...extra });
							setAttempt((a) => a + 1);
							setNotice("");
							setFailed(false);
							if (!result.success) {
								setErrors(
									result.error.issues.map((issue) => ({
										fieldId: `${id}-${String(issue.path[0])}`,
										message: "Check this value.",
									})),
								);
								return;
							}
							setErrors([]);
							locked.current = true;
							setPending(true);
							try {
								const message = await submit(result.data);
								setNotice(message ?? "Saved.");
								if (resetOnSuccess) form.reset();
								form
									.querySelectorAll<HTMLInputElement>('input[type="password"]')
									.forEach((input) => {
										input.value = "";
									});
							} catch (error) {
								setFailed(true);
								setNotice(
									error instanceof IdentityError
										? `${error.message}${error.retryAfter ? ` Try again in ${error.retryAfter} seconds.` : ""}`
										: "The request could not be confirmed. Check current state before trying again.",
								);
							} finally {
								locked.current = false;
								setPending(false);
							}
						}}
					>
						<FormErrorSummary errors={errors} focusKey={attempt} />
						{fields.map((field) => (
							<TextInput
								key={field.name}
								id={`${id}-${field.name}`}
								name={field.name}
								label={field.label}
								type={field.type ?? "text"}
								autoComplete={field.autoComplete}
								description={field.description}
								defaultValue={field.value}
								onChange={() =>
									setErrors((current) =>
										current.filter(
											(issue) => issue.fieldId !== `${id}-${field.name}`,
										),
									)
								}
								isRequired={!field.optional}
								isDisabled={!ready || pending || disabled}
								error={
									errors.some((e) => e.fieldId === `${id}-${field.name}`)
										? "Check this value."
										: undefined
								}
							/>
						))}
						{notice && (
							<Notice
								tone={failed ? "error" : "success"}
								title={failed ? "Request needs attention" : "Confirmed"}
							>
								{notice}
							</Notice>
						)}
						<Button
							type="submit"
							isPending={pending}
							pendingLabel="Please wait…"
							isDisabled={!ready || disabled}
						>
							{action}
						</Button>
					</Form>
				</Card.Content>
			</Card>
		</section>
	);
}

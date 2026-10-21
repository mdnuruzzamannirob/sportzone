import { z } from "zod";
import { sessionSchema } from "../schemas/identity";

const messages: Record<string, string> = {
	AUTH_REQUIRED: "Your session has expired. Sign in again.",
	INVALID_CREDENTIALS:
		"Email or password is incorrect, or access is unavailable.",
	FORBIDDEN: "This action is not available for your account.",
	CSRF_INVALID: "Your form security check expired. Please submit again.",
	RATE_LIMITED: "Too many attempts. Wait before trying again.",
	VALIDATION_FAILED: "Check the supplied fields.",
	INVALID_REQUEST: "Check your input or request a new verification link.",
	STATE_CONFLICT:
		"This change conflicts with the current account state. Refresh and try again.",
	UNSUPPORTED_DELIVERY_AREA:
		"Delivery is not available for this district and area.",
	NOT_FOUND: "This item is no longer available.",
};
export class IdentityError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly retryAfter?: number,
	) {
		super(
			messages[code] ?? "The account service is unavailable. Please try again.",
		);
	}
}
export function createIdentityClient(
	origin: string | undefined,
	realm: "customer" | "admin",
	clearPrivate: () => void,
	transport: typeof fetch = (...args) => fetch(...args),
) {
	let base = "",
		generation = 0,
		busy = false;
	try {
		const url = new URL(origin ?? "");
		if (
			url.origin !== origin ||
			url.username ||
			url.password ||
			(url.protocol !== "https:" &&
				!(
					url.protocol === "http:" &&
					["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
				))
		)
			throw new Error();
		base = `${url.origin}/api/v1`;
	} catch {
		/* Missing/invalid public configuration disables requests, never guesses a host. */
	}
	const prefix = realm === "admin" ? "/admin/auth" : "/auth";
	const reset = () => {
		generation++;
		clearPrivate();
	};
	async function request<T>(
		path: string,
		schema: z.ZodType<T>,
		options: RequestInit = {},
	) {
		if (!base) throw new IdentityError(0, "UNAVAILABLE");
		const started = generation;
		let response: Response;
		try {
			response = await transport(base + path, {
				...options,
				credentials: "include",
				cache: "no-store",
				redirect: "error",
				referrerPolicy: "no-referrer",
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError")
				throw error;
			throw new IdentityError(0, "UNAVAILABLE");
		}
		if (started !== generation)
			throw new DOMException("Identity changed", "AbortError");
		let body: unknown;
		try {
			body =
				response.status === 204 ? { data: undefined } : await response.json();
		} catch {
			throw new IdentityError(response.status, "INVALID_RESPONSE");
		}
		if (started !== generation)
			throw new DOMException("Identity changed", "AbortError");
		if (!response.ok) {
			const parsed = z
				.object({ error: z.object({ code: z.string() }) })
				.safeParse(body);
			const code =
				parsed.success && Object.hasOwn(messages, parsed.data.error.code)
					? parsed.data.error.code
					: "UNAVAILABLE";
			if (response.status === 401) reset();
			const seconds = Number(response.headers.get("Retry-After"));
			throw new IdentityError(
				response.status,
				code,
				Number.isInteger(seconds) && seconds > 0 ? seconds : undefined,
			);
		}
		const parsed = z.object({ data: schema }).safeParse(body);
		if (!parsed.success)
			throw new IdentityError(response.status, "INVALID_RESPONSE");
		return parsed.data.data;
	}
	return {
		configured: !!base,
		reset,
		prefix,
		async session(signal?: AbortSignal) {
			try {
				return (await request(`${prefix}/session`, sessionSchema, { signal }))
					.account;
			} catch (error) {
				if (error instanceof IdentityError && error.status === 401) return null;
				throw error;
			}
		},
		get: request,
		async mutate<T>(
			path: string,
			input: unknown,
			schema: z.ZodType<T>,
			scope: "context" | "session" = "context",
			method = "POST",
		) {
			if (busy) throw new IdentityError(409, "STATE_CONFLICT");
			busy = true;
			try {
				const query =
					realm === "admin" || scope === "context"
						? "?sessionKind=context"
						: "?sessionKind=customer";
				const csrf = await request(
					`${prefix}/csrf${query}`,
					z.object({ csrfToken: z.string() }),
				);
				// Never retry or replay a mutation, including after a network/CSRF failure.
				return await request(path, schema, {
					method,
					headers: {
						"Content-Type": "application/json",
						"X-CSRF-Token": csrf.csrfToken,
					},
					body: JSON.stringify(input),
				});
			} finally {
				busy = false;
			}
		},
	};
}

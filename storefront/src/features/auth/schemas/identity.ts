import { z } from "zod";

const text = (max: number) =>
	z
		.string()
		.trim()
		.min(1)
		.refine((v) => [...v].length <= max);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const newPassword = z
	.string()
	.refine(
		(v) =>
			[...v].length >= 12 &&
			[...v].length <= 128 &&
			new TextEncoder().encode(v).length <= 512,
		"Use 12–128 characters (at most 512 bytes).",
	);
export const loginInput = z.strictObject({
	email,
	password: z.string().min(1),
});
export const registerInput = loginInput.extend({
	name: text(120),
	password: newPassword,
});
export const recoveryInput = z.strictObject({ email });
export const resetInput = z
	.strictObject({
		token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
		newPassword,
		confirmPassword: z.string(),
	})
	.refine((value) => value.newPassword === value.confirmPassword, {
		path: ["confirmPassword"],
		message: "Passwords must match.",
	});
export const profileInput = z.strictObject({
	name: text(120),
	phone: z.string().trim().min(1).optional(),
});
export const addressInput = z.strictObject({
	recipient: text(120),
	phone: text(64),
	districtKey: text(64),
	areaKey: text(64),
	street: text(300),
	addressLine2: text(300).optional(),
});
export const addressSchema = addressInput.extend({
	id: z.string().regex(/^[a-f0-9]{24}$/),
	isDefault: z.boolean(),
});
export const accountSchema = z.object({
	id: z.string().regex(/^[a-f0-9]{24}$/),
	name: z.string(),
	email: z.email(),
	phone: z.string().optional(),
	emailVerified: z.boolean(),
	addresses: z.array(addressSchema),
	status: z.enum(["active", "suspended"]),
});
export const sessionSchema = z.object({ account: accountSchema });
export type Account = z.infer<typeof accountSchema>;
export type Address = z.infer<typeof addressSchema>;

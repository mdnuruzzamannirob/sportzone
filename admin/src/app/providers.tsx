import { IdentityProvider } from "../features/auth/api/session";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router";

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<IdentityProvider>
			<BrowserRouter>{children}</BrowserRouter>
		</IdentityProvider>
	);
}

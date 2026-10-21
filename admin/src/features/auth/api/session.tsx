import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { createIdentityClient, IdentityError } from "./identity-client";

function createState() {
	const cache = new QueryClient({
		defaultOptions: {
			queries: {
				retry: (count, error) =>
					count < 1 && error instanceof IdentityError && error.status >= 500,
				staleTime: 0,
				gcTime: 0,
				refetchOnWindowFocus: true,
			},
			mutations: { retry: false, gcTime: 0 },
		},
	});
	const api = createIdentityClient(
		import.meta.env.VITE_API_ORIGIN,
		"admin",
		() => {
			void cache.cancelQueries();
			cache.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
			cache.setQueryData(["session", "admin"], null);
		},
	);
	const sender = crypto.randomUUID();
	const announce = () => {
		if (
			typeof window !== "undefined" &&
			typeof BroadcastChannel !== "undefined"
		) {
			const channel = new BroadcastChannel("sportzone.identity.admin");
			channel.postMessage({ event: "changed", sender });
			channel.close();
		}
	};
	return { cache, api, sender, announce };
}
const Context = createContext<ReturnType<typeof createState> | null>(null);
export function IdentityProvider({ children }: { children: ReactNode }) {
	const [state] = useState(createState);
	useEffect(() => {
		if (typeof BroadcastChannel === "undefined") return;
		const channel = new BroadcastChannel("sportzone.identity.admin");
		channel.onmessage = (message) => {
			const input: unknown = message.data;
			if (
				input &&
				typeof input === "object" &&
				"event" in input &&
				input.event === "changed" &&
				"sender" in input &&
				input.sender !== state.sender
			) {
				state.api.reset();
				void state.cache.invalidateQueries({ queryKey: ["session", "admin"] });
			}
		};
		return () => channel.close();
	}, [state]);
	return (
		<Context.Provider value={state}>
			<QueryClientProvider client={state.cache}>{children}</QueryClientProvider>
		</Context.Provider>
	);
}
export function useIdentity() {
	const state = useContext(Context);
	if (!state) throw new Error("Identity provider is required");
	const session = useQuery({
		queryKey: ["session", "admin"],
		queryFn: ({ signal }) => state.api.session(signal),
	});
	return { ...state, session };
}

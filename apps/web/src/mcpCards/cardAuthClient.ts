// the auth client an mcp card reads in place of Better Auth's. vite.mcpCards.config.ts aliases
// @carlnotes/client/authClient to this file. the session is the caller the tool result names, so no request leaves the
// card
import type { authClient as betterAuthClient } from "@carlnotes/client/authClient"
import { useCardData } from "./cardHost"

// the session Better Auth's useSession returns, with the user fields the api's auth config adds
type CardSession = typeof betterAuthClient.$Infer.Session

/**
 * The client's methods a card's components reach. useSession returns the tool result's caller as Better Auth's hook
 * shapes it, and signOut does nothing.
 */
export const authClient = {
	useSession: () => {
		const { session } = useCardData()
		const cardSession = session
			? ({
					user: {
						id: session.userId,
						username: session.username,
						avatarSource: session.avatarSource,
						avatarVersion: session.avatarVersion,
					},
					session: { userId: session.userId },
				} as unknown as CardSession)
			: null
		return { data: cardSession, isPending: false, error: null, refetch: async () => {} }
	},
	signOut: async () => ({ data: null, error: null }),
}

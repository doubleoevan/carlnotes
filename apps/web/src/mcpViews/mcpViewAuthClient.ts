// the auth client an MCP view reads in place of Better Auth's. vite.mcpViews.config.ts aliases
// @carlnotes/client/authClient to this file. the session is the caller the tool result names, so no request leaves the
// MCP view
import type { AuthClient } from "@carlnotes/client/authClient"
import { useMcpViewData } from "./mcpViewHost"

// the session Better Auth's useSession returns, with the user fields the api's auth config adds
type McpViewSession = AuthClient["$Infer"]["Session"]

/**
 * The client's methods an MCP view's components reach. useSession returns the tool result's caller as Better Auth's hook
 * shapes it, and signOut does nothing.
 */
const mcpViewAuthClient = {
	useSession: () => {
		const { session } = useMcpViewData()
		const mcpViewSession = session
			? ({
					user: {
						id: session.userId,
						username: session.username,
						avatarSource: session.avatarSource,
						avatarVersion: session.avatarVersion,
					},
					session: { userId: session.userId },
				} as unknown as McpViewSession)
			: null
		return { data: mcpViewSession, isPending: false, error: null, refetch: async () => {} }
	},
	signOut: async () => ({ data: null, error: null }),
}

/**
 * Returns the MCP view's client in place of the configured one.
 */
export function authClient(): typeof mcpViewAuthClient {
	return mcpViewAuthClient
}

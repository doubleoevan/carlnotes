// the auth client every story reads in place of Better Auth's, so no request leaves the browser. main.ts aliases
// @carlnotes/client/authClient to this file. useSession reads the session from the story's own context, which the
// preview sets from the story's session parameter, so a docs page showing several stories gives each its own session
import { createContext, useContext } from "react"
import { fn } from "storybook/test"
import type { StorySession } from "../fixtures"

/**
 * The session the stories inside it read, or null for a visitor.
 */
export const StorySessionContext = createContext<StorySession | null>(null)

/**
 * The client's methods that the stories reach, each a spy. useSession returns the story's session as Better Auth's
 * hook shapes it, and signOut resolves without a request.
 */
export const authClient = {
	useSession: fn(() => ({
		data: useContext(StorySessionContext),
		isPending: false,
		error: null,
		refetch: fn(),
	})).mockName("authClient.useSession"),
	signOut: fn(async () => ({ data: null, error: null })).mockName("authClient.signOut"),
}

import { getRouteApi } from "@tanstack/react-router"
import { authClient } from "@/clients/authClient"

// the root route's loader says whether the page load brought a session cookie
const rootRoute = getRouteApi("__root__")

/**
 * Whether the page shows as signed in. The page load's session cookie decides until Better Auth's session request finishes,
 * and the session decides after.
 */
export function useIsSignedInBeforeSession(): boolean {
	const { data: session, isPending } = authClient.useSession()
	const hasSessionCookie = Boolean(rootRoute.useLoaderData())
	return isPending ? hasSessionCookie : Boolean(session)
}

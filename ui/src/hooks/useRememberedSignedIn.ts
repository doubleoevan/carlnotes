import { useEffect } from "react"
import { authClient } from "@/clients/authClient"

// the last response the session gave this browser, read back before the next load's session arrives
const SIGNED_IN_KEY = "signed-in"

/**
 * Whether to show the page as signed in, answered before the session request finishes.
 * Better Auth loads the session with a fetch, so the first paint of every load has no session yet.
 * The last answer stands in until the real one arrives, which keeps the header from drawing one layout
 * and swapping to the other a moment later. A browser that has never signed in has no stored answer,
 * and reads as signed out, which is what a first-time visitor is.
 */
export function useRememberedSignedIn(): boolean {
	const { data: session, isPending } = authClient.useSession()

	// the resolved session is the truth, and it seeds the next load
	useEffect(() => {
		if (!isPending) {
			localStorage.setItem(SIGNED_IN_KEY, String(Boolean(session)))
		}
	}, [session, isPending])
	return isPending ? localStorage.getItem(SIGNED_IN_KEY) === "true" : Boolean(session)
}

import { redirect } from "@tanstack/react-router"
import { authClient } from "@/clients/authClient"

/**
 * Redirects a signed-out visitor to the login page, with the requested path to return to after sign-in.
 */
export async function requireSession({ location }: { location: { href: string } }): Promise<void> {
	// reuse the session useSession keeps current, or read the session from the api until useSession has loaded
	const sessionState = authClient.$store.atoms.session?.get() as { data: unknown; isPending: boolean } | undefined
	const session = sessionState && !sessionState.isPending ? sessionState.data : (await authClient.getSession()).data
	if (!session) {
		throw redirect({ href: `/login?next=${encodeURIComponent(location.href)}` })
	}
}

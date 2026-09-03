// signing out, one click and done
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"

/**
 * Signs the user out and reloads the page, so the signed-in controls disappear. A failure shows a toast.
 */
export async function signOutAndReload(): Promise<void> {
	const { error } = await authClient.signOut()
	if (error) {
		toast(`Carl could not sign you out. ${error.message ?? "Try again in a moment."}`)
		return
	}
	window.location.reload()
}

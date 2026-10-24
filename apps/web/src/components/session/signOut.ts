// signing out, one click and done

import { authClient } from "@carlnotes/client/authClient"
import { toSignOutFailedText } from "@carlnotes/core/lib/sessionCopy"
import { toast } from "sonner"

/**
 * Signs the user out and reloads the page, so the signed-in controls disappear. A failure shows a toast.
 */
export async function signOutAndReload(): Promise<void> {
	const { error } = await authClient().signOut()
	if (error) {
		toast(toSignOutFailedText(error.message))
		return
	}
	window.location.reload()
}

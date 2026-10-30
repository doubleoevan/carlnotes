import { toSignOutFailedText } from "@carlnotes/core/lib/sessionCopy"
import { useState } from "react"
import { Alert } from "react-native"
import { mobileAuthClient } from "@/authClient"
import { unregisterPushDevice } from "@/pushRegistration"
import { exitSession } from "@/sessionExit"

/**
 * Signs out through the shared session cleanup and reports a failed request.
 */
export function useSignOut(): { isPending: boolean; signOut: () => Promise<void> } {
	// share the pending state between the screen and its sign-out control
	const [isPending, setIsPending] = useState(false)
	const signOut = async (): Promise<void> => {
		// prevent repeated requests while the session closes
		setIsPending(true)
		try {
			// unregister the phone's push token while the session can still authenticate the request. a failure
			// never blocks the sign-out
			await unregisterPushDevice()

			// clear local account state after the server accepts sign-out
			const { error } = await exitSession(() => mobileAuthClient.signOut())
			if (error) {
				Alert.alert("CarlNotes", toSignOutFailedText(error.message))
			}
		} catch (error) {
			// preserve the account when its sign-out request fails
			console.error("sign out failed", error)
			Alert.alert("CarlNotes", toSignOutFailedText(undefined))
		} finally {
			setIsPending(false)
		}
	}
	return { isPending, signOut }
}

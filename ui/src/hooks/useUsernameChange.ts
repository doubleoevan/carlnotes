// changing the signed-in user's username, shared by the account page and the profile page's edit modal
import { useState } from "react"
import { authClient } from "@/clients/authClient"
import { sendUsername } from "@/clients/profileClient"

// error messages for username changes
const USERNAME_REJECTIONS: Record<string, string> = {
	length: "Between 3 and 32 characters.",
	charset: "Letters, numbers, hyphens and underscores only.",
	separator: "It can't start or end with a hyphen or underscore.",
	reserved: "That one's taken by the site itself.",
	taken: "Someone already has that one.",
}

// the username being typed, the reason the username could not be saved, and the save method
export type UsernameChange = {
	username: string
	setUsername: (username: string) => void
	rejection: string | null
	isSaving: boolean
	// saves the typed username and returns whether the server accepted it
	saveUsername: () => Promise<boolean>
}

/**
 * The typed username and the save method. Refreshes the session on success.
 */
export function useUsernameChange(onChanged?: () => void): UsernameChange {
	const { refetch: refreshSession } = authClient.useSession()
	const [username, setUsername] = useState("")
	const [rejection, setRejection] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)

	// save the typed username and handle the api's validation rules
	async function saveUsername(): Promise<boolean> {
		setIsSaving(true)
		setRejection(null)
		try {
			// a username the api rejects shows its reason
			const usernameRejection = await sendUsername(username)
			if (usernameRejection) {
				setRejection(USERNAME_REJECTIONS[usernameRejection] ?? "That didn't work. Try again.")
				return false
			}
			// refresh the session so the new name shows everywhere
			await refreshSession()
			onChanged?.()
			setUsername("")
			return true
			// a request that never reached the api gets a rejection message
		} catch (error) {
			console.error("username change failed", error)
			setRejection("That didn't reach Carl. Try again.")
			return false
		} finally {
			setIsSaving(false)
		}
	}

	return { username, setUsername, rejection, isSaving, saveUsername }
}

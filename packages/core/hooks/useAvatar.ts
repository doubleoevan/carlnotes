// the avatar setting, read from the session and updated through it

import { authClient } from "@carlnotes/client/authClient"
import { sendAvatarSource, uploadAvatar, uploadAvatarBody } from "@carlnotes/client/profileClient"
import { toAvatarVersion } from "@carlnotes/contracts/avatars"

// the current image and its url's version, whether there is a provider photo to show, and the functions that change it
type AvatarSetting = {
	avatarSource: string
	avatarVersion: string | null
	hasProviderPhoto: boolean
	setAvatarSource: (nextSource: "generated" | "oauth") => Promise<void>
	uploadAvatarFile: (file: File) => Promise<string | null>
	uploadAvatarBody: (body: FormData) => Promise<string | null>
}

/**
 * Reads avatar settings and refreshes the shared session after accepted changes.
 */
export function useAvatar(): AvatarSetting {
	const { data: session } = authClient().useSession()
	const providerImageUrl = session?.user.image ?? null

	// swap between the generated image and the oauth provider's photo
	async function setAvatarSource(nextSource: "generated" | "oauth"): Promise<void> {
		try {
			// save the source, then refresh the session, which every copy of this user's avatar follows
			await sendAvatarSource(nextSource)
			refreshAuthSession()
		} catch (error) {
			console.error("avatar source change failed", error)
		}
	}

	// send the platform's encoded photo and refresh the session after acceptance
	async function uploadPhoto(photo: File | FormData): Promise<string | null> {
		const rejection = await (photo instanceof FormData ? uploadAvatarBody(photo) : uploadAvatar(photo))
		if (!rejection) {
			refreshAuthSession()
		}
		return rejection
	}

	return {
		avatarSource: session?.user.avatarSource ?? "generated",
		avatarVersion: toAvatarVersion(session?.user ?? {}),
		hasProviderPhoto: Boolean(providerImageUrl),
		setAvatarSource,
		uploadAvatarFile: uploadPhoto,
		uploadAvatarBody: uploadPhoto,
	}
}

// the signal that better-auth's own plugins raise to make every useSession re-fetch
function refreshAuthSession(): void {
	authClient().$store.notify("$sessionSignal")
}

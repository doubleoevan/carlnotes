// the avatar setting, read from the session and updated through it
import { toAvatarVersion } from "@shared/avatars"
import { authClient } from "@/clients/authClient"
import { sendAvatarSource, uploadAvatar } from "@/clients/profileClient"

// the current image and its url's version, whether there is a provider photo to show, and the functions that change it
type AvatarSetting = {
	avatarSource: string
	avatarVersion: string | null
	hasProviderPhoto: boolean
	setAvatarSource: (nextSource: "generated" | "oauth") => Promise<void>
	uploadAvatarFile: (file: File) => Promise<string | null>
}

// the signal that better-auth's own plugins raise to make every useSession re-fetch
function refreshAuthSession(): void {
	authClient.$store.notify("$sessionSignal")
}

/**
 * Which image this user uses, and the two ways to change it. The session is the one copy every page reads.
 * An update refreshes it instead of each page keeping its own state.
 */
export function useAvatar(): AvatarSetting {
	const { data: session } = authClient.useSession()
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

	// send an uploaded file, returning the rejection if there is one and refreshing the session if not
	async function uploadPhoto(file: File): Promise<string | null> {
		const rejection = await uploadAvatar(file)
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
	}
}

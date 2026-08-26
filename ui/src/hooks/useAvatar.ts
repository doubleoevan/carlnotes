// the avatar setting, read from the session and updated through it
import { authClient } from "@/clients/authClient"
import { sendAvatarSource, uploadAvatar } from "@/clients/profileClient"
import { refreshAvatars } from "@/hooks/useAvatarVersion"

// the current image, whether there is a provider photo to offer, and the two ways to change it
type AvatarSetting = {
	avatarSource: string
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
			// the session and every drawn avatar re-read after the change lands
			await sendAvatarSource(nextSource)
			refreshAuthSession()
			refreshAvatars()
		} catch (error) {
			console.error("avatar source change failed", error)
		}
	}

	// send an uploaded file, answering with the rejection if there is one and refreshing when there is not
	async function uploadPhoto(file: File): Promise<string | null> {
		const rejection = await uploadAvatar(file)
		if (!rejection) {
			refreshAuthSession()
			refreshAvatars()
		}
		return rejection
	}

	return {
		avatarSource: session?.user.avatarSource ?? "generated",
		hasProviderPhoto: Boolean(providerImageUrl),
		setAvatarSource,
		uploadAvatarFile: uploadPhoto,
	}
}

import { authClient } from "@carlnotes/client/authClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import { useState } from "react"

// the audience a profile page shows to, and the select's change of it, which only an admin on someone else's profile
// has
type ProfileAudienceState = {
	audience: ProfileAudience
	changeAudience?: (audience: ProfileAudience) => void
}

/**
 * Holds the audience a profile page shows to, which starts at the user audience on every profile. An admin on someone
 * else's profile switches it to the visitor audience and back, and the page reads the profile again for the chosen
 * audience.
 */
export function useProfileAudience({
	profileUserId,
	isOwnProfile,
	onAudienceChange,
}: {
	profileUserId: string
	isOwnProfile: boolean
	// what the page does once the audience changes, besides showing it
	onAudienceChange?: (audience: ProfileAudience) => void
}): ProfileAudienceState {
	const { data: session } = authClient().useSession()
	const [audience, setAudience] = useState<ProfileAudience>("user")

	// another profile starts again at the user audience
	const [audienceUserId, setAudienceUserId] = useState(profileUserId)
	if (profileUserId !== audienceUserId) {
		setAudienceUserId(profileUserId)
		setAudience("user")
	}

	// the select is an admin's on someone else's profile alone
	if (!isAdminRole(session?.user.role) || isOwnProfile) {
		return { audience: "user" }
	}
	return {
		audience,
		changeAudience: (changedAudience) => {
			setAudience(changedAudience)
			onAudienceChange?.(changedAudience)
		},
	}
}

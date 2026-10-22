import { authClient } from "@carlnotes/client/authClient"
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import { Avatar } from "@/components/branding/Avatar"

/**
 * A user's avatar: their stored image, or their initials on a tinted circle.
 * The image url names the avatar's version, so a changed avatar is a new url.
 */
export function UserAvatar({
	userId,
	username,
	avatarVersion,
	className,
}: {
	userId: string
	username: string
	// the version that the avatar url names, or null for the initials
	avatarVersion: string | null
	className?: string
}) {
	// draw the signed-in user's own avatar at the session's version, which an upload or a source change refreshes
	const { data: session } = authClient.useSession()
	const shownAvatarVersion = session?.user.id === userId ? toAvatarVersion(session.user) : avatarVersion

	// the image url at the avatar's version
	const imageUrl = shownAvatarVersion === null ? null : `/api/avatars/${userId}?v=${shownAvatarVersion}`
	return <Avatar imageUrl={imageUrl} ownerId={userId} name={username} className={className} />
}

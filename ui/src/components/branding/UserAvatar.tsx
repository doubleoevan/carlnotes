import { AVATAR_COLOR, toAvatarInitials, toAvatarTint, toAvatarVersion } from "@shared/avatars"
import { useState } from "react"
import { authClient } from "@/clients/authClient"
import { AVATAR_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

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

	// the image url at the avatar's version, and the url that failed to load, which shows the initials instead
	const imageUrl = shownAvatarVersion === null ? null : `/api/avatars/${userId}?v=${shownAvatarVersion}`
	const [brokenImageUrl, setBrokenImageUrl] = useState<string | null>(null)
	return (
		<span className={cn(AVATAR_CLASS, "size-8", className)}>
			{imageUrl && imageUrl !== brokenImageUrl ? (
				<img src={imageUrl} alt="" onError={() => setBrokenImageUrl(imageUrl)} className="size-full object-cover" />
			) : (
				<AvatarInitials userId={userId} username={username} />
			)}
		</span>
	)
}

// the initials on a tinted circle, drawn from the same id and name everywhere
function AvatarInitials({ userId, username }: { userId: string; username: string }) {
	return (
		<svg viewBox="0 0 32 32" className="size-full" role="presentation">
			<circle cx="16" cy="16" r="16" fill={toAvatarTint(userId)} />
			<text
				x="16"
				y="16"
				fill={AVATAR_COLOR}
				fontSize="13"
				textAnchor="middle"
				dominantBaseline="central"
				className="font-display"
			>
				{toAvatarInitials(username)}
			</text>
		</svg>
	)
}

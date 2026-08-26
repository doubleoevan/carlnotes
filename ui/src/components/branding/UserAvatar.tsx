import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import { useState } from "react"
import { useAvatarVersion } from "@/hooks/useAvatarVersion"
import { AVATAR_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * A user's avatar: their stored image, or their initials on a tinted circle.
 * The avatar route resolves which image the user publishes, so the img only asks by id.
 */
export function UserAvatar({
	userId,
	username,
	avatarSource,
	className,
}: {
	userId: string
	username: string
	// where the image comes from. anything but "generated" means the avatar route serves one
	avatarSource?: string | null
	className?: string
}) {
	// the version changes when an upload arrives, which is what re-fetches an image the url already named
	const avatarVersion = useAvatarVersion()
	const [isImageBroken, setImageBroken] = useState(false)
	const hasAvatar = Boolean(avatarSource) && avatarSource !== "generated" && !isImageBroken
	return (
		<span className={cn(AVATAR_CLASS, "size-8", className)}>
			{hasAvatar ? (
				<img
					src={`/api/avatars/${userId}?v=${avatarVersion}`}
					alt=""
					onError={() => setImageBroken(true)}
					className="size-full object-cover"
				/>
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

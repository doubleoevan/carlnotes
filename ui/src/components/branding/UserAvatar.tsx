import { AVATAR_INK, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import { cn } from "@/lib/utils"

const AVATAR_CLASS =
	"inline-block shrink-0 overflow-hidden rounded-full border shadow-lift outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"

/**
 * A user's avatar: their stored image, or their initials on a tinted circle.
 */
export function UserAvatar({
	userId,
	username,
	avatarSource,
	className,
}: {
	userId: string
	username: string
	// where the image comes from. anything but "generated" is served by the avatar route
	avatarSource?: string | null
	className?: string
}) {
	return (
		<span className={cn(AVATAR_CLASS, "size-8", className)}>
			{toAvatarImage(userId, toAvatarInitials(username), avatarSource)}
		</span>
	)
}

// the stored image when there is one, otherwise the initials on a tinted circle
function toAvatarImage(userId: string, initials: string, avatarSource?: string | null) {
	// the source is in the url, so switching between an upload and a provider photo asks for the other source type
	if (avatarSource && avatarSource !== "generated") {
		return <img src={`/api/avatars/${userId}?source=${avatarSource}`} alt="" className="size-full object-cover" />
	}
	const avatarTint = toAvatarTint(userId)
	return (
		<svg viewBox="0 0 32 32" className="size-full" role="presentation">
			<circle cx="16" cy="16" r="16" fill={avatarTint} />
			<text
				x="16"
				y="16"
				fill={AVATAR_INK}
				fontSize="13"
				textAnchor="middle"
				dominantBaseline="central"
				className="font-display"
			>
				{initials}
			</text>
		</svg>
	)
}

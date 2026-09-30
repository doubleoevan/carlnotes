import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import type { TeamIdentity } from "@shared/contracts"
import { useState } from "react"
import { AVATAR_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * A Team's avatar: its stored image, or its initials on a tinted circle.
 * The image url names the avatar's version, so a new upload is a new url.
 */
export function TeamAvatar({
	team,
	className,
}: {
	team: Pick<TeamIdentity, "teamId" | "name" | "avatarVersion">
	className?: string
}) {
	// the image url at the avatar's version, and the url that failed to load, which shows the initials instead
	const imageUrl = team.avatarVersion === null ? null : `/api/team-avatars/${team.teamId}?v=${team.avatarVersion}`
	const [brokenImageUrl, setBrokenImageUrl] = useState<string | null>(null)
	return (
		<span className={cn(AVATAR_CLASS, "size-8", className)}>
			{imageUrl && imageUrl !== brokenImageUrl ? (
				<img src={imageUrl} alt="" onError={() => setBrokenImageUrl(imageUrl)} className="size-full object-cover" />
			) : (
				<svg viewBox="0 0 32 32" className="size-full" role="presentation">
					<circle cx="16" cy="16" r="16" fill={toAvatarTint(team.teamId)} />
					<text
						x="16"
						y="16"
						fill={AVATAR_COLOR}
						fontSize="13"
						textAnchor="middle"
						dominantBaseline="central"
						className="font-display"
					>
						{toAvatarInitials(team.name)}
					</text>
				</svg>
			)}
		</span>
	)
}

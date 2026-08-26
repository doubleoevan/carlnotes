import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import type { TeamIdentity } from "@shared/contracts"
import { useState } from "react"
import { useAvatarVersion } from "@/hooks/useAvatarVersion"
import { AVATAR_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * A Team's avatar: its stored image, or its initials on a tinted circle.
 * The avatar route resolves which image the user publishes, so the img only asks by id.
 */
export function TeamAvatar({
	team,
	className,
}: {
	team: Pick<TeamIdentity, "teamId" | "name" | "hasAvatar">
	className?: string
}) {
	// the version changes when an upload arrives, which is what re-fetches an image the url already named
	const avatarVersion = useAvatarVersion()
	// an image the browser could not fetch falls back to the initials
	const [isImageBroken, setImageBroken] = useState(false)
	const isImageShown = team.hasAvatar && !isImageBroken
	return (
		<span className={cn(AVATAR_CLASS, "size-8", className)}>
			{isImageShown ? (
				<img
					src={`/api/team-avatars/${team.teamId}?v=${avatarVersion}`}
					alt=""
					onError={() => setImageBroken(true)}
					className="size-full object-cover"
				/>
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

import type { TeamIdentity } from "@carlnotes/contracts/teams"
import { Avatar } from "@/components/branding/Avatar"

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
	// the image url at the avatar's version
	const imageUrl = team.avatarVersion === null ? null : `/api/team-avatars/${team.teamId}?v=${team.avatarVersion}`
	return <Avatar imageUrl={imageUrl} ownerId={team.teamId} name={team.name} className={className} />
}

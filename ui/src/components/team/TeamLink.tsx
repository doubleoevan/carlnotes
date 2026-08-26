import type { TeamIdentity } from "@shared/contracts"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { cn } from "@/lib/utils"

/**
 * The team's avatar and name, linking to its page: a byline under its default label.
 */
export function TeamLink({
	team,
	label = "Brewed by",
	className,
	avatarClassName = "size-6",
}: {
	team: TeamIdentity
	label?: string
	className?: string
	avatarClassName?: string
}) {
	return (
		<AnchorLink
			href={`/teams/${team.teamId}`}
			className={cn("inline-flex items-center gap-2 hover:underline", className)}
		>
			<TeamAvatar team={team} className={avatarClassName} />
			{label ? (
				<span className="text-muted-foreground">
					{label} <span className="text-link">{team.name}</span>
				</span>
			) : (
				<span className="text-link">{team.name}</span>
			)}
		</AnchorLink>
	)
}

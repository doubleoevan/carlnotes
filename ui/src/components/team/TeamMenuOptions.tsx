// the options that the team menus share. a team, a team with an action, and New team
import type { TeamSummary } from "@shared/contracts"
import { Plus } from "lucide-react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * One team option in a team menu, with the team's avatar and name.
 */
export function TeamOption({
	team,
	onSelect,
}: {
	team: { teamId: string; name: string; avatarVersion: string | null }
	onSelect: () => void
}) {
	return (
		<button type="button" onClick={onSelect} className={MENU_OPTION_CLASS}>
			<TeamAvatar team={team} className="size-5" />
			<span className="truncate">{team.name}</span>
		</button>
	)
}

/**
 * One clickable team option, with its action's icon at its end.
 */
export function TeamActionOption({
	team,
	actionLabel,
	Icon,
	onSelect,
}: {
	team: TeamSummary
	// what the option does, read in its tooltip and its accessible name
	actionLabel: string
	Icon: typeof Plus
	onSelect: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onSelect}
					aria-label={`${actionLabel} ${team.name}`}
					className={MENU_OPTION_CLASS}
				>
					<TeamAvatar team={team} className="size-5" />
					<span className="min-w-0 flex-1 truncate">{team.name}</span>
					<Icon className="text-muted-foreground size-4 shrink-0" />
				</button>
			</TooltipTrigger>
			<TooltipContent>
				{actionLabel} <span className="font-semibold">{team.name}</span>
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * The highlighted New team option that every team menu ends with.
 */
export function NewTeamOption({ onCreate }: { onCreate: () => void }) {
	return (
		<button type="button" onClick={onCreate} className={cn(MENU_OPTION_CLASS, "text-link")}>
			<Plus className="size-4 shrink-0" />
			New team
		</button>
	)
}

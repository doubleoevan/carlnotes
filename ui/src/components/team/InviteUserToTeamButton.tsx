// the button on another user's profile whose menu invites the profile user to one of the user's teams,
// removes the profile user from a team, or deletes a pending invitation
import type { ProfileTeamStatus } from "@shared/contracts"
import { Users, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { sendDeleteTeamInvite, sendRemoveTeamMember } from "@/clients/teamClient"
import { sendUserInvite } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { NewTeamOption, TeamOption } from "@/components/team/TeamMenuOptions"
import { MENU_DIVIDER_CLASS, MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The button on another user's profile whose menu offers each of the user's teams, with the action its status allows.
 */
export function InviteUserToTeamButton({
	profileUserId,
	profileUsername,
	profileTeamStatuses,
	onReloadProfileTeamStatuses,
	onNewTeam,
}: {
	profileUserId: string
	profileUsername: string
	profileTeamStatuses: ProfileTeamStatus[] | null
	onReloadProfileTeamStatuses: () => void
	onNewTeam: () => void
}) {
	const [isMenuOpen, setIsMenuOpen] = useState(false)

	// reload the team statuses when the menu opens
	const handleOpenChange = (isOpening: boolean): void => {
		setIsMenuOpen(isOpening)
		if (isOpening) {
			onReloadProfileTeamStatuses()
		}
	}

	// fill the icon if one of the user's teams has the profile user or their pending invite
	const isInviteUserToTeamIconFilled = (profileTeamStatuses ?? []).some(
		(profileTeamStatus) => profileTeamStatus.status !== "none",
	)

	// invite the profile user to the team by username
	const handleInviteProfileUser = async (profileTeamStatus: ProfileTeamStatus): Promise<void> => {
		const rejection = await sendUserInvite({ teamId: profileTeamStatus.teamId }, { username: profileUsername })
		if (rejection) {
			toast.error(`The invitation to @${profileUsername} didn't go through.`)
		} else {
			toast(`Invited @${profileUsername} to ${profileTeamStatus.name}.`)
		}
		onReloadProfileTeamStatuses()
	}

	// remove the profile user from the team. the api keeps a team's last leader
	const handleRemoveTeamMember = async (profileTeamStatus: ProfileTeamStatus): Promise<void> => {
		if (await sendRemoveTeamMember(profileTeamStatus.teamId, profileUserId)) {
			toast(`Removed @${profileUsername} from ${profileTeamStatus.name}.`)
		} else {
			toast.error("A team must have at least one leader.")
		}
		onReloadProfileTeamStatuses()
	}

	// delete the pending team invitation
	const handleDeleteTeamInvite = async (profileTeamStatus: ProfileTeamStatus): Promise<void> => {
		if (profileTeamStatus.inviteId) {
			await sendDeleteTeamInvite(profileTeamStatus.teamId, profileTeamStatus.inviteId)
			toast("Team invitation removed.")
		}
		onReloadProfileTeamStatuses()
	}

	return (
		<Popover open={isMenuOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button className="shrink-0">
					<Users className={cn("size-4", isInviteUserToTeamIconFilled && "fill-current")} />
					Team Up
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64" bodyClassName="p-1">
				{/* the user's teams, each option shaped by the profile user's status there */}
				{profileTeamStatuses === null && <CoffeeLoading className="min-h-0 justify-start px-2 py-2 text-sm" />}
				{(profileTeamStatuses ?? []).map((profileTeamStatus) =>
					profileTeamStatus.status === "none" ? (
						<TeamOption
							key={profileTeamStatus.teamId}
							team={profileTeamStatus}
							onSelect={() => void handleInviteProfileUser(profileTeamStatus)}
						/>
					) : (
						<div key={profileTeamStatus.teamId} className="flex items-center">
							<span className={cn(MENU_OPTION_CLASS, "hover:bg-transparent min-w-0 flex-1")}>
								<TeamAvatar team={profileTeamStatus} className="size-5" />
								<span className="truncate">{profileTeamStatus.name}</span>
							</span>
							{profileTeamStatus.status === "member" ? (
								<TeamOptionRemoveAction
									canRemove={profileTeamStatus.role === "leader"}
									label={`Remove ${profileUsername} from ${profileTeamStatus.name}`}
									tooltip={
										<>
											{profileTeamStatus.role === "leader" ? "Remove " : "Must be a leader to remove "}
											<span className="font-semibold">{profileUsername}</span>
											{" from "}
											<span className="font-semibold">{profileTeamStatus.name}</span>
										</>
									}
									onRemove={() => void handleRemoveTeamMember(profileTeamStatus)}
								/>
							) : (
								<TeamOptionRemoveAction
									canRemove={profileTeamStatus.canDeleteInvite}
									label={`Delete invitation to ${profileTeamStatus.name}`}
									tooltip={
										profileTeamStatus.canDeleteInvite ? (
											<>
												Delete invitation to <span className="font-semibold">{profileTeamStatus.name}</span>
											</>
										) : (
											"Must be a leader to delete another member's invitation"
										)
									}
									onRemove={() => void handleDeleteTeamInvite(profileTeamStatus)}
								/>
							)}
						</div>
					),
				)}
				{/* the New team option, under a divider if teams are listed */}
				{profileTeamStatuses !== null && profileTeamStatuses.length > 0 && <div className={MENU_DIVIDER_CLASS} />}
				{profileTeamStatuses !== null && (
					<NewTeamOption
						onCreate={() => {
							setIsMenuOpen(false)
							onNewTeam()
						}}
					/>
				)}
			</PopoverContent>
		</Popover>
	)
}

// the X at the end of a team option, with its tooltip. a user who may not take the action gets a muted X on a span.
// a disabled button swallows the tooltip's hover
function TeamOptionRemoveAction({
	canRemove,
	label,
	tooltip,
	onRemove,
}: {
	canRemove: boolean
	label: string
	tooltip: ReactNode
	onRemove: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{canRemove ? (
					<button
						type="button"
						onClick={onRemove}
						aria-label={label}
						className="text-muted-foreground hover:text-foreground rounded-md p-2"
					>
						<X className="size-4" />
					</button>
				) : (
					<span className="rounded-md p-2">
						<X className="text-muted-foreground size-4 opacity-50" />
					</span>
				)}
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

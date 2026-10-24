import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import { type ProfileIdentity, toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import type { TeamSummary, TeamsPageResponse } from "@carlnotes/contracts/teams"
import { toCentsLabel } from "@carlnotes/core/lib/labels"
import { X } from "lucide-react"
import { toast } from "sonner"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { SubtableCountButton } from "./SubtableCountButton"
import { TeamSubtablesRow, useTeamSubtables } from "./TeamSubtablesRow"

// one invitation waiting for the user's answer, as the teams page payload sends it
export type ReceivedInvite = TeamsPageResponse["receivedInvites"][number]

/**
 * One membership row of the teams table, with its topics and members subtables.
 */
export function TeamMembershipRow({
	team,
	isReadOnly,
	onLeave,
	onDelete,
}: {
	team: TeamSummary
	// someone else's profile shows the team alone, with none of the user's own membership cells
	isReadOnly: boolean
	onLeave: () => void
	onDelete: () => void
}) {
	// the row's subtable state
	const { openSubtable, teamPage, handleSubtableClick, handleSubtableChanged } = useTeamSubtables(team.teamId)

	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">
					{/* the team's avatar and name link to its page, with the team chat room's mention badge on top */}
					<span className="relative inline-block">
						<AnchorLink href={`/teams/${team.teamId}`} className={cn(STANDALONE_LINK_CLASS, "flex items-center gap-2")}>
							<TeamAvatar team={team} className="size-6" />
							{team.name}
						</AnchorLink>
						<PageUpdateCountBadge topicId={null} teamId={team.teamId} href={`/teams/${team.teamId}`} />
					</span>
				</td>
				<td className="text-muted-foreground max-w-40 py-2 pr-4 sm:max-w-64">
					{/* the cell truncates, and the tooltip shows the description in full */}
					{team.description ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="block truncate">{team.description}</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-72">{team.description}</TooltipContent>
						</Tooltip>
					) : (
						"None"
					)}
				</td>
				<td className="py-2 pr-4">{team.isPublic ? "public" : "private"}</td>
				<td className="py-2 pr-4">{team.role}</td>
				{!isReadOnly && <InvitedByCell invitedBy={team.invitedBy} />}
				{/* the counts open this team's members and topics under the row */}
				<td className="py-2 pr-4">
					<SubtableCountButton
						count={team.memberCount}
						isOpen={openSubtable === "members"}
						ariaLabel={`Show ${team.name}'s members`}
						onClick={() => void handleSubtableClick("members")}
					/>
				</td>
				<td className="py-2 pr-4">
					<SubtableCountButton
						count={teamPage?.topics.length ?? team.topicCount}
						isOpen={openSubtable === "topics"}
						ariaLabel={`Show ${team.name}'s topics`}
						onClick={() => void handleSubtableClick("topics")}
					/>
				</td>
				{!isReadOnly && (
					<>
						<td className="py-2 pr-4">{toCentsLabel(team.scanSpendCents)}</td>
						<td className="py-2 pr-4">{toCentsLabel(team.chatSpendCents)}</td>
						<td className="py-2 pr-4">
							{/* switching a membership off leaves the team. the only leader has nobody to hand it to,
						    so their toggle opens the members to assign a new leader instead */}
							<Tooltip>
								{/* the trigger wraps the switch in a span. both write data-state to the same element otherwise */}
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<Switch
											checked
											className={team.isOnlyLeader ? "opacity-50" : undefined}
											onCheckedChange={team.isOnlyLeader ? () => void handleSubtableClick("members") : onLeave}
											aria-label={team.isOnlyLeader ? "Assign a new leader to leave" : `Leave ${team.name}`}
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent>
									{team.isOnlyLeader ? (
										"Assign a new leader to leave"
									) : (
										<>
											Leave <span className="font-semibold">{team.name}</span>
										</>
									)}
								</TooltipContent>
							</Tooltip>
						</td>
						<td className="py-2 text-right">
							{/* deleting the whole team is a leader's power, and it returns every topic to its creator */}
							{isLeaderRole(team.role) && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${team.name}`}>
											<X className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										Delete <span className="font-semibold">{team.name}</span>
									</TooltipContent>
								</Tooltip>
							)}
						</td>
					</>
				)}
			</tr>
			{/* whichever subtable is open */}
			{openSubtable && (
				<TeamSubtablesRow
					teamId={team.teamId}
					teamRole={team.role}
					isReadOnly={isReadOnly}
					openSubtable={openSubtable}
					teamPage={teamPage}
					columnCount={isReadOnly ? 6 : 11}
					onChanged={() => void handleSubtableChanged()}
				/>
			)}
		</>
	)
}

// the Invited by cell: who invited the user, or their own profile when they joined on their own
function InvitedByCell({ invitedBy }: { invitedBy: ProfileIdentity | null }) {
	const { data: session } = authClient().useSession()
	const invitedByProfile = invitedBy ?? (session ? toSessionProfileIdentity(session.user) : null)
	return (
		<td className="py-2 pr-4 whitespace-nowrap">
			{invitedByProfile && <UserProfileLink user={invitedByProfile} avatarClassName="size-5" isNewTab />}
		</td>
	)
}

/**
 * One invitation row of the teams table, inactive until answered. Its switch joins the team.
 */
export function TeamInviteRow({ invite, onAnswered }: { invite: ReceivedInvite; onAnswered: () => void }) {
	// the row's subtable state
	const { openSubtable, teamPage, handleSubtableClick, handleSubtableChanged } = useTeamSubtables(invite.teamId)

	// either answer reloads the page, where an accepted invitation renders as the membership it became
	const handleAccept = async (): Promise<void> => {
		try {
			await sendAcceptInvite(invite.inviteId)
			toast(`Joined ${invite.name}.`)
			onAnswered()
		} catch (error) {
			console.error("invite accept failed", error)
			toast.error("Accepting that invitation failed.")
		}
	}
	const handleDecline = async (): Promise<void> => {
		try {
			await sendDeclineInvite(invite.inviteId)
			toast("Invitation deleted.")
			onAnswered()
		} catch (error) {
			console.error("invite decline failed", error)
			toast.error("Declining that invitation failed.")
		}
	}

	// the team's avatar and name link only where the page would open for the user
	const teamLabel = (
		<>
			<TeamAvatar team={invite} className="size-6" />
			{invite.name}
		</>
	)
	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">
					{invite.isPublic ? (
						<AnchorLink
							href={`/teams/${invite.teamId}`}
							className={cn(STANDALONE_LINK_CLASS, "flex items-center gap-2")}
						>
							{teamLabel}
						</AnchorLink>
					) : (
						<span className="flex items-center gap-2">{teamLabel}</span>
					)}
				</td>
				<td className="text-muted-foreground max-w-40 py-2 pr-4 sm:max-w-64">
					{/* the cell truncates, and the tooltip shows the description in full */}
					{invite.description ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="block truncate">{invite.description}</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-72">{invite.description}</TooltipContent>
						</Tooltip>
					) : (
						"None"
					)}
				</td>
				<td className="py-2 pr-4">{invite.isPublic ? "public" : "private"}</td>
				<td className="text-muted-foreground py-2 pr-4">invited</td>
				{/* the sender's profile, or a plain dash when their account has closed */}
				<td className="py-2 pr-4 whitespace-nowrap">
					{invite.sender ? (
						<UserProfileLink user={invite.sender} avatarClassName="size-5" isNewTab />
					) : (
						<span className="text-muted-foreground">—</span>
					)}
				</td>
				{/* the counts open the team's members and topics under the row, so an invitee can look before answering */}
				<td className="py-2 pr-4">
					<SubtableCountButton
						count={invite.memberCount}
						isOpen={openSubtable === "members"}
						ariaLabel={`Show ${invite.name}'s members`}
						onClick={() => void handleSubtableClick("members")}
					/>
				</td>
				<td className="py-2 pr-4">
					<SubtableCountButton
						count={invite.topicCount}
						isOpen={openSubtable === "topics"}
						ariaLabel={`Show ${invite.name}'s topics`}
						onClick={() => void handleSubtableClick("topics")}
					/>
				</td>
				<td className="py-2 pr-4">{toCentsLabel(invite.scanSpendCents)}</td>
				<td className="py-2 pr-4">{toCentsLabel(invite.chatSpendCents)}</td>
				<td className="py-2 pr-4">
					<Tooltip>
						{/* the trigger wraps the switch in a span. both write data-state to the same element otherwise */}
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<Switch
									checked={false}
									onCheckedChange={() => void handleAccept()}
									aria-label={`Join ${invite.name}`}
								/>
							</span>
						</TooltipTrigger>
						<TooltipContent>
							Join <span className="font-semibold">{invite.name}</span>
						</TooltipContent>
					</Tooltip>
				</td>
				{/* the X declines it quietly */}
				<td className="py-2 text-right">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={() => void handleDecline()}
								aria-label={`Delete invitation to ${invite.name}`}
							>
								<X className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							Delete invitation to <span className="font-semibold">{invite.name}</span>
						</TooltipContent>
					</Tooltip>
				</td>
			</tr>
			{/* whichever subtable is open, read-only for an invitee, who has no role yet */}
			{openSubtable && (
				<TeamSubtablesRow
					teamId={invite.teamId}
					teamRole={null}
					openSubtable={openSubtable}
					teamPage={teamPage}
					columnCount={11}
					onChanged={() => void handleSubtableChanged()}
				/>
			)}
		</>
	)
}

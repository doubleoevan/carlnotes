import type { ProfileIdentity, TeamPageResponse, TeamSummary, TeamsPageResponse } from "@shared/contracts"
import { X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendAcceptInvite, sendDeclineInvite } from "@/clients/activityClient"
import { authClient } from "@/clients/authClient"
import { fetchTeamPage, sendRemoveTopicFromTeam } from "@/clients/teamClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { SubtableCountButton } from "@/components/table/SubtableCountButton"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { toCentsLabel, toCountLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS, THIN_SCROLLBAR_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// one invitation waiting for the user's answer, as the teams page payload sends it
type ReceivedInvite = TeamsPageResponse["receivedInvites"][number]

// one row of the merged table: a membership, or an invitation rendered inactive until accepted
type TeamsPageRow = { membership: TeamSummary } | { invite: ReceivedInvite }

// the sort accessors cover both row kinds
const teamSortValues = {
	team: (row: TeamsPageRow) => ("membership" in row ? row.membership.name : row.invite.name),
	visibility: (row: TeamsPageRow) => String("membership" in row ? row.membership.isPublic : row.invite.isPublic),
	role: (row: TeamsPageRow) => ("membership" in row ? row.membership.role : "invited"),
	invitedBy: (row: TeamsPageRow) =>
		"membership" in row ? (row.membership.invitedBy?.username ?? null) : (row.invite.sender?.username ?? null),
	members: (row: TeamsPageRow) => ("membership" in row ? row.membership.memberCount : row.invite.memberCount),
	topics: (row: TeamsPageRow) => ("membership" in row ? row.membership.topicCount : row.invite.topicCount),
	scans: (row: TeamsPageRow) => ("membership" in row ? row.membership.scanSpendCents : row.invite.scanSpendCents),
	chat: (row: TeamsPageRow) => ("membership" in row ? row.membership.chatSpendCents : row.invite.chatSpendCents),
}

/**
 * The teams the user belongs to plus the invitations waiting for their answer, one table: an
 * invitation is an inactive row whose switch accepts it and whose X declines it, and the only
 * place to leave a team.
 */
export function TeamsMembershipTable({
	teams,
	receivedInvites,
	onLeave,
	onDelete,
	onAnswered,
	isReadOnly = false,
}: {
	teams: TeamSummary[]
	receivedInvites: ReceivedInvite[]
	onLeave: (team: TeamSummary) => void
	onDelete: (team: TeamSummary) => void
	// an accepted or declined invitation reloads the page, where an accepted invitation became a membership
	onAnswered: () => void
	// someone else's profile shows the teams alone: no Invited by, spend, or membership controls
	isReadOnly?: boolean
}) {
	// memberships and invitations sort together as one set of rows
	const rows: TeamsPageRow[] = [
		...teams.map((team) => ({ membership: team })),
		...receivedInvites.map((invite) => ({ invite })),
	]
	// sort feeds pagination, so a sorted column reorders across every page
	const { pageRows, sort, pagination } = usePaginatedRowSort(rows, teamSortValues, {
		key: "team",
		isDescending: false,
	})
	return (
		<TableCard className="mb-4">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-3xl")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="team" label="Team" className="py-2 pr-4" />
							<th className="py-2 pr-4 font-normal">Description</th>
							<SortableHeader sort={sort} sortKey="visibility" label="Visibility" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="role" label="Role" className="py-2 pr-4" />
							{!isReadOnly && (
								<SortableHeader sort={sort} sortKey="invitedBy" label="Invited by" className="py-2 pr-4" />
							)}
							<SortableHeader sort={sort} sortKey="members" label="Members" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="topics" label="Topics" className="py-2 pr-4" />
							{!isReadOnly && (
								<>
									<SortableHeader
										sort={sort}
										sortKey="scans"
										label="Scans"
										tooltip="Month-to-date scan spend across the team's topics"
										className="py-2 pr-4"
									/>
									<SortableHeader
										sort={sort}
										sortKey="chat"
										label="Chat"
										tooltip="Month-to-date chat spend across the team's topics"
										className="py-2 pr-4"
									/>
									<th className="py-2 pr-4 font-normal">
										<Tooltip>
											<TooltipTrigger asChild>
												<span>Active</span>
											</TooltipTrigger>
											<TooltipContent>Your active teams</TooltipContent>
										</Tooltip>
									</th>
									<th className="py-2" />
								</>
							)}
						</tr>
					</thead>
					<tbody>
						{pageRows.map((pageRow) =>
							"membership" in pageRow ? (
								<TeamMembershipRow
									key={pageRow.membership.teamId}
									team={pageRow.membership}
									isReadOnly={isReadOnly}
									onLeave={() => onLeave(pageRow.membership)}
									onDelete={() => onDelete(pageRow.membership)}
								/>
							) : (
								<TeamInviteRow key={pageRow.invite.inviteId} invite={pageRow.invite} onAnswered={onAnswered} />
							),
						)}
					</tbody>
					{/* the totals span every team, not just the visible page. the active total counts the memberships */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4">{toCountLabel(teams.length, "team")}</td>
							<td className="py-2 pr-4">{`${teams.filter((team) => team.isPublic).length}/${teams.length} public`}</td>
							<td className="py-2 pr-4">
								{toCountLabel(teams.filter((team) => team.role === "leader").length, "leader")}
							</td>
							{!isReadOnly && <td className="py-2 pr-4" />}
							<td className="py-2 pr-4">
								{toCountLabel(
									teams.reduce((sum, team) => sum + team.memberCount, 0),
									"member",
								)}
							</td>
							<td className="py-2 pr-4">
								{toCountLabel(
									teams.reduce((sum, team) => sum + team.topicCount, 0),
									"topic",
								)}
							</td>
							{!isReadOnly && (
								<>
									<td className="py-2 pr-4">
										{toCentsLabel(teams.reduce((sum, team) => sum + team.scanSpendCents, 0))}
									</td>
									<td className="py-2 pr-4">
										{toCentsLabel(teams.reduce((sum, team) => sum + team.chatSpendCents, 0))}
									</td>
									<td className="py-2 pr-4">{`${teams.length}/${rows.length} active`}</td>
									<td className="py-2" />
								</>
							)}
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// one membership pageRow
function TeamMembershipRow({
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
	// the pageRow's subtable state
	const { openSubtable, teamPage, handleSubtableClick, handleSubtableChanged } = useTeamSubtables(team.teamId)

	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">
					{/* the team's avatar and name link to its page, with the team room's mention badge on top */}
					<span className="relative inline-block">
						<AnchorLink href={`/teams/${team.teamId}`} className="text-link flex items-center gap-2 hover:underline">
							<TeamAvatar team={team} className="size-6" />
							{team.name}
						</AnchorLink>
						<TopicMentionBadge topicId={null} teamId={team.teamId} href={`/teams/${team.teamId}`} />
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
						"N/A"
					)}
				</td>
				<td className="py-2 pr-4">{team.isPublic ? "public" : "private"}</td>
				<td className="py-2 pr-4">{team.role}</td>
				{!isReadOnly && <InvitedByCell invitedBy={team.invitedBy} />}
				{/* the counts open this team's members and topics under the pageRow */}
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
							{team.role === "leader" && (
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
					isLeader={team.role === "leader"}
					openSubtable={openSubtable}
					teamPage={teamPage}
					columnCount={isReadOnly ? 6 : 11}
					onChanged={() => void handleSubtableChanged()}
				/>
			)}
		</>
	)
}

// one pageRow's subtable state: which is open, and the team page payload that fills it, loaded on the first open
function useTeamSubtables(teamId: string) {
	const [openSubtable, setOpenSubtable] = useState<"topics" | "members" | null>(null)
	const [teamPage, setTeamPage] = useState<TeamPageResponse | null>(null)

	// the team page payload includes both the topics and the members, gated to members and invitees
	async function loadOpenTeamPage(): Promise<void> {
		const loaded = await fetchTeamPage(teamId).catch(() => null)
		if (loaded?.status !== "visible") {
			toast.error("Couldn't load that team.")
			setOpenSubtable(null)
			return
		}
		setTeamPage(loaded.team)
	}
	async function handleSubtableClick(subtable: "topics" | "members"): Promise<void> {
		setOpenSubtable(openSubtable === subtable ? null : subtable)
		if (teamPage === null) {
			await loadOpenTeamPage()
		}
	}

	// a change inside an open subtable refetches the team page right away
	async function handleSubtableChanged(): Promise<void> {
		setTeamPage(null)
		await loadOpenTeamPage()
	}
	return { openSubtable, teamPage, handleSubtableClick, handleSubtableChanged }
}

// whichever subtable is open, in the same tables the team page renders
function TeamSubtablesRow({
	teamId,
	isLeader,
	openSubtable,
	teamPage,
	columnCount,
	onChanged,
}: {
	teamId: string
	isLeader: boolean
	openSubtable: "topics" | "members"
	teamPage: TeamPageResponse | null
	// the pageRow spans the table above it, whose columns depend on the read-only mode
	columnCount: number
	onChanged: () => void
}) {
	return (
		<tr className="border-b">
			<td colSpan={columnCount} className="py-2">
				<div className={cn("bg-sunken overflow-x-auto rounded-lg border px-4 py-2", THIN_SCROLLBAR_CLASS)}>
					{teamPage === null && <CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />}
					{teamPage &&
						openSubtable === "topics" &&
						(teamPage.topics.length === 0 ? (
							<p className="text-muted-foreground py-2 text-sm">No topics on this team yet.</p>
						) : (
							<TopicsTable
								className="bg-sunken mb-0 border-0 p-0 shadow-none"
								topics={teamPage.topics}
								includesNonPublicTopics
								topicTooltip="Topics on this team"
								onRemoveTopic={
									isLeader
										? (topic) => void sendRemoveTopicFromTeam(teamId, topic.id).then(() => onChanged())
										: undefined
								}
							/>
						))}
					{teamPage && openSubtable === "members" && (
						<TeamMembersTable
							teamId={teamId}
							members={teamPage.members}
							hiddenMemberCount={teamPage.hiddenMemberCount}
							isLeader={isLeader}
							onChanged={onChanged}
						/>
					)}
				</div>
			</td>
		</tr>
	)
}

// the Invited by cell: who invited the user, or their own profile when they joined on their own
function InvitedByCell({ invitedBy }: { invitedBy: ProfileIdentity | null }) {
	const { data: session } = authClient.useSession()
	const shown =
		invitedBy ??
		(session
			? {
					userId: session.user.id,
					username: session.user.username ?? "",
					avatarSource: session.user.avatarSource ?? null,
				}
			: null)
	return (
		<td className="py-2 pr-4 whitespace-nowrap">
			{shown && <UserProfileLink user={shown} avatarClassName="size-5" isNewTab />}
		</td>
	)
}

// one invitation pageRow, inactive until answered: the switch joins the team
function TeamInviteRow({ invite, onAnswered }: { invite: ReceivedInvite; onAnswered: () => void }) {
	// the pageRow's subtable state
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
						<AnchorLink href={`/teams/${invite.teamId}`} className="text-link flex items-center gap-2 hover:underline">
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
						"N/A"
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
				{/* the counts open the team's members and topics under the pageRow, so an invitee can look before answering */}
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
			{/* whichever subtable is open, read-only for an invitee */}
			{openSubtable && (
				<TeamSubtablesRow
					teamId={invite.teamId}
					isLeader={false}
					openSubtable={openSubtable}
					teamPage={teamPage}
					columnCount={11}
					onChanged={() => void handleSubtableChanged()}
				/>
			)}
		</>
	)
}

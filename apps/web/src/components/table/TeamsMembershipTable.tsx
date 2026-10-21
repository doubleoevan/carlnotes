import type { TeamSummary } from "@carlnotes/contracts/teams"
import { toCentsLabel, toCountLabel } from "@carlnotes/core/lib/labels"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { type ReceivedInvite, TeamInviteRow, TeamMembershipRow } from "./TeamMembershipRows"

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
		initialSort: { key: "team", isDescending: false },
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

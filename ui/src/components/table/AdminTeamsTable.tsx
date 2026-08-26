import type { AdminTeamRow, OwnerTopic, TeamPageResponse } from "@shared/contracts"
import { useState } from "react"
import { toast } from "sonner"
import { fetchAdminTeamMembers, fetchAdminTeamTopics } from "@/clients/billingClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TopicsSubtableRow } from "@/components/table/OwnerTopicsTable"
import { SortableHeader } from "@/components/table/SortableHeader"
import { SubtableCountButton } from "@/components/table/SubtableCountButton"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { toCentsLabel, toCountLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the sort accessors for the teams table columns
const teamSortValues = {
	team: (team: AdminTeamRow) => team.name,
	visibility: (team: AdminTeamRow) => String(team.isPublic),
	created: (team: AdminTeamRow) => team.createdAt,
	members: (team: AdminTeamRow) => team.memberCount,
	topics: (team: AdminTeamRow) => team.topicCount,
	scans: (team: AdminTeamRow) => team.scanSpendCents,
	chat: (team: AdminTeamRow) => team.chatSpendCents,
}

/**
 * The admin console's teams table, sortable and scrollable like the users table above it.
 * A team holds no litellm key of its own, so its spend is the total of what its topics cost this month
 */
export function AdminTeamsTable({ teams }: { teams: AdminTeamRow[] }) {
	// sort feeds pagination, so a sorted column reorders across every page
	const { pageRows, sort, pagination } = usePaginatedRowSort(teams, teamSortValues)
	return (
		<TableCard>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-3xl [&_tbody_tr:last-child>*]:border-b-0")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="team" label="Team" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="visibility" label="Visibility" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="created" label="Created" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="members" label="Members" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="topics" label="Topics" className="py-2 pr-4" />
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
								className="py-2"
							/>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((team) => (
							<TeamRow key={team.teamId} team={team} />
						))}
					</tbody>
					{/* the totals span every team, not just the visible page */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">{`Total ${toCountLabel(teams.length, "team")}`}</td>
							<td className="py-2 pr-4">{`${teams.filter((team) => team.isPublic).length}/${teams.length} public`}</td>
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4">{teams.reduce((memberCount, team) => memberCount + team.memberCount, 0)}</td>
							<td className="py-2 pr-4">{teams.reduce((topicCount, team) => topicCount + team.topicCount, 0)}</td>
							<td className="py-2 pr-4">
								{toCentsLabel(teams.reduce((scanSpendCents, team) => scanSpendCents + team.scanSpendCents, 0))}
							</td>
							<td className="py-2">
								{toCentsLabel(teams.reduce((chatSpendCents, team) => chatSpendCents + team.chatSpendCents, 0))}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// one team row: the team page link, its members and topics subtables, and what its topics cost this month
function TeamRow({ team }: { team: AdminTeamRow }) {
	// only one subtable shows at a time per row
	const [openSubtable, setOpenSubtable] = useState<"members" | "topics" | null>(null)
	const [teamTopics, setTeamTopics] = useState<OwnerTopic[] | null>(null)
	const [teamMembers, setTeamMembers] = useState<TeamPageResponse["members"] | null>(null)

	// an admin can see any team's members, private teams included
	async function handleTeamMembersClick(): Promise<void> {
		setOpenSubtable(openSubtable === "members" ? null : "members")
		if (teamMembers !== null || team.memberCount === 0) {
			return
		}
		try {
			setTeamMembers(await fetchAdminTeamMembers(team.teamId))
		} catch (error) {
			console.error("admin team members failed", error)
			toast.error("Couldn't load that team's members.")
			setOpenSubtable(null)
		}
	}

	// an admin can see every topic the team holds, whatever its visibility. loaded once and kept for the session
	async function handleTeamTopicsClick(): Promise<void> {
		setOpenSubtable(openSubtable === "topics" ? null : "topics")
		if (teamTopics !== null || team.topicCount === 0) {
			return
		}
		try {
			setTeamTopics(await fetchAdminTeamTopics(team.teamId))
		} catch (error) {
			console.error("admin team topics failed", error)
			toast.error("Couldn't load that team's topics.")
			setOpenSubtable(null)
		}
	}

	return (
		<>
			<tr className="border-b">
				<td className="py-2 pr-4">
					{/* the team's avatar and name, linking to its team page */}
					<AnchorLink href={`/teams/${team.teamId}`} className="text-link flex items-center gap-2 hover:underline">
						<TeamAvatar team={team} className="size-6" />
						{team.name}
					</AnchorLink>
				</td>
				<td className="py-2 pr-4">{team.isPublic ? "public" : "private"}</td>
				<td className="py-2 pr-4">{new Date(team.createdAt).toLocaleDateString()}</td>
				<td className="py-2 pr-4">
					{/* the member count opens this team's members under the row, closing the topics subtable for this row */}
					<SubtableCountButton
						count={team.memberCount}
						isOpen={openSubtable === "members"}
						ariaLabel={`Show ${team.name}'s members`}
						onClick={() => void handleTeamMembersClick()}
					/>
				</td>
				<td className="py-2 pr-4">
					{/* the topic count opens this team's topics under the row, closing the members subtable for this row */}
					<SubtableCountButton
						count={team.topicCount}
						isOpen={openSubtable === "topics"}
						ariaLabel={`Show ${team.name}'s topics`}
						onClick={() => void handleTeamTopicsClick()}
					/>
				</td>
				<td className="py-2 pr-4">{toCentsLabel(team.scanSpendCents)}</td>
				<td className="py-2">{toCentsLabel(team.chatSpendCents)}</td>
			</tr>
			{/* the team's members subtable. read-only mode when viewing as an admin */}
			{openSubtable === "members" && (
				<tr className="border-b">
					<td colSpan={7} className="py-2">
						{teamMembers ? (
							<TableCard className="bg-sunken mb-0 shadow-none">
								<TeamMembersTable
									teamId={team.teamId}
									members={teamMembers}
									hiddenMemberCount={0}
									isLeader={false}
									isReadOnly
									onChanged={() => {}}
								/>
							</TableCard>
						) : (
							<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
						)}
					</td>
				</tr>
			)}
			{/* the team's topics subtable */}
			{openSubtable === "topics" && (
				<TopicsSubtableRow topics={teamTopics} colSpan={7} onReloadPage={() => setTeamTopics(null)} />
			)}
		</>
	)
}

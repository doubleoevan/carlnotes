import type { TeamSummary } from "@carlnotes/contracts/teams"
import { DataTable, type DataTableElements } from "@carlnotes/core/components/DataTable"
import {
	type ReceivedInvite,
	type TeamsPageRow,
	teamSortValues,
	toTeamsMembershipTableColumns,
} from "@carlnotes/core/lib/teamsMembershipTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import type { RowSort } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { TeamInviteRow, TeamMembershipRow } from "./TeamMembershipRows"

// the domain rows retain their controls and subtables. the shared columns define headings and totals
const TEAM_ROW_RENDERERS = {
	renderText: (text: string) => text,
	renderTeam: () => null,
	renderDescription: () => null,
	renderInvitedBy: () => null,
	renderMembers: () => null,
	renderTopics: () => null,
	renderActive: () => null,
	renderRemove: () => null,
}

// preserve the wide web table and its non-sortable Active heading's explanation
const TEAMS_MEMBERSHIP_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children }) => (
		<div className={TABLE_SCROLL_CLASS}>
			<table className={cn(TABLE_CLASS, "min-w-3xl")}>{children}</table>
		</div>
	),
	Header: ({ column, sort }) =>
		column.isSortable === false && column.tooltip ? (
			<th className="py-2 pr-4 font-normal">
				<Tooltip>
					<TooltipTrigger asChild>
						<span>{column.label}</span>
					</TooltipTrigger>
					<TooltipContent>{column.tooltip}</TooltipContent>
				</Tooltip>
			</th>
		) : (
			<DATA_TABLE_ELEMENTS.Header column={column} sort={sort} />
		),
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
	const { pageRows, sort, pagination } = usePaginatedRowSort({
		rows,
		valueByKey: teamSortValues,
		initialSort: { key: "team", isDescending: false },
	})
	const columns = toTeamsMembershipTableColumns({ teams, receivedInvites, isReadOnly, ...TEAM_ROW_RENDERERS })
	return (
		<TableCard className="mb-4">
			<DataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={(row) => ("membership" in row ? row.membership.teamId : row.invite.inviteId)}
				sort={sort}
				elements={TEAMS_MEMBERSHIP_TABLE_ELEMENTS}
				renderRow={(row) =>
					"membership" in row ? (
						<TeamMembershipRow
							team={row.membership}
							isReadOnly={isReadOnly}
							onLeave={() => onLeave(row.membership)}
							onDelete={() => onDelete(row.membership)}
						/>
					) : (
						<TeamInviteRow invite={row.invite} onAnswered={onAnswered} />
					)
				}
			/>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

/**
 * Supplies the same shared headings to standalone row stories.
 */
export function TeamsMembershipTableHead({ sort, isReadOnly }: { sort: RowSort; isReadOnly: boolean }) {
	const columns = toTeamsMembershipTableColumns({ teams: [], receivedInvites: [], isReadOnly, ...TEAM_ROW_RENDERERS })
	return (
		<tr>
			{columns.map((column) => (
				<TEAMS_MEMBERSHIP_TABLE_ELEMENTS.Header key={column.key} column={column} sort={sort} />
			))}
		</tr>
	)
}

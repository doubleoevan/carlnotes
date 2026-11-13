import type { TeamMember } from "@carlnotes/contracts/teams"
import { DataTable, type DataTableElements, type TableColumn } from "@carlnotes/core/components/DataTable"
import {
	TeamMembersTable as SharedTeamMembersTable,
	type TeamMembersTableElements,
} from "@carlnotes/core/components/TeamMembersTable"
import { memberSortValues } from "@carlnotes/core/lib/teamMembersTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { toast } from "sonner"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/tableClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { TooltipRemoveButton } from "./TooltipRemoveButton"
import { TooltipSwitch } from "./TooltipSwitch"
import { UserNameLink } from "./UserLinks"

/**
 * A Team's members: who belongs, the role a leader may change, each member's own member visibility, and the remove button.
 */
export function TeamMembersTable({
	teamId,
	members,
	hiddenMemberCount,
	isTeamLeader,
	isReadOnly = false,
	onChanged,
}: {
	teamId: string
	members: TeamMember[]
	// how many opted out of the public members list, so the totals never read smaller than the team is
	hiddenMemberCount: number
	isTeamLeader: boolean
	// a page that only reads the team, like the admin console, where no row acts as the user's own
	isReadOnly?: boolean
	onChanged: () => void
}) {
	// the confirmation dialog, and the toasts each change shows
	const { confirm, confirmDialog } = useConfirmDialog()
	return (
		<div>
			<SharedTeamMembersTable
				teamId={teamId}
				members={members}
				hiddenMemberCount={hiddenMemberCount}
				isTeamLeader={isTeamLeader}
				isReadOnly={isReadOnly}
				onChanged={onChanged}
				confirm={confirm}
				notify={(text, isError) => (isError ? toast.error(text) : toast(text))}
				elements={TEAM_MEMBERS_TABLE_ELEMENTS}
			/>
			{confirmDialog}
		</div>
	)
}

// the sorted rows, with the page's rows and the first rows a reader without JavaScript gets, and the pagination
function TeamMembersDataTable({ members, columns }: { members: TeamMember[]; columns: TableColumn<TeamMember>[] }) {
	const { renderedRows, sort, pagination } = usePaginatedRowSort({
		rows: members,
		valueByKey: memberSortValues,
		initialSort: { key: "member" },
	})
	return (
		<>
			<DataTable
				columns={columns}
				renderedRows={renderedRows}
				getRowId={(member) => member.userId}
				sort={sort}
				elements={MEMBER_DATA_TABLE_ELEMENTS}
			/>
			<TablePagination {...pagination} />
		</>
	)
}

// the member table's width, with the remove button at the row's right edge
const MEMBER_DATA_TABLE_ELEMENTS: DataTableElements = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children }) => (
		<div className={TABLE_SCROLL_CLASS}>
			<table className={cn(TABLE_CLASS, "min-w-2xl")}>{children}</table>
		</div>
	),
	Cell: ({ children, column }) => <td className={column === "remove" ? "py-2 text-right" : "py-2 pr-4"}>{children}</td>,
}

// the web cells: the profile link, native selects, and the switch and button with their tooltips
const TEAM_MEMBERS_TABLE_ELEMENTS: TeamMembersTableElements = {
	Text: ({ children }) => <span className="text-muted-foreground">{children}</span>,
	MemberLink: ({ member }) => <UserNameLink user={member} />,
	Select: ({ label, value, options, isDisabled, onChange }) => (
		<select
			value={value}
			onChange={(event) => onChange(event.target.value)}
			aria-label={label}
			disabled={isDisabled}
			className="rounded-md border px-1 py-0.5"
		>
			{options.map((option) => (
				<option key={option} value={option}>
					{option}
				</option>
			))}
		</select>
	),
	ActiveSwitch: ({ action, name, isChecked, isDisabled, onChange }) => (
		<TooltipSwitch action={action} name={name} isChecked={isChecked} isDisabled={isDisabled} onChange={onChange} />
	),
	RemoveButton: ({ name, isDisabled, onPress }) => (
		<TooltipRemoveButton
			action="Remove"
			name={name}
			afterName="from the team"
			isDisabled={isDisabled}
			onPress={onPress}
		/>
	),
	Table: TeamMembersDataTable,
}

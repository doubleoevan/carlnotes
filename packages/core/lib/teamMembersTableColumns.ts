import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toCountLabel } from "./labels"

export type TeamMember = TeamPageResponse["members"][number]

// the public and member views sort the same fields
export const memberSortValues = {
	member: (member: TeamMember) => member.username,
	role: (member: TeamMember) => member.role,
	visibility: (member: TeamMember) => String(member.isMemberVisible),
	active: (member: TeamMember) => String(member.isActive),
}

/**
 * Builds the shared member columns and totals without counting pending requests as members.
 */
export function toTeamMembersTableColumns({
	members,
	hiddenMemberCount,
	hasRemovalColumns,
	renderText,
	renderMember,
	renderRole,
	renderVisibility,
	renderActive,
	renderRemove,
}: {
	members: TeamMember[]
	hiddenMemberCount: number
	hasRemovalColumns: boolean
	renderText: (text: string) => ReactNode
	renderMember: (member: TeamMember) => ReactNode
	renderRole: (member: TeamMember) => ReactNode
	renderVisibility: (member: TeamMember) => ReactNode
	renderActive: (member: TeamMember) => ReactNode
	renderRemove: (member: TeamMember) => ReactNode
}): TableColumn<TeamMember>[] {
	// include hidden active members in the total while preserving their privacy
	const activeMembers = members.filter((member) => member.isActive)
	const totalLabel = toCountLabel(activeMembers.length + hiddenMemberCount, "member")
	return [
		{
			key: "member",
			label: "Member",
			width: 192,
			render: renderMember,
			footer: renderText(hasRemovalColumns ? "Total" : `Total ${totalLabel}`),
		},
		{
			key: "role",
			label: "Role",
			width: 128,
			render: renderRole,
			footer: renderText(toCountLabel(activeMembers.filter((member) => isLeaderRole(member.role)).length, "leader")),
		},
		{
			key: "visibility",
			label: "Visibility",
			width: 128,
			render: renderVisibility,
			footer: renderText(
				`${activeMembers.filter((member) => member.isMemberVisible).length}/${activeMembers.length} shown`,
			),
		},
		...(hasRemovalColumns
			? [
					{
						key: "active",
						label: "Active",
						width: 112,
						tooltip: "Active team members",
						render: renderActive,
						footer: renderText(totalLabel),
					},
					{ key: "remove", label: "", width: 56, isSortable: false, render: renderRemove },
				]
			: []),
	]
}

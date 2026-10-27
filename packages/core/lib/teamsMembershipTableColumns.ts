import { CHAT_NAME } from "@carlnotes/contracts/chat"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamSummary, TeamsPageResponse } from "@carlnotes/contracts/teams"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toCentsLabel, toCountLabel } from "./labels"

export type ReceivedInvite = TeamsPageResponse["receivedInvites"][number]
export type TeamsPageRow = { membership: TeamSummary } | { invite: ReceivedInvite }

// both kinds of rows sort in the same table
export const teamSortValues = {
	team: (row: TeamsPageRow) => toTeamRowFields(row).name,
	visibility: (row: TeamsPageRow) => String(toTeamRowFields(row).isPublic),
	role: (row: TeamsPageRow) => ("membership" in row ? row.membership.role : "invited"),
	invitedBy: (row: TeamsPageRow) =>
		("membership" in row ? row.membership.invitedBy?.username : row.invite.sender?.username) ?? null,
	members: (row: TeamsPageRow) => toTeamRowFields(row).memberCount,
	topics: (row: TeamsPageRow) => toTeamRowFields(row).topicCount,
	scans: (row: TeamsPageRow) => toTeamRowFields(row).scanSpendCents,
	chat: (row: TeamsPageRow) => toTeamRowFields(row).chatSpendCents,
}

/**
 * Returns the team identity and summary for either membership row kind.
 */
export function toTeamRowFields(row: TeamsPageRow): TeamSummary | ReceivedInvite {
	return "membership" in row ? row.membership : row.invite
}

/**
 * Builds the shared membership columns with the viewer's permitted controls and totals.
 */
export function toTeamsMembershipTableColumns({
	teams,
	receivedInvites,
	isReadOnly,
	renderText,
	renderTeam,
	renderDescription,
	renderInvitedBy,
	renderMembers,
	renderTopics,
	renderActive,
	renderRemove,
}: {
	teams: TeamSummary[]
	receivedInvites: ReceivedInvite[]
	isReadOnly: boolean
	renderText: (text: string) => ReactNode
	renderTeam: (row: TeamsPageRow) => ReactNode
	renderDescription: (row: TeamsPageRow) => ReactNode
	renderInvitedBy: (row: TeamsPageRow) => ReactNode
	renderMembers: (row: TeamsPageRow) => ReactNode
	renderTopics: (row: TeamsPageRow) => ReactNode
	renderActive: (row: TeamsPageRow) => ReactNode
	renderRemove: (row: TeamsPageRow) => ReactNode
}): TableColumn<TeamsPageRow>[] {
	// totals describe memberships while the active denominator includes invitations
	const memberCount = teams.reduce((total, team) => total + team.memberCount, 0)
	const topicCount = teams.reduce((total, team) => total + team.topicCount, 0)
	const scanSpendCents = teams.reduce((total, team) => total + team.scanSpendCents, 0)
	const chatSpendCents = teams.reduce((total, team) => total + team.chatSpendCents, 0)
	return [
		{ key: "team", label: "Team", width: 192, render: renderTeam, footer: renderText("Total") },
		{
			key: "description",
			label: "Description",
			width: 224,
			isSortable: false,
			render: renderDescription,
			footer: renderText(toCountLabel(teams.length, "team")),
		},
		{
			key: "visibility",
			label: "Visibility",
			width: 112,
			render: (row) => renderText(toTeamRowFields(row).isPublic ? "public" : "private"),
			footer: renderText(`${teams.filter((team) => team.isPublic).length}/${teams.length} public`),
		},
		{
			key: "role",
			label: "Role",
			width: 112,
			render: (row) => renderText("membership" in row ? row.membership.role : "invited"),
			footer: renderText(toCountLabel(teams.filter((team) => isLeaderRole(team.role)).length, "leader")),
		},
		...(!isReadOnly ? [{ key: "invitedBy", label: "Invited by", width: 176, render: renderInvitedBy }] : []),
		{
			key: "members",
			label: "Members",
			width: 112,
			render: renderMembers,
			footer: renderText(toCountLabel(memberCount, "member")),
		},
		{
			key: "topics",
			label: "Topics",
			width: 112,
			render: renderTopics,
			footer: renderText(toCountLabel(topicCount, "topic")),
		},
		...(!isReadOnly
			? [
					{
						key: "scans",
						label: "Brews",
						width: 112,
						tooltip: "Month-to-date brew spend across the team's topics",
						render: (row: TeamsPageRow) => renderText(toCentsLabel(toTeamRowFields(row).scanSpendCents)),
						footer: renderText(toCentsLabel(scanSpendCents)),
					},
					{
						key: "chat",
						label: CHAT_NAME,
						width: 112,
						tooltip: `Month-to-date ${CHAT_NAME} spend across the team's topics`,
						render: (row: TeamsPageRow) => renderText(toCentsLabel(toTeamRowFields(row).chatSpendCents)),
						footer: renderText(toCentsLabel(chatSpendCents)),
					},
					{
						key: "active",
						label: "Active",
						width: 112,
						isSortable: false,
						tooltip: "Your active teams",
						render: renderActive,
						footer: renderText(`${teams.length}/${teams.length + receivedInvites.length} active`),
					},
					{ key: "remove", label: "", width: 56, isSortable: false, render: renderRemove },
				]
			: []),
	]
}

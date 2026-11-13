import { authClient } from "@carlnotes/client/authClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import { type ProfileIdentity, toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import type { TeamSummary } from "@carlnotes/contracts/teams"
import { type ComponentType, type ReactNode, useState } from "react"
import {
	type ReceivedInvite,
	type TeamsPageRow,
	toTeamRowFields,
	toTeamsMembershipTableColumns,
} from "../lib/teamsMembershipTableColumns"
import type { TableColumn } from "./DataTable"

// the detail a team row opens: its members or its topics
export type TeamsMembershipDetail = "members" | "topics"
// a switch's or a button's action, and the team it names, if any. both word the label and the tooltip
type TeamActionProps = { action: string; teamName?: string; isDisabled: boolean }
export type TeamsMembershipTableElements = {
	Text: ComponentType<{ children: string }>
	// the team's avatar and name, linked where its page opens for the user
	TeamLink: ComponentType<{ row: TeamsPageRow }>
	// the team's description, or None
	Description: ComponentType<{ description: string | null }>
	// who invited the user, or a dash
	InvitedBy: ComponentType<{ invitedBy: ProfileIdentity | null }>
	// the member or topic count that opens that detail
	DetailToggle: ComponentType<{ count: number; isOpen: boolean; label: string; onToggle: () => void }>
	ActiveSwitch: ComponentType<TeamActionProps & { isChecked: boolean; isFaded: boolean; onChange: () => void }>
	RemoveButton: ComponentType<TeamActionProps & { onPress: () => void }>
	// an open detail: under the row on the web, in a sheet on a phone
	Detail: ComponentType<{
		row: TeamsPageRow
		detail: TeamsMembershipDetail
		isReadOnly: boolean
		onChanged: () => void
		onClose: () => void
	}>
	// the sorted, paged table, starting sorted by team, which renders each row's open detail
	Table: ComponentType<{
		rows: TeamsPageRow[]
		columns: TableColumn<TeamsPageRow>[]
		renderDetail: (row: TeamsPageRow) => ReactNode
	}>
}

/**
 * Renders the teams the user belongs to and the invites waiting for an answer as one table. An invite is an inactive
 * row whose switch accepts it and whose X declines it, and a membership's switch leaves the team.
 */
export function TeamsMembershipTable({
	teams,
	receivedInvites,
	isReadOnly = false,
	isPending = false,
	onLeave,
	onDelete,
	onAccept,
	onDecline,
	onChanged,
	elements: { Text, TeamLink, Description, InvitedBy, DetailToggle, ActiveSwitch, RemoveButton, Detail, Table },
}: {
	teams: TeamSummary[]
	receivedInvites: ReceivedInvite[]
	// someone else's profile shows the teams alone: no Invited by, spend, or membership controls
	isReadOnly?: boolean
	// true while a membership change saves
	isPending?: boolean
	// the app's leave, delete, and decline, which each confirm before acting, and the accept
	onLeave: (team: TeamSummary) => void
	onDelete: (team: TeamSummary) => void
	onAccept: (invite: ReceivedInvite) => void
	onDecline: (invite: ReceivedInvite) => void
	// a change inside an open detail, which reloads the page so the counts follow it
	onChanged: () => void
	elements: TeamsMembershipTableElements
}) {
	// memberships and invites sort together as one set of rows
	const rows: TeamsPageRow[] = [
		...teams.map((membership) => ({ membership })),
		...receivedInvites.map((invite) => ({ invite })),
	]

	// each team's open detail, kept through sorting and paging
	const [openDetailByTeamId, setOpenDetailByTeamId] = useState<Record<string, TeamsMembershipDetail | undefined>>({})
	function toggleDetail(teamId: string, detail: TeamsMembershipDetail): void {
		setOpenDetailByTeamId((previous) => ({ ...previous, [teamId]: previous[teamId] === detail ? undefined : detail }))
	}
	function openDetail(teamId: string, detail: TeamsMembershipDetail): void {
		setOpenDetailByTeamId((previous) => ({ ...previous, [teamId]: detail }))
	}

	// a user who joined on their own reads themselves as Invited by
	const { data: session } = authClient().useSession()
	const sessionProfile = session ? toSessionProfileIdentity(session.user) : null

	// the member and topic counts, each opening its detail
	function renderDetailToggle(row: TeamsPageRow, detail: TeamsMembershipDetail): ReactNode {
		const team = toTeamRowFields(row)
		return (
			<DetailToggle
				count={detail === "members" ? team.memberCount : team.topicCount}
				isOpen={openDetailByTeamId[team.teamId] === detail}
				label={`Show ${team.name}'s ${detail}`}
				onToggle={() => toggleDetail(team.teamId, detail)}
			/>
		)
	}

	// a membership's switch leaves the team, except that the only leader's opens the members to choose a new leader.
	// an invite's switch joins the team
	function renderActive(row: TeamsPageRow): ReactNode {
		if ("invite" in row) {
			return (
				<ActiveSwitch
					action="Join"
					teamName={row.invite.name}
					isChecked={false}
					isFaded={false}
					isDisabled={isPending}
					onChange={() => onAccept(row.invite)}
				/>
			)
		}
		const team = row.membership
		return (
			<ActiveSwitch
				action={team.isOnlyLeader ? "Assign a new leader to leave" : "Leave"}
				teamName={team.isOnlyLeader ? undefined : team.name}
				isChecked
				isFaded={team.isOnlyLeader}
				isDisabled={isPending}
				onChange={() => (team.isOnlyLeader ? openDetail(team.teamId, "members") : onLeave(team))}
			/>
		)
	}

	// an invite's X declines it, and a leader's X deletes the whole team
	function renderRemove(row: TeamsPageRow): ReactNode {
		if ("invite" in row) {
			return (
				<RemoveButton
					action="Delete invite to"
					teamName={row.invite.name}
					isDisabled={isPending}
					onPress={() => onDecline(row.invite)}
				/>
			)
		}
		return (
			isLeaderRole(row.membership.role) && (
				<RemoveButton
					action="Delete"
					teamName={row.membership.name}
					isDisabled={isPending}
					onPress={() => onDelete(row.membership)}
				/>
			)
		)
	}

	// the shared columns with this platform's cells
	const columns = toTeamsMembershipTableColumns({
		teams,
		receivedInvites,
		isReadOnly,
		renderText: (text) => <Text>{text}</Text>,
		renderTeam: (row) => <TeamLink row={row} />,
		renderDescription: (row) => <Description description={toTeamRowFields(row).description} />,
		renderInvitedBy: (row) => (
			<InvitedBy invitedBy={"membership" in row ? (row.membership.invitedBy ?? sessionProfile) : row.invite.sender} />
		),
		renderMembers: (row) => renderDetailToggle(row, "members"),
		renderTopics: (row) => renderDetailToggle(row, "topics"),
		renderActive,
		renderRemove,
	})
	return (
		<Table
			rows={rows}
			columns={columns}
			renderDetail={(row) => {
				const teamId = toTeamRowFields(row).teamId
				const detail = openDetailByTeamId[teamId]
				return detail ? (
					<Detail
						row={row}
						detail={detail}
						isReadOnly={isReadOnly}
						onChanged={onChanged}
						onClose={() => setOpenDetailByTeamId((previous) => ({ ...previous, [teamId]: undefined }))}
					/>
				) : null
			}}
		/>
	)
}

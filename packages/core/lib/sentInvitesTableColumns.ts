import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toMonthYearLabel } from "./labels"
import type { ConfirmationBody } from "./tableElements"

// topic and team invitations use one row shape and one set of columns
export type SentInviteRow = {
	inviteId: string
	target: ReactNode
	targetName: string
	// who was invited, by account or by email, and when
	invitee: ProfileIdentity | null
	inviteeEmail: string | null
	invitedAt: string
	acceptedAt: string | null
}

// the target labels and confirmation content shared by each invitation table
export type SentInvitesTableLabels = {
	targetLabel: string
	acceptedLabel: string
	acceptedNoun: string
	confirmTitle: string
	confirmLabel: string
	confirmBody: (row: SentInviteRow) => ConfirmationBody
}
// the team invites table's labels
export const TEAM_INVITES_TABLE_LABELS: SentInvitesTableLabels = {
	targetLabel: "Team",
	acceptedLabel: "Joined",
	acceptedNoun: "joined",
	confirmTitle: "Withdraw this invite?",
	confirmLabel: "Withdraw it",
	confirmBody: (row) => ({
		beforeTarget: "The invite to ",
		target: toInviteeLabel(row),
		afterTarget: " goes away. Anyone who already joined stays.",
	}),
}
export const TOPIC_INVITES_TABLE_LABELS: SentInvitesTableLabels = {
	targetLabel: "Topic",
	acceptedLabel: "Followed",
	acceptedNoun: "followed",
	confirmTitle: "Delete this invite?",
	confirmLabel: "Delete invite",
	confirmBody: (row) => ({
		beforeTarget: `${row.inviteeEmail ?? row.invitee?.username ?? "This invitee"} loses access to `,
		target: row.targetName,
		afterTarget: ", and they stop following it. Inviting them again starts over.",
	}),
}

// sort invitations by their target, invitee, sent date, or acceptance date
export const sentInviteSortValues = {
	target: (row: SentInviteRow) => row.targetName,
	invitee: (row: SentInviteRow) => row.invitee?.username ?? row.inviteeEmail,
	invited: (row: SentInviteRow) => row.invitedAt,
	accepted: (row: SentInviteRow) => row.acceptedAt ?? "",
}

/**
 * Returns the identifier used to invite a person.
 */
export function toInviteeLabel(row: SentInviteRow): string {
	return row.inviteeEmail ?? row.invitee?.username ?? "this invitee"
}

/**
 * Builds the invitation table shared by both platforms and both invitation kinds.
 */
export function toSentInvitesTableColumns({
	inviteRows,
	targetLabel,
	acceptedLabel,
	acceptedNoun,
	renderText,
	renderInvitee,
	renderActive,
}: {
	inviteRows: SentInviteRow[]
	targetLabel: string
	acceptedLabel: string
	acceptedNoun: string
	// how each app draws a cell's text, its invitee, and its active state
	renderText: (text: string) => ReactNode
	renderInvitee: (row: SentInviteRow) => ReactNode
	renderActive?: (row: SentInviteRow) => ReactNode
}): TableColumn<SentInviteRow>[] {
	// how many of the invites were accepted, for the column's heading
	const acceptedCount = inviteRows.filter((row) => row.acceptedAt !== null).length
	return [
		{ key: "target", label: targetLabel, width: 192, render: (row) => row.target, footer: renderText("Total") },
		{
			key: "invitee",
			label: "Invitee",
			width: 208,
			render: renderInvitee,
			footer: renderText(`${inviteRows.length} invited`),
		},
		{ key: "invited", label: "Invited", width: 112, render: (row) => renderText(toMonthYearLabel(row.invitedAt)) },
		{
			key: "accepted",
			label: acceptedLabel,
			width: 112,
			render: (row) => renderText(row.acceptedAt ? toMonthYearLabel(row.acceptedAt) : "Pending"),
			footer: renderText(`${acceptedCount} ${acceptedNoun}`),
		},
		...(renderActive
			? [
					{
						key: "active",
						label: "Active",
						width: 112,
						isSortable: false,
						tooltip: `Your active ${targetLabel.toLowerCase()} invites`,
						render: renderActive,
					},
				]
			: []),
	]
}

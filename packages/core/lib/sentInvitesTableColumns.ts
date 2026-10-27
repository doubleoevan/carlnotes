import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { toMonthYearLabel } from "./labels"

// topic and team invitations use one row shape and one set of columns
export type SentInviteRow = {
	inviteId: string
	target: ReactNode
	targetName: string
	invitee: ProfileIdentity | null
	inviteeEmail: string | null
	invitedAt: string
	acceptedAt: string | null
}

// the target labels and confirmation content shared by each invitation table
export type SentInvitesTableLabels<Body = ReactNode> = {
	targetLabel: string
	acceptedLabel: string
	acceptedNoun: string
	confirmTitle: string
	confirmLabel: string
	confirmBody: (row: SentInviteRow) => Body
}
export const TEAM_INVITES_TABLE_LABELS: SentInvitesTableLabels<string> = {
	targetLabel: "Team",
	acceptedLabel: "Joined",
	acceptedNoun: "joined",
	confirmTitle: "Withdraw this invitation?",
	confirmLabel: "Withdraw it",
	confirmBody: (row) => `The invitation to ${toInviteeLabel(row)} goes away. Anyone who already joined stays.`,
}
export const TOPIC_INVITES_TABLE_LABELS: SentInvitesTableLabels<string> = {
	targetLabel: "Topic",
	acceptedLabel: "Followed",
	acceptedNoun: "followed",
	confirmTitle: "Delete this invitation?",
	confirmLabel: "Delete invitation",
	confirmBody: (row) => {
		// join the confirmation parts for a plain-text dialog
		const { beforeTarget, target, afterTarget } = toTopicInviteConfirmation(row)
		return beforeTarget + target + afterTarget
	},
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
 * Returns the Topic withdrawal explanation with its target available for emphasis.
 */
export function toTopicInviteConfirmation(row: SentInviteRow): {
	beforeTarget: string
	target: string
	afterTarget: string
} {
	return {
		beforeTarget: `${row.inviteeEmail ?? row.invitee?.username ?? "This invitee"} loses access to `,
		target: row.targetName,
		afterTarget: ", and they stop following it. Inviting them again starts over.",
	}
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
	renderText: (text: string) => ReactNode
	renderInvitee: (row: SentInviteRow) => ReactNode
	renderActive?: (row: SentInviteRow) => ReactNode
}): TableColumn<SentInviteRow>[] {
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
						tooltip: `Your active ${targetLabel.toLowerCase()} invitations`,
						render: renderActive,
					},
				]
			: []),
	]
}

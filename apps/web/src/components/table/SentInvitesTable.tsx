import {
	type SentInvitesTableElements,
	SentInvitesTable as SharedSentInvitesTable,
} from "@carlnotes/core/components/SentInvitesTable"
import type { ComponentProps } from "react"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { DataTable } from "./DataTable"
import { TableConfirmDialog } from "./TableConfirmDialog"
import { TooltipSwitch } from "./TooltipSwitch"

export type { SentInviteRow } from "@carlnotes/core/lib/sentInvitesTableColumns"

/**
 * The invites the user sent, a shared table for topics and teams alike: the target, the invitee, when each was sent,
 * whether they accepted, and the Active switch that withdraws an invite with a confirmation.
 */
export function SentInvitesTable(props: Omit<ComponentProps<typeof SharedSentInvitesTable>, "elements">) {
	return <SharedSentInvitesTable {...props} elements={SENT_INVITES_TABLE_ELEMENTS} />
}

// the web's card and pagination, profile link, and switch with its tooltip
export const SENT_INVITES_TABLE_ELEMENTS: SentInvitesTableElements = {
	Table: (props) => <DataTable {...props} className="mb-4" />,
	Text: ({ children }) => <span>{children}</span>,
	Invitee: ({ row }) =>
		row.invitee ? (
			<UserProfileLink
				user={row.invitee}
				displayName={row.inviteeEmail ?? row.invitee.username}
				avatarClassName="size-5"
				isNewTab
			/>
		) : (
			row.inviteeEmail
		),
	WithdrawSwitch: ({ invitee, isDisabled, onWithdraw }) => (
		<TooltipSwitch
			action="Withdraw the invite to"
			name={invitee}
			isChecked
			isDisabled={isDisabled}
			onChange={onWithdraw}
		/>
	),
	Confirmation: TableConfirmDialog,
}

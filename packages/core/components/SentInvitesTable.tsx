import { type ComponentType, useState } from "react"
import {
	type SentInviteRow,
	type SentInvitesTableLabels,
	sentInviteSortValues,
	toInviteeLabel,
	toSentInvitesTableColumns,
} from "../lib/sentInvitesTableColumns"
import type { ConfirmationProps, SortedTableElement } from "../lib/tableElements"

export type SentInvitesTableElements = {
	Table: SortedTableElement
	Text: ComponentType<{ children: string }>
	// the invitee's profile link under the address they were invited by, or the address alone
	Invitee: ComponentType<{ row: SentInviteRow }>
	// the on switch that asks to withdraw an invite, labeled with the invitee it names
	WithdrawSwitch: ComponentType<{ invitee: string; isDisabled: boolean; onWithdraw: () => void }>
	Confirmation: ComponentType<ConfirmationProps>
}

/**
 * Lists the invites a user sent, for topics and teams alike: the target, the invitee, when each was sent and accepted,
 * and the Active switch that withdraws one after a confirmation.
 */
export function SentInvitesTable({
	inviteRows,
	labels: { targetLabel, acceptedLabel, acceptedNoun, confirmTitle, confirmLabel, confirmBody },
	isDisabled = false,
	onDeleteInvite,
	elements: { Table, Text, Invitee, WithdrawSwitch, Confirmation },
}: {
	inviteRows: SentInviteRow[]
	labels: SentInvitesTableLabels
	// true while a change is on its way
	isDisabled?: boolean
	// deletes an invite. without it the table renders read-only, for an admin's view
	onDeleteInvite?: (row: SentInviteRow) => Promise<void>
	elements: SentInvitesTableElements
}) {
	// the invite waiting for its withdraw confirmation, or null
	const [inviteToDelete, setInviteToDelete] = useState<SentInviteRow | null>(null)

	// the shared column order, formatting, and totals
	const columns = toSentInvitesTableColumns({
		inviteRows,
		targetLabel,
		acceptedLabel,
		acceptedNoun,
		renderText: (text) => <Text>{text}</Text>,
		renderInvitee: (row) => <Invitee row={row} />,
		renderActive: onDeleteInvite
			? (row) => (
					<WithdrawSwitch
						invitee={toInviteeLabel(row)}
						isDisabled={isDisabled}
						onWithdraw={() => setInviteToDelete(row)}
					/>
				)
			: undefined,
	})
	return (
		<>
			{/* newest invite first */}
			<Table
				rows={inviteRows}
				columns={columns}
				valueByKey={sentInviteSortValues}
				initialSort={{ key: "invited", isDescending: true }}
				getRowId={(row) => row.inviteId}
			/>
			{/* the withdraw confirmation, mounted only while an invite waits for it */}
			{inviteToDelete && onDeleteInvite && (
				<Confirmation
					title={confirmTitle}
					confirmLabel={confirmLabel}
					cancelLabel="Keep it"
					body={confirmBody(inviteToDelete)}
					onConfirm={async () => {
						await onDeleteInvite(inviteToDelete)
						setInviteToDelete(null)
					}}
					onClose={() => setInviteToDelete(null)}
				/>
			)}
		</>
	)
}

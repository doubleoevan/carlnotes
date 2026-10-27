import { DataTable } from "@carlnotes/core/components/DataTable"
import {
	type SentInviteRow,
	type SentInvitesTableLabels,
	sentInviteSortValues,
	toInviteeLabel,
	toSentInvitesTableColumns,
} from "@carlnotes/core/lib/sentInvitesTableColumns"
import { useState } from "react"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"

export type { SentInviteRow, SentInvitesTableLabels } from "@carlnotes/core/lib/sentInvitesTableColumns"
export { toInviteeLabel } from "@carlnotes/core/lib/sentInvitesTableColumns"

/**
 * The invitations the user sent, a shared table for topics and teams alike: the target user or email, when the invite was sent,
 * whether they accepted, and the Active toggle that withdraws an invitation with a confirmation.
 */
export function SentInvitesTable({
	inviteRows,
	targetLabel,
	acceptedLabel,
	acceptedNoun,
	confirmTitle,
	confirmLabel,
	confirmBody,
	onDeleteInvite,
}: SentInvitesTableLabels & {
	inviteRows: SentInviteRow[]
	// a callback for deleting the invitation. without it the table renders read-only, for an admin's view
	onDeleteInvite?: (inviteRow: SentInviteRow) => Promise<void>
}) {
	// newest invitation first
	const { pageRows, sort, pagination } = usePaginatedRowSort({
		rows: inviteRows,
		valueByKey: sentInviteSortValues,
		initialSort: { key: "invited", isDescending: true },
	})

	// the invitation waiting for withdraw confirmation, or null if no dialog is open
	const [deleteInvite, setDeleteInvite] = useState<SentInviteRow | null>(null)
	const handleDeleteInvite = async (): Promise<void> => {
		if (deleteInvite && onDeleteInvite) {
			await onDeleteInvite(deleteInvite)
		}
		setDeleteInvite(null)
	}

	// share column order, formatting, and totals with the native table
	const columns = toSentInvitesTableColumns({
		inviteRows,
		targetLabel,
		acceptedLabel,
		acceptedNoun,
		renderText: (text) => <span>{text}</span>,
		renderInvitee: (row) =>
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
		renderActive: onDeleteInvite
			? (row) => (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<Switch
									checked
									onCheckedChange={() => setDeleteInvite(row)}
									aria-label={`Withdraw the invitation to ${toInviteeLabel(row)}`}
								/>
							</span>
						</TooltipTrigger>
						<TooltipContent>
							Withdraw the invitation to <span className="font-semibold">{toInviteeLabel(row)}</span>
						</TooltipContent>
					</Tooltip>
				)
			: undefined,
	})
	return (
		<TableCard className="mb-4">
			<DataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={(row) => row.inviteId}
				sort={sort}
				elements={DATA_TABLE_ELEMENTS}
			/>
			<TablePagination {...pagination} />

			{/* the withdraw invite confirmation dialog is only mounted when a delete invite is set */}
			{deleteInvite && (
				<ConfirmDialog
					title={confirmTitle}
					confirmLabel={confirmLabel}
					cancelLabel="Keep it"
					onConfirm={handleDeleteInvite}
					onClose={() => setDeleteInvite(null)}
				>
					{confirmBody(deleteInvite)}
				</ConfirmDialog>
			)}
		</TableCard>
	)
}

import type { ProfileIdentity } from "@shared/contracts"
import type * as React from "react"
import { useState } from "react"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { toMonthYearLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"

// one sent invitation as the topic or teams invitations table renders it, whatever it targeted
export type SentInviteRow = {
	inviteId: string
	// the target cell, prebuilt by each table with its own link and avatar
	target: React.ReactNode
	// the target's name, for sorting and the remove confirmation
	targetName: string
	// the invitee's identity, null until the invitation names or loads one
	invitee: ProfileIdentity | null
	// the address it was sent to, null for a username invitation
	inviteeEmail: string | null
	invitedAt: string
	// when the invitee accepted, subscribing or joining. null while the invitation waits
	acceptedAt: string | null
}

// the sort accessors
const sentInviteSortValues = {
	target: (inviteRow: SentInviteRow) => inviteRow.targetName,
	invitee: (inviteRow: SentInviteRow) => inviteRow.invitee?.username ?? inviteRow.inviteeEmail,
	invited: (inviteRow: SentInviteRow) => inviteRow.invitedAt,
	accepted: (inviteRow: SentInviteRow) => inviteRow.acceptedAt ?? "",
}

// what the invitee cell and the tooltips call one row's person
function toInviteeLabel(inviteRow: SentInviteRow): string {
	return inviteRow.inviteeEmail ?? inviteRow.invitee?.username ?? "this invitee"
}

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
}: {
	inviteRows: SentInviteRow[]
	// the first column's header, named for what the invitations opened
	targetLabel: string
	// the accepted column's header and the footer's word for it: Followed/subscribed, Joined/joined
	acceptedLabel: string
	acceptedNoun: string
	// the withdraw confirmation, worded by each table for its own target
	confirmTitle: string
	confirmLabel: string
	confirmBody: (inviteRow: SentInviteRow) => React.ReactNode
	// a callback for deleting the invitation. without it the table renders read-only, for an admin's view
	onDeleteInvite?: (inviteRow: SentInviteRow) => Promise<void>
}) {
	// newest invitation first
	const { pageRows, sort, pagination } = usePaginatedRowSort(inviteRows, sentInviteSortValues, {
		key: "invited",
		isDescending: true,
	})

	// the invitation waiting for withdraw confirmation, or null when no dialog is open
	const [deleteInvite, setDeleteInvite] = useState<SentInviteRow | null>(null)
	const handleDeleteInvite = async (): Promise<void> => {
		if (deleteInvite && onDeleteInvite) {
			await onDeleteInvite(deleteInvite)
		}
		setDeleteInvite(null)
	}

	// the totals are summed from all invitations, not just the visible page
	const acceptedCount = inviteRows.filter((inviteRow) => inviteRow.acceptedAt !== null).length
	return (
		<TableCard className="mb-4">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={TABLE_CLASS}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="target" label={targetLabel} className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="invitee" label="Invitee" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="invited" label="Invited" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="accepted" label={acceptedLabel} className="py-2 pr-4" />
							{onDeleteInvite && (
								<th className="py-2 pr-4 font-normal">
									<Tooltip>
										<TooltipTrigger asChild>
											<span>Active</span>
										</TooltipTrigger>
										<TooltipContent>{`Your active ${targetLabel.toLowerCase()} invitations`}</TooltipContent>
									</Tooltip>
								</th>
							)}
						</tr>
					</thead>
					<tbody>
						{pageRows.map((inviteRow) => (
							<tr key={inviteRow.inviteId} className="border-b">
								<td className="py-2 pr-4">{inviteRow.target}</td>
								{/* the identifier the sender used, showing the profile link if the invitee has an account */}
								<td className="py-2 pr-4 whitespace-nowrap">
									{inviteRow.invitee ? (
										<UserProfileLink
											user={inviteRow.invitee}
											displayName={inviteRow.inviteeEmail ?? inviteRow.invitee.username}
											avatarClassName="size-5"
											isNewTab
										/>
									) : (
										inviteRow.inviteeEmail
									)}
								</td>
								<td className="py-2 pr-4">{toMonthYearLabel(inviteRow.invitedAt)}</td>
								<td className="py-2 pr-4">
									{inviteRow.acceptedAt ? (
										toMonthYearLabel(inviteRow.acceptedAt)
									) : (
										<span className="text-muted-foreground">Pending</span>
									)}
								</td>
								{onDeleteInvite && (
									<td className="py-2 pr-4">
										{/* switching an invitation off triggers the withdraw confirmation dialog */}
										<Tooltip>
											{/* the trigger wraps the switch in a span to prevent the tooltip from being triggered by the switch */}
											<TooltipTrigger asChild>
												<span className="inline-flex">
													<Switch
														checked
														onCheckedChange={() => setDeleteInvite(inviteRow)}
														aria-label={`Withdraw the invitation to ${toInviteeLabel(inviteRow)}`}
													/>
												</span>
											</TooltipTrigger>
											<TooltipContent>
												Withdraw the invitation to <span className="font-semibold">{toInviteeLabel(inviteRow)}</span>
											</TooltipContent>
										</Tooltip>
									</td>
								)}
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4">{inviteRows.length} invited</td>
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4">{`${acceptedCount} ${acceptedNoun}`}</td>
							{onDeleteInvite && <td className="py-2 pr-4" />}
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />

			{/* the withdraw invite confirmation dialog is only mounted when a delete invite is set */}
			{deleteInvite && (
				<ConfirmDialog
					title={confirmTitle}
					confirmLabel={confirmLabel}
					cancelLabel="Keep it"
					onConfirm={() => void handleDeleteInvite()}
					onClose={() => setDeleteInvite(null)}
				>
					{confirmBody(deleteInvite)}
				</ConfirmDialog>
			)}
		</TableCard>
	)
}

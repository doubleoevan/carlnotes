import type { ActivityResponse } from "@shared/contracts"
import { X } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { sendInviteDelete } from "@/lib/activityClient"
import { cn, TABLE_CARD_CLASS, toMonthYearLabel } from "@/lib/utils"

// one invitation the user sent on a topic they own
type InviteRow = ActivityResponse["invites"][number]

// the sort accessors for the invitations table. a pending invitation stands in as an empty string instead of null,
// which sorts it ahead of every date: last descending and first ascending.
const inviteSortValues = {
	name: (row: InviteRow) => row.name,
	// an invitee with an account sorts by their username, the name the cell shows
	invitee: (row: InviteRow) => row.invitee?.username ?? row.inviteeEmail,
	invited: (row: InviteRow) => row.invitedAt,
	subscribed: (row: InviteRow) => row.subscribedAt ?? "",
}

/**
 * The Activity page's invitations table: who the user invited to their topics, and whether each one was subscribed.
 * An invitee subscribes from their own subscriptions table, so the only available action here is withdrawing the invitation.
 */
export function InvitesTable({
	invites,
	onReload,
	isReadOnly = false,
}: {
	invites: InviteRow[]
	onReload: () => void
	// an admin reading another user's page cannot delete their invitations
	isReadOnly?: boolean
}) {
	// newest invitation first
	const { pageRows, sort, pagination } = usePaginatedRowSort(invites, inviteSortValues, {
		key: "invited",
		isDescending: true,
	})

	// the invitation awaiting delete confirmation, or null when no dialog is open
	const [inviteToDelete, setInviteToDelete] = useState<InviteRow | null>(null)

	// delete the confirmed invitation, which drops that invitee's subscription with it
	async function handleDeleteInvitation(): Promise<void> {
		if (!inviteToDelete) {
			return
		}
		await sendInviteDelete(inviteToDelete.topicId, inviteToDelete.inviteeEmail)
		setInviteToDelete(null)
		onReload()
	}

	// the totals span every invitation, not just the visible page
	const subscribedCount = invites.filter((inviteRow) => inviteRow.subscribedAt !== null).length
	return (
		<div className={cn(TABLE_CARD_CLASS, "mb-4")}>
			<table className="w-full text-left text-sm">
				<thead className="text-muted-foreground border-b">
					<tr>
						<SortableHeader sort={sort} sortKey="name" label="Topic" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="invitee" label="Invitee" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="invited" label="Invited" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="subscribed" label="Followed" className="py-2 pr-4" />
						<th className="py-2" />
					</tr>
				</thead>
				<tbody>
					{pageRows.map((row) => (
						<tr key={`${row.topicId}:${row.inviteeEmail}`} className="border-b">
							<td className="py-2 pr-4">
								<AnchorLink
									href={`/topics/${row.topicId}`}
									className="text-link block max-w-40 truncate hover:underline sm:max-w-64"
								>
									{row.name}
								</AnchorLink>
							</td>
							{/* the invitee's avatar and username if the email address has an account, otherwise the email.
							    it opens their profile in a new tab */}
							<td className="max-w-40 truncate py-2 pr-4 sm:max-w-64">
								{row.invitee ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<UserProfileLink user={row.invitee} avatarClassName="size-5" isNewTab />
										</TooltipTrigger>
										<TooltipContent>{`${row.invitee.username}'s profile`}</TooltipContent>
									</Tooltip>
								) : (
									row.inviteeEmail
								)}
							</td>
							<td className="py-2 pr-4">{toMonthYearLabel(row.invitedAt)}</td>
							{/* the date they subscribed or pending */}
							<td className="py-2 pr-4">
								{row.subscribedAt ? (
									toMonthYearLabel(row.subscribedAt)
								) : (
									<span className="text-muted-foreground">Pending</span>
								)}
							</td>
							<td className="py-2 text-right">
								{!isReadOnly && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												size="icon-sm"
												variant="ghost"
												onClick={() => setInviteToDelete(row)}
												aria-label="Delete invitation"
											>
												<X className="size-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Delete invitation</TooltipContent>
									</Tooltip>
								)}
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="text-muted-foreground">
						<td className="py-2 pr-4">Total</td>
						<td className="py-2 pr-4">{invites.length} invited</td>
						<td className="py-2 pr-4" />
						<td className="py-2 pr-4">{subscribedCount} subscribed</td>
						<td className="py-2" />
					</tr>
				</tfoot>
			</table>
			<TablePagination {...pagination} />
			{/* the delete confirmation, mounted only if an invitation is awaiting it */}
			{inviteToDelete && (
				<ConfirmDialog
					title="Delete this invitation?"
					confirmLabel="Delete invitation"
					cancelLabel="Keep it"
					onConfirm={handleDeleteInvitation}
					onClose={() => setInviteToDelete(null)}
				>
					{`${inviteToDelete.inviteeEmail} loses access to `}
					<AnchorLink href={`/topics/${inviteToDelete.topicId}`} className="text-link hover:underline">
						{inviteToDelete.name}
					</AnchorLink>
					, and their subscription goes with it. Inviting them again starts over.
				</ConfirmDialog>
			)}
		</div>
	)
}

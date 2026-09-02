import type { ActivityResponse } from "@shared/contracts"
import { X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendAcceptInvite, sendDeclineInvite } from "@/clients/activityClient"
import { sendDeleteSubscription, sendSubscriptionEmail, sendTopicSubscription } from "@/clients/topicClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TeamLink } from "@/components/team/TeamLink"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { toMonthYearLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { NEXT_SCAN_DISCLAIMER } from "@/lib/utils"

// one subscription the user holds on a topic they do not own
type SubscriptionRow = ActivityResponse["subscriptions"][number]

// the sort accessors for the subscriptions table
const subscriptionSortValues = {
	name: (row: SubscriptionRow) => row.name,
	owner: (row: SubscriptionRow) => row.team?.name ?? row.owner.username,
	subscribed: (row: SubscriptionRow) => row.subscribedAt,
	active: (row: SubscriptionRow) => (row.isActive ? 1 : 0),
	emails: (row: SubscriptionRow) => (row.isEmailEnabled ? 1 : 0),
}

/**
 * The Activity page's subscriptions table: the active and email toggles plus delete on a row the user owns.
 * Every action reloads the page, and the server decides what is active.
 */
export function TopicSubscriptionsTable({
	subscriptions,
	onReloadPage,
	isReadOnly = false,
}: {
	subscriptions: SubscriptionRow[]
	onReloadPage: () => void
	// an admin reading another user's page sees disabled controls and no delete button
	isReadOnly?: boolean
}) {
	// defaults to the newest subscribed first
	const { pageRows, sort, pagination } = usePaginatedRowSort(subscriptions, subscriptionSortValues, {
		key: "subscribed",
		isDescending: true,
	})
	// the subscription waiting for delete confirmation or null
	const [subscriptionToDelete, setSubscriptionToDelete] = useState<{
		topicId: string
		name: string
		inviteId: string | null
	} | null>(null)

	// flip a subscription's active state on the server, cascading the email off when it deactivates
	async function handleActiveChange(row: SubscriptionRow, isActive: boolean): Promise<void> {
		if (row.inviteId) {
			await sendAcceptInvite(row.inviteId)
			toast(`You are subscribed.\n${NEXT_SCAN_DISCLAIMER}`)
			onReloadPage()
			return
		}
		await sendTopicSubscription(row.topicId, isActive)

		// an "invite" topic gates findings on when the subscription was activated
		if (isActive && row.visibility === "invite") {
			toast(`You are subscribed.\n${NEXT_SCAN_DISCLAIMER}`)
		}
		onReloadPage()
	}

	// flip the email preference on the server, independent of the active state
	async function handleEmailChange(topicId: string, isEmailEnabled: boolean): Promise<void> {
		await sendSubscriptionEmail(topicId, isEmailEnabled)
		onReloadPage()
	}

	// permanently remove the confirmed subscription, which drops the user's invite to that topic too
	async function handleDeleteSubscription(): Promise<void> {
		if (!subscriptionToDelete) {
			return
		}
		if (subscriptionToDelete.inviteId) {
			await sendDeclineInvite(subscriptionToDelete.inviteId)
		} else {
			await sendDeleteSubscription(subscriptionToDelete.topicId)
		}
		setSubscriptionToDelete(null)
		onReloadPage()
	}

	// column totals for the summary line span every row, not just the visible page
	const activeSubscriptionCount = subscriptions.filter((subscription) => subscription.isActive).length
	const emailSubscriptionCount = subscriptions.filter((subscription) => subscription.isEmailEnabled).length

	return (
		<TableCard className="mb-4">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={TABLE_CLASS}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="name" label="Topic" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="owner" label="Owner" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="subscribed" label="Followed" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="active" label="Active" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="emails"
								label="Emails"
								tooltip="Receive emails"
								className="py-2 pr-4"
							/>
							<th className="py-2" />
						</tr>
					</thead>
					<tbody>
						{pageRows.map((subscriptionRow) => (
							<tr key={subscriptionRow.topicId} className="border-b">
								<td className="py-2 pr-4">
									{/* the badge sits on the name's corner, the way it does in every other topic table */}
									<span className="relative inline-block">
										<AnchorLink href={`/topics/${subscriptionRow.topicId}`} className="text-link hover:underline">
											{subscriptionRow.name}
										</AnchorLink>
										<TopicMentionBadge topicId={subscriptionRow.topicId} />
									</span>
									{/* a pending invitation and a switched-off subscription both read inactive, so it shows which */}
									{subscriptionRow.inviteId && <span className="text-muted-foreground ml-2 text-xs">Invited</span>}
								</td>
								<td className="py-2 pr-4">
									{/* the byline: the owning team where one exists, otherwise the creator's profile */}
									{subscriptionRow.team ? (
										<TeamLink team={subscriptionRow.team} label="" className="whitespace-nowrap" />
									) : (
										<UserProfileLink user={subscriptionRow.owner} className="whitespace-nowrap" />
									)}
								</td>
								<SubscriptionCells
									subscription={subscriptionRow}
									isPageReadOnly={isReadOnly}
									onActiveChange={handleActiveChange}
									onEmailChange={handleEmailChange}
									onDeleteRequest={() =>
										setSubscriptionToDelete({
											topicId: subscriptionRow.topicId,
											name: subscriptionRow.name,
											inviteId: subscriptionRow.inviteId,
										})
									}
								/>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4" />
							<td className="py-2 pr-4">{`${activeSubscriptionCount}/${subscriptions.length} active`}</td>
							<td className="py-2 pr-4">{`${emailSubscriptionCount}/${subscriptions.length} on`}</td>
							<td className="py-2" />
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
			{/* the delete confirmation, mounted only while a subscription is waiting for it */}
			{subscriptionToDelete && (
				<ConfirmDialog
					title={subscriptionToDelete.inviteId ? "Delete this invitation?" : "Delete this subscription?"}
					confirmLabel={subscriptionToDelete.inviteId ? "Delete invitation" : "Delete subscription"}
					cancelLabel="Keep it"
					onConfirm={handleDeleteSubscription}
					onClose={() => setSubscriptionToDelete(null)}
				>
					{subscriptionToDelete.inviteId ? "Your invitation to " : "Your subscription to "}
					<AnchorLink href={`/topics/${subscriptionToDelete.topicId}`} className="text-link hover:underline">
						{subscriptionToDelete.name}
					</AnchorLink>
					{subscriptionToDelete.inviteId ? " goes away, and whoever sent it is not told." : " gets removed for good."}
				</ConfirmDialog>
			)}
		</TableCard>
	)
}

// the subscribed date, the active and email switches, then the delete x
function SubscriptionCells({
	subscription,
	isPageReadOnly,
	onActiveChange,
	onEmailChange,
	onDeleteRequest,
}: {
	subscription: SubscriptionRow
	// the whole page is read-only for an admin reading somebody else
	isPageReadOnly: boolean
	onActiveChange: (row: SubscriptionRow, isActive: boolean) => void
	onEmailChange: (topicId: string, isEmailEnabled: boolean) => void
	onDeleteRequest: () => void
}) {
	const isInvitation = subscription.inviteId !== null
	return (
		<>
			<td className="py-2 pr-4">{toMonthYearLabel(subscription.subscribedAt)}</td>
			<td className="py-2 pr-4">
				{/* switching a pending invitation active accepts it */}
				<Switch
					checked={subscription.isActive}
					disabled={isPageReadOnly}
					onCheckedChange={(isActive) => onActiveChange(subscription, isActive)}
					aria-label={
						isInvitation ? `Accept the invitation to ${subscription.name}` : `${subscription.name} subscription`
					}
				/>
			</td>
			<td className="py-2 pr-4">
				{/* an invitation has no email preference until it is accepted */}
				<Switch
					checked={subscription.isEmailEnabled}
					disabled={isPageReadOnly || isInvitation}
					onCheckedChange={(isEmailEnabled) => onEmailChange(subscription.topicId, isEmailEnabled)}
					aria-label={`${subscription.name} emails`}
				/>
			</td>
			<td className="py-2 text-right">
				{!isPageReadOnly && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={onDeleteRequest}
								aria-label={
									isInvitation
										? `Delete the invitation to ${subscription.name}`
										: `Delete the subscription to ${subscription.name}`
								}
							>
								<X className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{isInvitation ? "Delete the invitation to " : "Delete the subscription to "}
							<span className="font-semibold">{subscription.name}</span>
						</TooltipContent>
					</Tooltip>
				)}
			</td>
		</>
	)
}

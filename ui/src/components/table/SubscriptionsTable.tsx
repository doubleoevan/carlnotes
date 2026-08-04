import type { ActivityResponse } from "@shared/contracts"
import { X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { sendSubscriptionDelete, sendSubscriptionEmail, sendTopicSubscription } from "@/lib/topicClient"
import { cn, NEXT_SCAN_DISCLAIMER, TABLE_CARD_CLASS } from "@/lib/utils"

// one subscription the user holds on a topic they do not own
type SubscriptionRow = ActivityResponse["subscriptions"][number]

// the sort accessors for the subscriptions table. an audience-held row sorts by the audience it came from
const subscriptionSortValues = {
	name: (row: SubscriptionRow) => row.name,
	owner: (row: SubscriptionRow) => row.audienceName ?? row.ownerName,
	subscribed: (row: SubscriptionRow) => row.subscribedAt,
	active: (row: SubscriptionRow) => (row.isActive ? 1 : 0),
	emails: (row: SubscriptionRow) => (row.isEmailEnabled ? 1 : 0),
}

/**
 * The Activity page's subscriptions table: the active and email toggles plus delete on a row the user owns,
 * and a read-only row for a subscription an audience granted. Every action reloads the page, since the server decides what is active.
 */
export function SubscriptionsTable({
	subscriptions,
	onReloadPage,
}: {
	subscriptions: SubscriptionRow[]
	onReloadPage: () => void
}) {
	// defaults to the newest subscribed first, since the server's own row order isn't stable across reloads
	const { pageRows, sort, pagination } = usePaginatedRowSort(subscriptions, subscriptionSortValues, {
		key: "subscribed",
		isDescending: true,
	})
	// the subscription awaiting delete confirmation or null
	const [subscriptionToDelete, setSubscriptionToDelete] = useState<{ topicId: string; name: string } | null>(null)

	// flip a subscription's active state on the server, cascading the email off when it deactivates
	async function handleActiveChange(row: SubscriptionRow, isActive: boolean): Promise<void> {
		await sendTopicSubscription(row.topicId, isActive)

		// an "invite" topic gates findings on when the subscription was activated.
		// activating starts from the next scan instead of showing what the topic already found.
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

	// permanently remove the delete subscription row, which drops the caller's invite to that topic too
	async function handleDeleteSubscription(): Promise<void> {
		if (!subscriptionToDelete) {
			return
		}
		await sendSubscriptionDelete(subscriptionToDelete.topicId)
		setSubscriptionToDelete(null)
		onReloadPage()
	}

	// column totals for the summary line span every row, not just the visible page
	const activeSubscriptionCount = subscriptions.filter((subscription) => subscription.isActive).length
	const emailSubscriptionCount = subscriptions.filter((subscription) => subscription.isEmailEnabled).length

	return (
		<div className={cn(TABLE_CARD_CLASS, "mb-4")}>
			<table className="w-full text-left text-sm">
				<thead className="text-muted-foreground border-b">
					<tr>
						<SortableHeader sort={sort} sortKey="name" label="Topic" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="owner" label="Owner" className="py-2 pr-4" />
						<SortableHeader sort={sort} sortKey="subscribed" label="Subscribed" className="py-2 pr-4" />
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
					{pageRows.map((row) => (
						<tr key={row.topicId} className="border-b">
							<td className="py-2 pr-4">
								<AnchorLink
									href={`/topics/${row.topicId}`}
									className="text-link block max-w-40 truncate hover:underline sm:max-w-64"
								>
									{row.name}
								</AnchorLink>
							</td>
							<SubscriptionOwnerCell subscription={row} />
							<SubscriptionCells
								subscription={row}
								onActiveChange={handleActiveChange}
								onEmailChange={handleEmailChange}
								onDeleteRequest={() => setSubscriptionToDelete({ topicId: row.topicId, name: row.name })}
							/>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="text-muted-foreground">
						<td className="py-2 pr-4">Total</td>
						<td className="py-2 pr-4" />
						<td className="py-2 pr-4" />
						<td className="py-2 pr-4">{activeSubscriptionCount}</td>
						<td className="py-2 pr-4">{emailSubscriptionCount}</td>
						<td className="py-2" />
					</tr>
				</tfoot>
			</table>
			<TablePagination {...pagination} />
			{/* the delete confirmation, mounted only while a subscription is awaiting it */}
			{subscriptionToDelete && (
				<ConfirmDialog
					title="Delete this subscription?"
					confirmLabel="Delete subscription"
					cancelLabel="Keep it"
					onConfirm={handleDeleteSubscription}
					onClose={() => setSubscriptionToDelete(null)}
				>
					{"Your subscription to "}
					<AnchorLink href={`/topics/${subscriptionToDelete.topicId}`} className="text-link hover:underline">
						{subscriptionToDelete.name}
					</AnchorLink>
					{" gets removed for good."}
				</ConfirmDialog>
			)}
		</div>
	)
}

// the subscription owner, or the audience that granted the subscription, which is a read-only row
function SubscriptionOwnerCell({ subscription }: { subscription: SubscriptionRow }) {
	if (!subscription.audienceName) {
		return <td className="py-2 pr-4">{subscription.ownerName}</td>
	}
	return (
		<td className="py-2 pr-4">
			{subscription.ownerName}
			<span className="text-muted-foreground block text-xs">via {subscription.audienceName}</span>
		</td>
	)
}

// the subscribed date, the active and email switches, then the delete x. an audience-held subscription belongs to
// the audience, so its switches are disabled and it offers no delete: every subscription write targets the caller's own row
function SubscriptionCells({
	subscription,
	onActiveChange,
	onEmailChange,
	onDeleteRequest,
}: {
	subscription: SubscriptionRow
	onActiveChange: (row: SubscriptionRow, isActive: boolean) => void
	onEmailChange: (topicId: string, isEmailEnabled: boolean) => void
	onDeleteRequest: () => void
}) {
	const isReadOnly = subscription.audienceName !== null
	return (
		<>
			<td className="py-2 pr-4">{new Date(subscription.subscribedAt).toLocaleDateString()}</td>
			<td className="py-2 pr-4">
				<Switch
					checked={subscription.isActive}
					disabled={isReadOnly}
					onCheckedChange={(isActive) => onActiveChange(subscription, isActive)}
					aria-label={`${subscription.name} subscription`}
				/>
			</td>
			<td className="py-2 pr-4">
				<Switch
					checked={subscription.isEmailEnabled}
					disabled={isReadOnly}
					onCheckedChange={(isEmailEnabled) => onEmailChange(subscription.topicId, isEmailEnabled)}
					aria-label={`${subscription.name} emails`}
				/>
			</td>
			<td className="py-2 text-right">
				{!isReadOnly && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button size="icon-sm" variant="ghost" onClick={onDeleteRequest} aria-label="Delete subscription">
								<X className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete subscription</TooltipContent>
					</Tooltip>
				)}
			</td>
		</>
	)
}

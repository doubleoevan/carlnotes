import { fetchTopicInviteBadges, sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { sendDeleteSubscription, sendSubscriptionEmail, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { DataTable } from "@carlnotes/core/components/DataTable"
import {
	subscriptionSortValues,
	toTopicSubscriptionsTableColumns,
} from "@carlnotes/core/lib/topicSubscriptionsTableColumns"
import { setTopicInviteBadges } from "@carlnotes/core/stores/topicInviteStore"
import { X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TeamLink } from "@/components/team/TeamLink"
import { NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { TopicNameLink } from "./TopicNameLink"

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
	const { pageRows, sort, pagination } = usePaginatedRowSort({
		rows: subscriptions,
		valueByKey: subscriptionSortValues,
		initialSort: { key: "subscribed", isDescending: true },
	})
	// the subscription waiting for delete confirmation or null
	const [subscriptionToDelete, setSubscriptionToDelete] = useState<{
		topicId: string
		name: string
		inviteId: string | null
	} | null>(null)

	// re-read the waiting invitations
	const updateTopicInviteBadges = (): void => {
		fetchTopicInviteBadges()
			.then(setTopicInviteBadges)
			.catch(() => {})
	}

	// flip a subscription's active state on the server, cascading the email off when it deactivates
	async function handleActiveChange(row: SubscriptionRow, isActive: boolean): Promise<void> {
		if (row.inviteId) {
			await sendAcceptInvite(row.inviteId)
			updateTopicInviteBadges()
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
			updateTopicInviteBadges()
		} else {
			await sendDeleteSubscription(subscriptionToDelete.topicId)
		}
		setSubscriptionToDelete(null)
		onReloadPage()
	}

	// keep the same column composition and totals on web and mobile
	const columns = toTopicSubscriptionsTableColumns({
		subscriptions,
		renderText: (text) => <span>{text}</span>,
		renderName: (row) => (
			<>
				<TopicNameLink topic={{ id: row.topicId, name: row.name, latestPodcastEpisode: row.latestPodcastEpisode }} />
				{row.inviteId && <span className="block">Invited</span>}
			</>
		),
		renderOwner: (row) =>
			row.team ? (
				<TeamLink team={row.team} label="" className="whitespace-nowrap" />
			) : (
				<UserProfileLink user={row.owner} className="whitespace-nowrap" />
			),
		renderActive: (row) => (
			<Switch
				checked={row.isActive}
				disabled={isReadOnly}
				onCheckedChange={(isActive) => void handleActiveChange(row, isActive)}
				aria-label={row.inviteId ? `Accept the invitation to ${row.name}` : `${row.name} subscription`}
			/>
		),
		renderEmails: (row) => (
			<Switch
				checked={row.isEmailEnabled}
				disabled={isReadOnly || !!row.inviteId}
				onCheckedChange={(isEnabled) => void handleEmailChange(row.topicId, isEnabled)}
				aria-label={`${row.name} emails`}
			/>
		),
		renderRemove: (row) =>
			!isReadOnly && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={() => setSubscriptionToDelete(row)}
							aria-label={`Delete the ${row.inviteId ? "invitation" : "subscription"} to ${row.name}`}
						>
							<X className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						Delete the {row.inviteId ? "invitation" : "subscription"} to{" "}
						<span className="font-semibold">{row.name}</span>
					</TooltipContent>
				</Tooltip>
			),
	})
	return (
		<TableCard className="mb-4">
			<DataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={(row) => row.topicId}
				sort={sort}
				elements={DATA_TABLE_ELEMENTS}
			/>
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
					<AnchorLink
						href={toTopicPath({ id: subscriptionToDelete.topicId, name: subscriptionToDelete.name })}
						className="sentence-link"
					>
						{subscriptionToDelete.name}
					</AnchorLink>
					{subscriptionToDelete.inviteId ? " goes away, and whoever sent it is not told." : " gets removed for good."}
				</ConfirmDialog>
			)}
		</TableCard>
	)
}

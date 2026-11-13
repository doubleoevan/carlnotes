import { fetchTopicInviteBadges, sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { sendDeleteSubscription, sendSubscriptionEmail, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import {
	TopicSubscriptionsTable as SharedTopicSubscriptionsTable,
	type TopicSubscriptionsTableElements,
} from "@carlnotes/core/components/TopicSubscriptionsTable"
import { setTopicInviteBadges } from "@carlnotes/core/stores/topicInviteStore"
import { toast } from "sonner"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Switch } from "@/components/primitives/switch"
import { TeamLink } from "@/components/team/TeamLink"
import { NEXT_SCAN_DISCLAIMER } from "@/lib/utils"
import { DataTable } from "./DataTable"
import { TableConfirmDialog } from "./TableConfirmDialog"
import { TooltipRemoveButton } from "./TooltipRemoveButton"
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
	// re-read the waiting invites
	const updateTopicInviteBadges = (): void => {
		fetchTopicInviteBadges()
			.then(setTopicInviteBadges)
			.catch(() => {})
	}

	// flip a subscription's active state on the server, or accept a pending invite
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
	async function handleEmailChange(row: SubscriptionRow, isEmailEnabled: boolean): Promise<void> {
		await sendSubscriptionEmail(row.topicId, isEmailEnabled)
		onReloadPage()
	}

	// permanently remove the subscription, or decline the pending invite
	async function handleDelete(row: SubscriptionRow): Promise<void> {
		if (row.inviteId) {
			await sendDeclineInvite(row.inviteId)
			updateTopicInviteBadges()
		} else {
			await sendDeleteSubscription(row.topicId)
		}
		onReloadPage()
	}

	return (
		<SharedTopicSubscriptionsTable
			subscriptions={subscriptions}
			isReadOnly={isReadOnly}
			onActiveChange={(row, isActive) => void handleActiveChange(row, isActive)}
			onEmailChange={(row, isEnabled) => void handleEmailChange(row, isEnabled)}
			onDelete={handleDelete}
			elements={TOPIC_SUBSCRIPTIONS_TABLE_ELEMENTS}
		/>
	)
}

// the web's card and pagination, links, switches, and the delete button with its tooltip
export const TOPIC_SUBSCRIPTIONS_TABLE_ELEMENTS: TopicSubscriptionsTableElements = {
	Table: (props) => <DataTable {...props} className="mb-4" />,
	Text: ({ children }) => <span>{children}</span>,
	TopicName: ({ row, invitedLabel }) => (
		<>
			<TopicNameLink topic={{ id: row.topicId, name: row.name, latestPodcastEpisode: row.latestPodcastEpisode }} />
			{invitedLabel && <span className="block">{invitedLabel}</span>}
		</>
	),
	TeamLink: ({ team }) => <TeamLink team={team} label="" className="whitespace-nowrap" />,
	UserProfileLink: ({ user }) => <UserProfileLink user={user} className="whitespace-nowrap" />,
	Switch: ({ label, isChecked, isDisabled, onChange }) => (
		<Switch checked={isChecked} disabled={isDisabled} onCheckedChange={onChange} aria-label={label} />
	),
	RemoveButton: ({ action, topicName, isDisabled, onPress }) => (
		<TooltipRemoveButton action={action} name={topicName} isDisabled={isDisabled} onPress={onPress} />
	),
	Confirmation: TableConfirmDialog,
}

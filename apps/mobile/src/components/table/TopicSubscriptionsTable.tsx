import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { sendDeleteSubscription, sendSubscriptionEmail, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import {
	TopicSubscriptionsTable as SharedTopicSubscriptionsTable,
	type TopicSubscriptionsTableElements,
} from "@carlnotes/core/components/TopicSubscriptionsTable"
import { X } from "lucide-react-native"
import { View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TeamLink } from "@/components/team/TeamLink"
import { usePageMutation } from "@/hooks/usePageMutation"
import { offerPushPermission } from "@/pushPermission"
import { DataTable } from "./DataTable"
import { TableConfirmAlert } from "./TableConfirmAlert"
import { TopicNameLink } from "./TopicNameLink"

/**
 * Renders the web's subscriptions table through native switches and the system alert, one change at a time.
 */
export function TopicSubscriptionsTable({
	subscriptions,
	onReloadPage,
}: {
	subscriptions: SubscriptionRow[]
	onReloadPage: () => void
}) {
	// one change at a time, with a failed one kept on screen
	const mutation = usePageMutation(onReloadPage)

	// accept a pending invite or flip a follow, and explain the notifications a followed topic can send
	async function handleActiveChange(row: SubscriptionRow, isActive: boolean): Promise<void> {
		if (row.inviteId) {
			const acceptedInvite = await sendAcceptInvite(row.inviteId)
			if (acceptedInvite.status !== "joined") {
				throw new Error("That invite couldn't be accepted. Try again.")
			}
		} else {
			await sendTopicSubscription(row.topicId, isActive)
		}
		if (isActive) {
			void offerPushPermission()
		}
	}
	return (
		<View className="gap-2">
			<SharedTopicSubscriptionsTable
				subscriptions={subscriptions}
				isDisabled={mutation.isPending}
				onActiveChange={(row, isActive) => void mutation.run(() => handleActiveChange(row, isActive))}
				onEmailChange={(row, isEnabled) => void mutation.run(() => sendSubscriptionEmail(row.topicId, isEnabled))}
				onDelete={(row) =>
					mutation.run(() => (row.inviteId ? sendDeclineInvite(row.inviteId) : sendDeleteSubscription(row.topicId)))
				}
				elements={TOPIC_SUBSCRIPTIONS_TABLE_ELEMENTS}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}

// the native table with its sorting and pagination, links, switches, and the delete button
const TOPIC_SUBSCRIPTIONS_TABLE_ELEMENTS: TopicSubscriptionsTableElements = {
	Table: DataTable,
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	TopicName: ({ row, invitedLabel }) => (
		<View>
			<TopicNameLink topic={{ ...row, id: row.topicId }} />
			{invitedLabel && <Text className="text-sm">{invitedLabel}</Text>}
		</View>
	),
	TeamLink,
	UserProfileLink,
	Switch: PreferenceSwitch,
	RemoveButton: ({ action, topicName, isDisabled, onPress }) => (
		<Button
			variant="ghost"
			size="icon-sm"
			accessibilityLabel={`${action} ${topicName}`}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon as={X} className="size-4" />
		</Button>
	),
	Confirmation: TableConfirmAlert,
}

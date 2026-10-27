import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { sendDeleteSubscription, sendSubscriptionEmail, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { SubscriptionRow } from "@carlnotes/contracts/activity"
import {
	subscriptionSortValues,
	toTopicSubscriptionsTableColumns,
} from "@carlnotes/core/lib/topicSubscriptionsTableColumns"
import { X } from "lucide-react-native"
import { Alert, View } from "react-native"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TeamLink } from "@/components/team/TeamLink"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"
import { TopicNameLink } from "./TopicNameLink"

/**
 * Manages native follows and invitations through Activity's shared table.
 */
export function TopicSubscriptionsTable({
	subscriptions,
	onReloadPage,
}: {
	subscriptions: SubscriptionRow[]
	onReloadPage: () => void
}) {
	const mutation = usePageMutation(onReloadPage)
	function handleRemove(row: SubscriptionRow): void {
		// preserve the web's warning before permanently removing access
		const isInvitation = row.inviteId !== null
		Alert.alert(
			isInvitation ? "Delete this invitation?" : "Delete this subscription?",
			isInvitation
				? `Your invitation to ${row.name} goes away, and whoever sent it is not told.`
				: `Your subscription to ${row.name} gets removed for good.`,
			[
				{ text: "Keep it", style: "cancel" },
				{
					text: isInvitation ? "Delete invitation" : "Delete subscription",
					style: "destructive",
					onPress: () =>
						void mutation.run(() =>
							row.inviteId ? sendDeclineInvite(row.inviteId) : sendDeleteSubscription(row.topicId),
						),
				},
			],
		)
	}
	async function handleActiveChange(row: SubscriptionRow, isActive: boolean): Promise<void> {
		if (row.inviteId) {
			const acceptedInvite = await sendAcceptInvite(row.inviteId)
			if (acceptedInvite.status !== "joined") {
				throw new Error("That invitation couldn't be accepted. Try again.")
			}
		} else {
			await sendTopicSubscription(row.topicId, isActive)
		}
	}
	const columns = toTopicSubscriptionsTableColumns({
		subscriptions,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderName: (row) => (
			<View>
				<TopicNameLink topic={{ ...row, id: row.topicId }} />
				{row.inviteId && <Text className="text-sm">Invited</Text>}
			</View>
		),
		renderOwner: (row) => (row.team ? <TeamLink team={row.team} /> : <UserProfileLink user={row.owner} />),
		renderActive: (row) => (
			<PreferenceSwitch
				label={row.inviteId ? `Accept the invitation to ${row.name}` : `${row.name} subscription`}
				isChecked={row.isActive}
				isDisabled={mutation.isPending}
				onChange={(isActive) => void mutation.run(() => handleActiveChange(row, isActive))}
			/>
		),
		renderEmails: (row) => (
			<PreferenceSwitch
				label={`${row.name} emails`}
				isChecked={row.isEmailEnabled}
				isDisabled={mutation.isPending || !!row.inviteId}
				onChange={(isEnabled) => void mutation.run(() => sendSubscriptionEmail(row.topicId, isEnabled))}
			/>
		),
		renderRemove: (row) => (
			<Button
				variant="ghost"
				size="icon-sm"
				accessibilityLabel={`Delete ${row.inviteId ? "invitation" : "subscription"} to ${row.name}`}
				disabled={mutation.isPending}
				onPress={() => handleRemove(row)}
			>
				<Icon as={X} className="size-4" />
			</Button>
		),
	})
	return (
		<View className="gap-2">
			<DataTable
				rows={subscriptions}
				columns={columns}
				valueByKey={subscriptionSortValues}
				initialSort={{ key: "subscribed", isDescending: true }}
				getRowId={(row) => row.topicId}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}

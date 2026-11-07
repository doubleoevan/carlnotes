import {
	NotificationsCard,
	type NotificationsCardProps,
	type PushPermission,
	type PushPreferences,
	toNotificationSwitchStates,
} from "@carlnotes/core/components/NotificationsSection"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ACCOUNT_FIELD_ELEMENTS } from "./AccountFields"

// both kinds on, as the first grant leaves them
const BOTH_KINDS_ON = { isTopicPushEnabled: true, isChatMentionPushEnabled: true }

// the push part of the card for a permission, a set of saved preferences, and a save in flight
function toPushProps(
	pushPermission: PushPermission,
	pushPreferences: PushPreferences = BOTH_KINDS_ON,
	savingKind: "topic-scan" | "chat-mention" | null = null,
): NonNullable<NotificationsCardProps["push"]> {
	return {
		pushPermission,
		switchStates: toNotificationSwitchStates({ pushPermission, pushPreferences, savingKind }),
		onChange: () => undefined,
		onRequestPermission: () => undefined,
		onOpenSettings: () => undefined,
	}
}

// the Notifications card's states, with no requests
const meta: Meta<typeof NotificationsCard> = {
	title: "Account/NotificationsSection",
	component: NotificationsCard,
	args: {
		elements: ACCOUNT_FIELD_ELEMENTS,
		notificationsEmailSwitchState: { isChecked: true, isDisabled: false },
		onNotificationsEmailChange: () => undefined,
		error: null,
		push: toPushProps("granted"),
	},
	parameters: {
		webReference:
			"apps/web/src/components/account/AccountSettings.tsx Notifications at 375px for the email switch. The web has no push. Card from apps/web/src/components/account/AccountSettings.tsx Invitations, switch from TopicSubscriptionsTable's Emails column, at 375px",
	},
	decorators: [
		(Story) => (
			<View style={{ width: "100%" }}>
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Granted: Story = {}
export const MentionsOff: Story = {
	args: { push: toPushProps("granted", { isTopicPushEnabled: true, isChatMentionPushEnabled: false }) },
}
export const EmailOff: Story = { args: { notificationsEmailSwitchState: { isChecked: false, isDisabled: false } } }
export const Saving: Story = {
	args: {
		notificationsEmailSwitchState: { isChecked: true, isDisabled: true },
		push: toPushProps("granted", BOTH_KINDS_ON, "topic-scan"),
	},
}
export const SaveFailed: Story = { args: { error: SAVE_FAILED_TEXT } }
export const NeverAsked: Story = {
	args: { push: toPushProps("undetermined", { isTopicPushEnabled: null, isChatMentionPushEnabled: null }) },
}
export const Denied: Story = { args: { push: toPushProps("denied") } }

import { NotificationsCard, toNotificationSwitchStates } from "@carlnotes/core/components/NotificationsSection"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ACCOUNT_FIELD_ELEMENTS } from "./AccountFields"

// both kinds on, as the first grant leaves them
const BOTH_KINDS_ON = { isTopicPushEnabled: true, isChatMentionPushEnabled: true }

// the Notifications card's states, with no requests
const meta: Meta<typeof NotificationsCard> = {
	title: "Account/NotificationsSection",
	component: NotificationsCard,
	args: {
		elements: ACCOUNT_FIELD_ELEMENTS,
		pushPermission: "granted",
		switchStates: toNotificationSwitchStates({
			pushPermission: "granted",
			pushPreferences: BOTH_KINDS_ON,
			savingKind: null,
		}),
		error: null,
		onChange: () => undefined,
		onRequestPermission: () => undefined,
		onOpenSettings: () => undefined,
	},
	parameters: {
		webReference:
			"none: the web has no push. Card from apps/web/src/components/account/AccountSettings.tsx Invitations, switch from TopicSubscriptionsTable's Emails column, at 375px",
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
	args: {
		switchStates: toNotificationSwitchStates({
			pushPermission: "granted",
			pushPreferences: { isTopicPushEnabled: true, isChatMentionPushEnabled: false },
			savingKind: null,
		}),
	},
}
export const Saving: Story = {
	args: {
		switchStates: toNotificationSwitchStates({
			pushPermission: "granted",
			pushPreferences: BOTH_KINDS_ON,
			savingKind: "topic-scan",
		}),
	},
}
export const SaveFailed: Story = { args: { error: SAVE_FAILED_TEXT } }
export const NeverAsked: Story = {
	args: {
		pushPermission: "undetermined",
		switchStates: toNotificationSwitchStates({
			pushPermission: "undetermined",
			pushPreferences: { isTopicPushEnabled: null, isChatMentionPushEnabled: null },
			savingKind: null,
		}),
	},
}
export const Denied: Story = {
	args: {
		pushPermission: "denied",
		switchStates: toNotificationSwitchStates({
			pushPermission: "denied",
			pushPreferences: BOTH_KINDS_ON,
			savingKind: null,
		}),
	},
}

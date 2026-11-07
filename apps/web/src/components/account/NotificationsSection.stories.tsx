// the account's Notifications card on the web: the daily notifications email's switch alone. the web has no push
import { NotificationsCard } from "@carlnotes/core/components/NotificationsSection"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { ACCOUNT_FIELD_ELEMENTS } from "./AccountFields"

const meta = {
	title: "Account/NotificationsSection",
	component: NotificationsCard,
	args: {
		elements: ACCOUNT_FIELD_ELEMENTS,
		notificationsEmailSwitchState: { isChecked: true, isDisabled: false },
		onNotificationsEmailChange: fn(),
		error: null,
	},
	argTypes: { elements: { control: false }, push: { control: false }, onNotificationsEmailChange: { control: false } },
	parameters: { session: "user" },
} satisfies Meta<typeof NotificationsCard>

export default meta
type Story = StoryObj<typeof meta>

// the email on
export const EmailOn: Story = {}

// the email turned off
export const EmailOff: Story = { args: { notificationsEmailSwitchState: { isChecked: false, isDisabled: false } } }

// a save in flight disables the switch
export const Saving: Story = { args: { notificationsEmailSwitchState: { isChecked: true, isDisabled: true } } }

// a save that failed leaves the switch at its saved value and says so
export const SaveFailed: Story = { args: { error: SAVE_FAILED_TEXT } }

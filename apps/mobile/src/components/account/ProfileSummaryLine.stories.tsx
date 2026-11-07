// the line under a profile's name, with and without the user block
import type { Meta, StoryObj } from "@storybook/react-native"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

const meta: Meta<typeof ProfileSummaryLine> = {
	title: "Account/ProfileSummaryLine",
	component: ProfileSummaryLine,
	args: { profile: { joinedAt: "2026-08-14T12:00:00Z", subscriberCount: 20, isBlocked: false } },
}

export default meta
type Story = StoryObj<typeof meta>

// a profile the user has not blocked
export const Default: Story = {}

// a profile the user blocked links to the account page's list
export const Blocked: Story = {
	args: { profile: { joinedAt: "2026-08-14T12:00:00Z", subscriberCount: 20, isBlocked: true } },
}

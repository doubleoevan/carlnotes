import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { InviteNotice } from "./InviteNotice"

// the invitation screen's notice in each of its states, to check against the web's invite page
const meta: Meta<typeof InviteNotice> = {
	title: "Invite/InviteNotice",
	component: InviteNotice,
	args: { isInviteAcceptFailed: false, inviteRejection: null, onRetry: () => {} },
	decorators: [
		(Story) => (
			<View className="w-full px-4 py-6">
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/pages/InvitePage.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>

// the check in progress, a failed request with its retry, and each way a token is rejected
export const Checking: Story = {}
export const Failed: Story = { args: { isInviteAcceptFailed: true } }
export const Expired: Story = { args: { inviteRejection: "expired" } }
export const Exhausted: Story = { args: { inviteRejection: "exhausted" } }
export const Unknown: Story = { args: { inviteRejection: "unknown" } }
export const TeamFull: Story = { args: { inviteRejection: "teamFull" } }

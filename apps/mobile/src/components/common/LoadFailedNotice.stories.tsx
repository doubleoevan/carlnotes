import type { Meta, StoryObj } from "@storybook/react-native"
import { LoadFailedNotice } from "./LoadFailedNotice"

// each screen's failed-read message and retry label
const meta = {
	title: "Common/LoadFailedNotice",
	component: LoadFailedNotice,
	parameters: { webReference: "apps/web/src/pages/TeamsPage.tsx" },
	args: { message: "Teams didn't load.", retryLabel: "Retry loading teams", onRetry: () => {} },
} satisfies Meta<typeof LoadFailedNotice>
export default meta
type Story = StoryObj<typeof meta>
export const Teams: Story = {}
export const Team: Story = { args: { message: "Team didn't load.", retryLabel: "Retry loading team" } }
export const Profile: Story = { args: { message: "Profile didn't load.", retryLabel: "Retry loading profile" } }
export const ProfileTopics: Story = { args: { message: "Topics didn't load.", retryLabel: "Retry loading topics" } }
export const Account: Story = { args: { message: "Account didn't load.", retryLabel: "Retry loading account" } }
export const Activity: Story = { args: { message: "Activity didn't load.", retryLabel: "Retry loading activity" } }
export const Conversations: Story = {
	args: { message: "Your conversations didn't load.", retryLabel: "Retry loading conversations" },
}

import { TEST_SUBSCRIPTIONS, TEST_TOPIC_INVITES } from "@carlnotes/contracts/activityTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { ActivitySections } from "./ActivitySections"

// the loaded Activity sections, their empty cards for the user, and the plain empty lines an admin reads
const meta = {
	title: "Activity/ActivitySections",
	component: ActivitySections,
	args: {
		activity: { subscriptions: TEST_SUBSCRIPTIONS, invites: TEST_TOPIC_INVITES },
		isOwnView: true,
		onReload: fn(),
	},
	parameters: { session: "user" },
} satisfies Meta<typeof ActivitySections>
export default meta
type Story = StoryObj<typeof meta>
export const Loaded: Story = {}
export const Empty: Story = { args: { activity: { subscriptions: [], invites: [] } } }
export const AdminEmpty: Story = {
	args: { activity: { subscriptions: [], invites: [] }, isOwnView: false },
	parameters: { session: "admin" },
}

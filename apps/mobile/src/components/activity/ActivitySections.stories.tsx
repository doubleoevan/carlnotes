import { TEST_SUBSCRIPTIONS, TEST_TOPIC_INVITES } from "@carlnotes/contracts/activityTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ActivitySections } from "./ActivitySections"

// the loaded Activity sections and their empty cards, as the web's stories show them
const meta = {
	title: "Activity/ActivitySections",
	component: ActivitySections,
	parameters: { webReference: "apps/web/src/components/activity/ActivitySections.tsx at 375px" },
	args: {
		activity: { subscriptions: TEST_SUBSCRIPTIONS, invites: TEST_TOPIC_INVITES },
		onReload: () => undefined,
	},
} satisfies Meta<typeof ActivitySections>
export default meta
type Story = StoryObj<typeof meta>
export const Loaded: Story = {}
export const Empty: Story = { args: { activity: { subscriptions: [], invites: [] } } }
